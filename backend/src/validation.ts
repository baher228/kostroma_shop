import { z } from 'zod';
import { ColumnKey } from './types';

const numericValue = z
  .string()
  .regex(/^\d{0,5}$/, 'Value must contain up to 5 digits.');

const stockValue = z
  .string()
  .regex(/^\d{0,2}$/, 'Stock must be in range 0-15.')
  .refine((value) => value === '' || Number.parseInt(value, 10) <= 15, {
    message: 'Stock must be in range 0-15.',
  });

const dateTimeString = z.string().datetime().optional().nullable();

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

const valuesShape = Object.fromEntries(
  columnKeys.map((key) => {
    const isStockKey =
      key === 'stockTue' ||
      key === 'stockWed' ||
      key === 'stockThu' ||
      key === 'stockFri' ||
      key === 'stockSun' ||
      key === 'stockMon';
    return [key, (isStockKey ? stockValue : numericValue).optional()];
  }),
) as Record<ColumnKey, z.ZodOptional<typeof numericValue | typeof stockValue>>;

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, 'Username must be 3-32 chars: a-z, 0-9, ., _, -.'),
  password: z.string().min(6).max(200),
});

export const createRowSchema = z.object({
  name: z.string().trim().min(2).max(140),
  category: z
    .enum([
      '\u0419\u043e\u0433\u0443\u0440\u0442\u044b',
      '\u041a\u0435\u0444\u0438\u0440, \u0420\u044f\u0436\u0435\u043d\u043a\u0430, \u0421\u043d\u0435\u0436\u043e\u043a',
      '\u041c\u043e\u043b\u043e\u043a\u043e',
      '\u0421\u043c\u0435\u0442\u0430\u043d\u0430',
      '\u0422\u0432\u043e\u0440\u043e\u0433',
    ])
    .optional(),
});

const nullablePositiveInt = z.union([z.number().int().positive(), z.null()]);

export const updateRowSchema = z
  .object({
    name: z.string().trim().min(2).max(140).optional(),
    values: z.object(valuesShape).optional(),
  })
  .refine((payload) => Boolean(payload.name || payload.values), {
    message: 'Empty update payload.',
  });

export const idParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(240),
  assigneeId: z.string().trim().min(1).max(100),
  deadlineAt: dateTimeString,
  requiresPhotoConfirmation: z.boolean().optional().default(false),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(['open', 'done']),
  photoConfirmationUrl: z.string().trim().url().optional().nullable(),
});

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, 'Username must be 3-32 chars: a-z, 0-9, ., _, -.'),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  password: z.string().min(6).max(200),
  role: z.enum(['manager', 'worker']).default('worker'),
  shopId: z.string().trim().min(1).max(100).optional().nullable(),
});

export const assignUserShopSchema = z.object({
  shopId: z.string().trim().min(1).max(100).nullable(),
});

export const createShopSchema = z.object({
  name: z.string().trim().min(2).max(140),
});

export const listStockTableQuerySchema = z.object({
  shopId: z.string().trim().min(1).max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  range: z.enum(['week', 'year']).optional(),
});

export const upsertStockValueSchema = z.object({
  shopId: z.string().trim().min(1).max(100).optional(),
  productId: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z
    .string()
    .regex(/^\d{0,2}$/)
    .refine((raw) => raw === '' || Number.parseInt(raw, 10) <= 15, {
      message: 'Stock must be in range 0-15.',
    }),
});

export const updateProductMetaSchema = z
  .object({
    unitsInPack: nullablePositiveInt.optional(),
    minStockUnits: nullablePositiveInt.optional(),
    maxStockUnits: nullablePositiveInt.optional(),
  })
  .refine(
    (payload) =>
      Object.prototype.hasOwnProperty.call(payload, 'unitsInPack') ||
      Object.prototype.hasOwnProperty.call(payload, 'minStockUnits') ||
      Object.prototype.hasOwnProperty.call(payload, 'maxStockUnits'),
    {
      message: 'Empty update payload.',
    },
  )
  .refine(
    (payload) =>
      payload.minStockUnits === undefined ||
      payload.maxStockUnits === undefined ||
      payload.minStockUnits === null ||
      payload.maxStockUnits === null ||
      payload.minStockUnits <= payload.maxStockUnits,
    {
      message: 'Min stock cannot exceed max stock.',
    },
  );

const supportBodySchema = z.string().trim().max(2000).optional();
const supportPhotoUrlSchema = z.string().trim().url().optional().nullable();

export const createSupportThreadSchema = z.object({
  category: z.enum(['technical_failure', 'suppliers_failure', 'client_conflict']),
  subject: z.string().trim().min(2).max(240),
  body: supportBodySchema,
  photoUrl: supportPhotoUrlSchema,
})
  .refine((payload) => Boolean(payload.body?.trim() || payload.photoUrl), {
    message: 'Provide text or photo for support request.',
  });

export const createSupportMessageSchema = z.object({
  body: supportBodySchema,
  photoUrl: supportPhotoUrlSchema,
})
  .refine((payload) => Boolean(payload.body?.trim() || payload.photoUrl), {
    message: 'Provide text or photo for support message.',
  });

export const createSellerOrderSchema = z.object({
  shopId: z.string().trim().min(1).max(100),
  productId: z.string().trim().min(1).max(100),
  stockOnHand: z.number().int().min(0).max(9999).optional().nullable(),
  requestedPacks: z.number().int().min(1).max(9999),
  requestedUnits: z.number().int().min(1).max(99999),
  autoSuggested: z.boolean().optional().default(false),
  note: z.string().trim().max(500).optional().nullable(),
});

export const updateCheckInStatusSchema = z.object({
  status: z.enum(['in', 'out']),
});

