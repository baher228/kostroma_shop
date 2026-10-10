import { Express,Request,Response } from 'express';
import { requireOpsRole } from '../auth/middleware';
import { beginGmailOAuth,disconnectGmail,finishGmailOAuth,gmailOAuthConfig,GmailOAuthError } from '../gmail/gmailOAuth';
import { GmailPollBusyError } from '../gmail/gmailService';
import { pollGmailNow } from '../gmail/gmailPoller';

const cookieName = 'gmail_oauth_browser';
const cookieOptions = () => {
  const { callback } = gmailOAuthConfig();
  return { httpOnly: true,secure: callback.protocol === 'https:',sameSite: 'lax' as const,path: callback.pathname,maxAge: 10 * 60 * 1000 };
};
const cookieValue = (req: Request) => {
  const cookies = (req.headers.cookie || '').split(';').map((item) => item.trim());
  return cookies.find((item) => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
};
const scalar = (value: unknown) => typeof value === 'string' ? value : '';
const oauthFailure = (res: Response,error: unknown) => {
  const busy = error instanceof GmailPollBusyError;
  res.status(busy ? 409 : 503).json({ message: busy ? error.message : 'Подключение Gmail пока недоступно. Проверьте настройки OAuth-приложения Google.' });
};
// Only this callback is public. Authorization starts behind the manager gate;
// an expiring, one-use DB state is also bound to an HttpOnly browser cookie.
export const registerGmailOAuthCallback = (app: Express) => {
  app.get('/api/promotions/gmail/oauth/callback',async (req: Request,res: Response) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    let returnUrl: URL;
    try {
      const settings = gmailOAuthConfig();
      returnUrl = new URL('/?gmail=failed',settings.callback.origin);
      const { maxAge: _maxAge,...clearOptions } = cookieOptions();
      res.clearCookie(cookieName,clearOptions);
    } catch { res.status(503).send('Gmail OAuth is not configured.'); return; }
    try {
      if (req.query.error) throw new GmailOAuthError('authorization');
      await finishGmailOAuth(scalar(req.query.state),cookieValue(req),scalar(req.query.code));
      returnUrl.searchParams.set('gmail','connected');
      // A disconnected or recently started server begins importing immediately.
      void pollGmailNow().catch(() => {});
    } catch (error) {
      if (error instanceof GmailPollBusyError) returnUrl.searchParams.set('gmail','busy');
      // Google errors contain request credentials. Never log the original object.
    }
    res.redirect(303,returnUrl.href);
  });
};
export const registerGmailOAuthManagerRoutes = (app: Express) => {
  app.post('/api/promotions/gmail/connect',requireOpsRole('manager'),async (_req: Request,res: Response) => {
    res.setHeader('Cache-Control','no-store');
    try {
      const result = await beginGmailOAuth();
      res.cookie(cookieName,result.browser,cookieOptions());
      res.json({ authorizationUrl: result.authorizationUrl });
    } catch (error) { oauthFailure(res,error); }
  });
  app.post('/api/promotions/gmail/disconnect',requireOpsRole('manager'),async (_req: Request,res: Response) => {
    try { await disconnectGmail(); res.json({ ok: true }); }
    catch (error) { oauthFailure(res,error); }
  });
};
