import { ZodError } from 'zod';

export const toValidationMessage = (error: ZodError): string =>
  error.issues.map((issue) => issue.message).join(' ');

export const toStringParam = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const defaultCheckInRange = () => {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: toDateKey(start), to: toDateKey(end) };
};
