import { createHash } from 'crypto';

export type GmailHeader = { name?: string | null; value?: string | null };
export type GmailMimePart = {
  partId?: string | null; mimeType?: string | null; filename?: string | null;
  headers?: GmailHeader[] | null;
  body?: { attachmentId?: string | null; data?: string | null; size?: number | null } | null;
  parts?: GmailMimePart[] | null;
};
export type GmailAttachment = {
  attachmentKey: string; attachmentId: string | null; filename: string; mimeType: string;
  size: number | null; inlineData: string | null; contentDisposition: string | null;
};

export const decodeGmailBase64Url = (value: string): Buffer => {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value) || value.replace(/=+$/, '').length % 4 === 1) {
    throw new Error('Некорректная кодировка вложения Gmail.');
  }
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
};
const headerValue = (headers: GmailHeader[] | null | undefined, name: string) =>
  headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || null;
export const gmailMessageHeader = (payload: GmailMimePart | null | undefined, name: string) => headerValue(payload?.headers, name);

export const extractGmailAttachments = (payload: GmailMimePart | null | undefined): GmailAttachment[] => {
  const attachments: GmailAttachment[] = [];
  const visit = (part: GmailMimePart, path: number[]) => {
    const filename = part.filename?.trim() || '';
    const attachmentId = part.body?.attachmentId?.trim() || null;
    // Presence matters: an empty inline attachment must be recorded as skipped.
    const inlineData = typeof part.body?.data === 'string' ? part.body.data : null;
    if (filename && (attachmentId || inlineData !== null || part.body?.size === 0)) {
      attachments.push({
        // Part identity includes MIME position, so two distinct inline parts
        // containing identical bytes remain distinct unless global hash dedupe is on.
        attachmentKey: attachmentId ? `attachment:${attachmentId}` : `inline:${part.partId || path.join('.')}:${createHash('sha256').update(filename).digest('hex')}`,
        attachmentId, filename, mimeType: part.mimeType?.trim().toLowerCase() || 'application/octet-stream',
        size: typeof part.body?.size === 'number' ? part.body.size : null,
        inlineData, contentDisposition: headerValue(part.headers, 'Content-Disposition'),
      });
    }
    part.parts?.forEach((child, index) => visit(child, [...path, index]));
  };
  if (payload) visit(payload, [0]);
  return attachments;
};

export const fileExtension = (name: string) => name.toLowerCase().match(/(\.[^.]+)$/)?.[1] ?? '';
const mimeTypes: Record<string, string[]> = {
  '.pdf': ['application/pdf', 'application/octet-stream'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/octet-stream'],
  '.xls': ['application/vnd.ms-excel','application/octet-stream'],
  '.csv': ['text/csv','text/plain','application/csv','application/octet-stream'],
};
export const validateGmailAttachmentType = (
  attachment: Pick<GmailAttachment,'filename'|'mimeType'>,
  allowedExtensions: string[],
): { accepted: boolean; reason?: string } => {
  if (attachment.mimeType.startsWith('image/')) return { accepted: false, reason: 'signature_image' };
  const extension = fileExtension(attachment.filename);
  if (!allowedExtensions.includes(extension) || !mimeTypes[extension]) return { accepted: false, reason: 'unsupported_extension' };
  const mime = attachment.mimeType.split(';')[0].trim();
  if (!mimeTypes[extension].includes(mime)) return { accepted: false, reason: 'mime_type_mismatch' };
  return { accepted: true };
};

export const senderAddress = (header: string | null) => {
  if (!header || /[\r\n]/.test(header)) return '';
  const match = header.match(/^[^<>]*<([^<>]+)>\s*$/);
  const address = (match?.[1] || header).trim().toLowerCase();
  return /^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(address) ? address : '';
};
export const senderAllowed = (sender: string, whitelist: string[]) => Boolean(sender) && (!whitelist.length || whitelist.includes(sender));
