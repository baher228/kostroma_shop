import { createHash } from 'crypto';
import { config } from '../config/config';
import * as repository from '../repositories/gmailImportsRepository';
import { importPromotionDocument, ImportablePromotionDocumentType, PromotionImportPrerequisiteError } from '../services/promotionDocumentImportService';
import { classifyPromotionAttachment } from './gmailAttachmentClassifier';
import { GmailApiClient, isGmailAuthenticationError, isTemporaryGmailError, isInvalidGmailPageTokenError, sanitizedGmailError } from './gmailClient';
import { decodeGmailBase64Url, extractGmailAttachments, gmailMessageHeader, senderAddress, senderAllowed, validateGmailAttachmentType } from './gmailAttachmentParser';
import { gmailSenderAuthenticated } from './gmailSenderPolicy';

export type GmailPollResult = { messages: number; attachments: number; imported: number; skipped: number; failed: number };
export class GmailPollBusyError extends Error {
  constructor() { super('Проверка почты уже выполняется.'); this.name = 'GmailPollBusyError'; }
}
const settings = () => ({
  query: config.gmailQuery, allowedSenders: config.gmailAllowedSenders, allowedExtensions: config.gmailAllowedExtensions,
  maxMessages: config.gmailMaxMessagesPerPoll, maxAttempts: config.gmailMaxRetries,
  maxBytes: config.gmailMaxAttachmentBytes, globalDedupe: config.gmailGlobalDedupeByHash,requireAuthentication:false,
});
const dependencies = { repository, importDocument: importPromotionDocument, classify: classifyPromotionAttachment };
const queryValue = (value: string) => `"${value.replace(/["\\]/g,' ').trim()}"`;
export const buildGmailQuery = (query: string,senders: string[]) => [query,
  senders.length ? `{${senders.map((sender) => `from:${queryValue(sender)}`).join(' ')}}` : '',
].filter(Boolean).join(' ');
const receivedAt = (internalDate: string | null | undefined,dateHeader: string | null) => {
  const milliseconds = Number(internalDate);
  if (Number.isFinite(milliseconds) && milliseconds > 0) return new Date(milliseconds).toISOString();
  const date = dateHeader ? new Date(dateHeader) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null;
};

export class GmailService {
  private readonly settings: ReturnType<typeof settings>;
  private readonly deps: typeof dependencies;
  private mailbox: string;
  private readonly resolveClient?: () => Promise<{ client: GmailApiClient; mailbox: string }>;
  private readonly resolveSettings?: () => Promise<Partial<ReturnType<typeof settings>>>;
  constructor(private client: GmailApiClient | null,options: {
    settings?: Partial<ReturnType<typeof settings>>;
    dependencies?: Partial<typeof dependencies>;
    mailbox?: string;
    resolveClient?: () => Promise<{ client: GmailApiClient; mailbox: string }>;
    resolveSettings?: () => Promise<Partial<ReturnType<typeof settings>>>;
  } = {}) {
    this.settings = { ...settings(),...options.settings };
    this.deps = { ...dependencies,...options.dependencies };
    this.mailbox = options.mailbox ?? 'legacy';
    this.resolveClient = options.resolveClient;
    this.resolveSettings=options.resolveSettings;
  }

  async poll(): Promise<GmailPollResult> {
    const result = await this.deps.repository.withGmailPollLock((signal) => this.pollLocked(signal));
    if (!result) throw new GmailPollBusyError();
    return result;
  }

