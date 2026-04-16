import { z } from 'zod';
import { ColumnKey } from './types';

const numericValue = z
  .string()
  .regex(/^\d{0,5}$/, 'Поле должно содержать до 5 цифр.');

const columnKeys: [ColumnKey, ...ColumnKey[]] = [
  'packCount',
  'stockTue',
  'orderThu',
  'stockWed',
  'stockThu',
  'orderSat',
  'stockFri',
  'stockSun',
  'orderTue',
  'stockMon',
];

const valuesShape = Object.fromEntries(columnKeys.map((key) => [key, numericValue.optional()])) as Record<
  ColumnKey,
  z.ZodOptional<typeof numericValue>
>;

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
});

export const createRowSchema = z.object({
  name: z.string().trim().min(2).max(140),
});

export const updateRowSchema = z
  .object({
    name: z.string().trim().min(2).max(140).optional(),
    values: z.object(valuesShape).optional(),
  })
  .refine((payload) => Boolean(payload.name || payload.values), {
    message: 'Пустое обновление.',
  });

export const idParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(240),
  assigneeId: z.string().trim().min(1).max(100),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(['open', 'done']),
});

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, 'Логин должен быть 3-32 символа: a-z, 0-9, ., _, -.'),
  displayName: z.string().trim().min(2).max(80),
  password: z.string().min(6).max(200),
  role: z.enum(['manager', 'worker']).default('worker'),
});
