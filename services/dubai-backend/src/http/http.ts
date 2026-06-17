import { ZodError } from 'zod';

export const toValidationMessage = (error: ZodError): string =>
  error.issues.map((issue) => issue.message).join(' ');

export const toStringParam = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
