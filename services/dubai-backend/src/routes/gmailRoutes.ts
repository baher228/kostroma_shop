import { Express, Request, Response } from 'express';
import { requireOpsRole } from '../auth/middleware';
import { GmailImportStatus, listGmailImports } from '../repositories/gmailImportsRepository';
import { getGmailHealth, GmailDisabledError, pollGmailNow } from '../gmail/gmailPoller';
import { GmailPollBusyError } from '../gmail/gmailService';
import { sanitizedGmailError } from '../gmail/gmailClient';

const statuses = new Set<GmailImportStatus>(['processing','success','failed','skipped']);
const integer = (value: unknown,fallback: number,min: number,max: number) => {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error('Некорректные параметры списка импорта.');
  return number;
};
export const registerGmailRoutes = (app: Express) => {
  app.get('/api/promotions/gmail/imports',async (req: Request,res: Response) => {
    let options: { limit: number; offset: number; status?: GmailImportStatus };
    try {
      const status = req.query.status === undefined ? undefined : String(req.query.status) as GmailImportStatus;
      if (status && !statuses.has(status)) throw new Error('Некорректный статус импорта.');
      options = { limit: integer(req.query.limit,50,1,100),offset: integer(req.query.offset,0,0,100000),status };
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Некорректные параметры.' }); return;
    }
    try { res.json({ imports: await listGmailImports(options),health: getGmailHealth() }); }
    catch { res.status(503).json({ message: 'История импорта временно недоступна.',health: getGmailHealth() }); }
  });
  app.post('/api/promotions/gmail/poll',requireOpsRole('manager'),async (_req: Request,res: Response) => {
    try { res.json({ result: await pollGmailNow(),health: getGmailHealth() }); }
    catch (error) {
      res.status(error instanceof GmailPollBusyError ? 409 : 503).json({
        message: error instanceof GmailPollBusyError || error instanceof GmailDisabledError ? error.message : sanitizedGmailError(error),
        health: getGmailHealth(),
      });
    }
  });
};
