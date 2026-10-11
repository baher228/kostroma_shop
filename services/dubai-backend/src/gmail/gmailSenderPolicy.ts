import type { GmailMimePart } from './gmailAttachmentParser';

export const validateEmailAddress = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Укажите корректный адрес почты.');
  const email=value.trim().toLowerCase();
  if (email.length>254 || email.includes('*') || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email) || email.startsWith('.') || email.split('@')[0].endsWith('.') || email.includes('..')) {
    throw new Error('Укажите корректный адрес почты без имени, пробелов и переносов строк.');
  }
  return email;
};

// Use the nearest Authentication-Results added by Gmail, never a later
// sender-supplied result or ARC result. A DMARC pass authenticates the From
// domain; exact addresses are separately checked against the administrator list.
export const gmailSenderAuthenticated = (payload: GmailMimePart | null | undefined,sender: string) => {
  if(payload?.headers?.filter(h=>h.name?.toLowerCase()==='from').length!==1)return false;
  const header=payload?.headers?.find(h=>h.name?.toLowerCase()==='authentication-results')?.value;
  if (!header || !/^\s*mx\.google\.com\s*;/i.test(header) || /[\r\n](?![ \t])/.test(header)) return false;
  const domain=sender.split('@')[1];
  if (!domain) return false;
  const dmarc=header.split(';').find(part=>/^\s*dmarc\s*=/i.test(part));
  if (!dmarc || !/^\s*dmarc\s*=\s*pass\b/i.test(dmarc)) return false;
  const authenticatedDomain=dmarc.match(/\bheader\.from\s*=\s*([a-z0-9.-]+)/i)?.[1]?.toLowerCase();
  return authenticatedDomain===domain;
};