  private async pollLocked(signal: AbortSignal): Promise<GmailPollResult> {
    if (this.resolveSettings) Object.assign(this.settings,await this.resolveSettings());
    if (this.resolveClient) {
      const connection = await this.resolveClient();
      this.client = connection.client;
      this.mailbox = connection.mailbox;
    }
    if (!this.client) throw new Error('Gmail client unavailable.');
    if (this.settings.requireAuthentication && !this.settings.allowedSenders.length) {
      return {messages:0,attachments:0,imported:0,skipped:0,failed:0};
    }
    await this.deps.repository.recoverGmailImportObjects();
    await this.deps.repository.failExhaustedGmailImports(this.settings.maxAttempts);
    const ids = new Set<string>();
    const pages = new Set<string>();
    const query = buildGmailQuery(this.settings.query,this.settings.allowedSenders);
    const cursorKey = this.mailbox === 'legacy' ? query : JSON.stringify([this.mailbox,query]);
    let pageToken = await this.deps.repository.getGmailPollCursor(cursorKey);
    let resetCursor = false;
    do {
      const remaining = this.settings.maxMessages - ids.size;
      if (remaining <= 0) break;
      let page;
      try { page = await this.client.listMessages(query,Math.min(remaining,100),pageToken); }
      catch (error) {
        if (pageToken && !resetCursor && isInvalidGmailPageTokenError(error)) {
          pageToken=undefined; ids.clear(); pages.clear(); resetCursor=true;
          await this.deps.repository.setGmailPollCursor(cursorKey);
          page = await this.client.listMessages(query,Math.min(this.settings.maxMessages,100));
        } else {
          throw error;
        }
      }
      for (const message of page.messages) { if (ids.size < this.settings.maxMessages) ids.add(message.id); }
      pageToken = page.nextPageToken;
      if (pageToken && pages.has(pageToken)) break;
      if (pageToken) pages.add(pageToken);
    } while (pageToken);
    const summary: GmailPollResult = { messages: ids.size,attachments: 0,imported: 0,skipped: 0,failed: 0 };
    console.info('gmail messages found',{ count: ids.size });
    // Keep only metadata here. Downloaded buffers are released after validation,
    // then fetched again one at a time for import;100 ×25MB must not sit in RAM.
    const prepared: Array<{
      claimId: string; claimAttempt: number; messageId: string; attachment: ReturnType<typeof extractGmailAttachments>[number];
      sender: string; hash: string; documentType: ImportablePromotionDocumentType;
    }> = [];
    for (const messageId of ids) {
      signal.throwIfAborted();
      try {
        const message = await this.client.getMessage(messageId);
        const sender = senderAddress(gmailMessageHeader(message.payload,'From'));
        if (!senderAllowed(sender,this.settings.allowedSenders) || message.labelIds?.some(label=>['SPAM','TRASH','SENT','DRAFT'].includes(label))
          || this.settings.requireAuthentication && !gmailSenderAuthenticated(message.payload,sender)) { summary.skipped++; continue; }
        const subject = gmailMessageHeader(message.payload,'Subject') || '';
        const seen = new Set<string>();
        for (const attachment of extractGmailAttachments(message.payload)) {
          signal.throwIfAborted();
          if (seen.has(attachment.attachmentKey)) continue;
          seen.add(attachment.attachmentKey);
          summary.attachments++;
          console.info('gmail attachment found',{ messageId, attachmentKey: attachment.attachmentKey });
          const claim = await this.deps.repository.claimGmailImport({
            mailbox: this.mailbox,messageId,attachmentId: attachment.attachmentId,attachmentKey: attachment.attachmentKey,
            filename: attachment.filename,mimeType: attachment.mimeType,sender,subject,
            receivedAt: receivedAt(message.internalDate,gmailMessageHeader(message.payload,'Date')),
          },this.settings.maxAttempts);
          if (!claim) { summary.skipped++; continue; }
          try {
            const validation = validateGmailAttachmentType(attachment,this.settings.allowedExtensions);
            if (!validation.accepted || attachment.size !== null && attachment.size > this.settings.maxBytes) {
              await this.skip(claim.id,claim.attemptCount,validation.reason || 'attachment_too_large',summary);
              continue;
            }
            const buffer = await this.download(messageId,attachment);
            if (!buffer.byteLength || buffer.byteLength > this.settings.maxBytes) {
              await this.skip(claim.id,claim.attemptCount,buffer.byteLength ? 'attachment_too_large' : 'empty_attachment',summary);
              continue;
            }
            const hash = createHash('sha256').update(buffer).digest('hex');
            signal.throwIfAborted();
            await this.deps.repository.setGmailImportHash(claim.id,hash,claim.attemptCount);
            const classification = await this.deps.classify(attachment.filename,buffer);
            console.info('gmail attachment classified',{ importId: claim.id,documentType: classification.documentType,reason: classification.reason });
            if (!classification.documentType) {
              signal.throwIfAborted();
              await this.skip(claim.id,claim.attemptCount,classification.reason || 'document_structure_not_recognized',summary);
              continue;
            }
            prepared.push({ claimId: claim.id,claimAttempt: claim.attemptCount,messageId,attachment: { ...attachment,inlineData: null },sender,hash,documentType: classification.documentType });
          } catch (error) {
            signal.throwIfAborted();
            await this.fail(claim.id,claim.attemptCount,error,summary);
            if (isGmailAuthenticationError(error)) throw error;
          }
        }
      } catch (error) {
        signal.throwIfAborted();
        if (isGmailAuthenticationError(error)) throw error;
        summary.failed++;
        console.error('gmail message failed',{ messageId,error: sanitizedGmailError(error) });
      }
    }
    const priority = { retail_price_list: 0,two_month_plan: 1,invoice: 2 };
    prepared.sort((a,b) => priority[a.documentType]-priority[b.documentType]);
    for (const item of prepared) {
      signal.throwIfAborted();
      try {
        if (this.settings.globalDedupe && await this.deps.repository.hasSuccessfulGmailImportHash(item.hash,item.claimId)) {
          await this.skip(item.claimId,item.claimAttempt,'duplicate_file_hash',summary); continue;
        }
        const buffer = await this.download(item.messageId,item.attachment);
        if (createHash('sha256').update(buffer).digest('hex') !== item.hash) {
          await this.skip(item.claimId,item.claimAttempt,'attachment_content_changed',summary); continue;
        }
        await this.deps.importDocument({
          documentType: item.documentType,fileName: item.attachment.filename,contentType: item.attachment.mimeType,
          buffer,uploadedBy: `gmail:${item.sender}`,gmailImportId: item.claimId,gmailImportAttempt: item.claimAttempt,signal,
        });
        // Production importDocument records success in the same DB transaction
        // as the parser; do not create a crash gap with a second success update.
        summary.imported++;
        console.info('gmail attachment imported',{ importId: item.claimId,documentType: item.documentType });
      } catch (error) {
        signal.throwIfAborted();
        await this.fail(item.claimId,item.claimAttempt,error,summary);
        if (isGmailAuthenticationError(error)) throw error;
      }
    }
    signal.throwIfAborted();
    await this.deps.repository.setGmailPollCursor(cursorKey,pageToken);
    return summary;
  }

