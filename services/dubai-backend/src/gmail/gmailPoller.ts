import { config } from '../config/config';
import { createGmailClient, isGmailAuthenticationError, sanitizedGmailError } from './gmailClient';
import { GmailPollBusyError, GmailPollResult, GmailService } from './gmailService';
import { getLastSuccessfulGmailImportAt } from '../repositories/gmailImportsRepository';

export type GmailHealth = {
  enabled: boolean; authenticated: boolean; running: boolean;
  lastPollAt: string | null; lastSuccessfulPollAt: string | null;
  lastImportAt: string | null; lastError: string | null;
};
export class GmailDisabledError extends Error {
  constructor() { super('Автоматическая проверка Gmail отключена.'); this.name = 'GmailDisabledError'; }
}
export class GmailPoller {
  private readonly health: GmailHealth;
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private service: Pick<GmailService,'poll'> | null = null;
  private active: Promise<GmailPollResult> | null = null;
  constructor(private readonly options: {
    enabled: boolean; intervalMs: number; createService: () => Pick<GmailService,'poll'>;
    lastImportAt?: () => Promise<string | null>;
  } = {
    enabled: config.gmailEnabled,intervalMs: config.gmailPollIntervalMs,
    createService: () => new GmailService(createGmailClient()),
    lastImportAt: getLastSuccessfulGmailImportAt,
  }) {
    this.health = { enabled: options.enabled,authenticated: false,running: false,lastPollAt: null,lastSuccessfulPollAt: null,lastImportAt: null,lastError: null };
  }
  getHealth(): GmailHealth { return { ...this.health }; }
  start() {
    if (!this.options.enabled || !this.stopped) return;
    this.stopped = false;
    void this.pollNow().catch(() => {});
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.active) await this.active.catch(() => {});
  }
  async pollNow(): Promise<GmailPollResult> {
    if (!this.health.enabled) throw new GmailDisabledError();
    if (this.health.running) throw new GmailPollBusyError();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.health.running = true;
    this.health.lastPollAt = new Date().toISOString();
    console.info('gmail poll started');
    this.active = (async () => {
      try {
        this.service ??= this.options.createService();
        if (!this.health.lastImportAt && this.options.lastImportAt) {
          this.health.lastImportAt = await this.options.lastImportAt();
        }
        const result = await this.service.poll();
        this.health.authenticated = true;
        this.health.lastSuccessfulPollAt = new Date().toISOString();
        if (result.imported) this.health.lastImportAt = this.health.lastSuccessfulPollAt;
        this.health.lastError = result.failed ? 'Некоторые вложения не импортированы. Проверьте историю импорта.' : null;
        console.info('gmail poll completed',result);
        return result;
      } catch (error) {
        if (isGmailAuthenticationError(error)) this.health.authenticated = false;
        if (!(error instanceof GmailPollBusyError)) {
          this.health.lastError = sanitizedGmailError(error);
          console.error('gmail poll failed',{ error: this.health.lastError });
        }
        throw error;
      } finally {
        this.health.running = false;
        this.active = null;
        if (!this.stopped && this.health.enabled) {
          this.timer = setTimeout(() => void this.pollNow().catch(() => {}),this.options.intervalMs);
          this.timer.unref();
        }
      }
    })();
    return this.active;
  }
}

const poller = new GmailPoller();
export const getGmailHealth = () => poller.getHealth();
export const startGmailPoller = () => poller.start();
export const stopGmailPoller = () => poller.stop();
export const pollGmailNow = () => poller.pollNow();