  private async download(messageId: string,attachment: ReturnType<typeof extractGmailAttachments>[number]) {
    let data = attachment.inlineData;
    if (data === null) {
      if (attachment.attachmentId) data = await this.client!.getAttachment(messageId,attachment.attachmentId);
      else {
        const message = await this.client!.getMessage(messageId);
        const sender=senderAddress(gmailMessageHeader(message.payload,'From'));
        if (!senderAllowed(sender,this.settings.allowedSenders) || this.settings.requireAuthentication&&!gmailSenderAuthenticated(message.payload,sender)) throw new Error('sender_changed');
        data = extractGmailAttachments(message.payload).find((item) => item.attachmentKey === attachment.attachmentKey)?.inlineData || '';
      }
    }
    // Check encoded size before allocating a decoded buffer as Gmail body.size
    // is metadata supplied by the remote message and cannot be the only bound.
    if (data.length > Math.ceil(this.settings.maxBytes / 3) * 4 + 4) throw new Error('attachment_too_large');
    return decodeGmailBase64Url(data);
  }
  private async skip(id: string,attemptCount: number,reason: string,summary: GmailPollResult) {
    await this.deps.repository.completeGmailImport(id,'skipped',{ error: reason,attemptCount });
    summary.skipped++;
    console.info('gmail attachment skipped',{ importId: id,reason });
  }
  private async fail(id: string,attemptCount: number,error: unknown,summary: GmailPollResult) {
    // If COMMIT succeeded but its response was lost, success is terminal and
    // must not be overwritten. The repository guards this update by status.
    await this.deps.repository.completeGmailImport(id,'failed',{
      error: attemptCount >= this.settings.maxAttempts ? 'Исчерпан лимит попыток импорта. Проверьте настройки и повторно загрузите документ вручную.' : sanitizedGmailError(error),
      retryable: attemptCount < this.settings.maxAttempts && (isTemporaryGmailError(error) || error instanceof PromotionImportPrerequisiteError),attemptCount,
    });
    summary.failed++;
    console.error('gmail attachment failed',{ importId: id,error: sanitizedGmailError(error) });
  }
}
