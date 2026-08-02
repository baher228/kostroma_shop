import { z } from 'zod';
import { BUSINESS_CATEGORIES, DEFAULT_BUSINESS_CATEGORY, type BusinessCategory, ColumnKey } from '../domain/types';

const numericValue = z
  .string()
  .regex(/^\d{0,5}$/, 'Value must contain up to 5 digits.');

const stockValue = z
  .string()
  .regex(/^\d{0,2}$/, 'Stock must be in range 0-50.')
  .refine((value) => value === '' || Number.parseInt(value, 10) <= 50, {
    message: 'Stock must be in range 0-50.',
  });

const dateTimeString = z.string().datetime().optional().nullable();

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isRealDateKey = (dateKey: string): boolean => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return toDateKey(date) === dateKey;
};

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDateKey, { message: 'Invalid calendar date.' });

const isAllowedOrderDate = (dateKey: string): boolean => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return new Set([2, 4, 6]).has(date.getDay());
};

const isAllowedBusinessOrderDate = (businessCategory: BusinessCategory, dateKey: string): boolean =>
  businessCategory === 'Молоко'
    ? isAllowedOrderDate(dateKey)
    : businessCategory !== 'Деликатесы' || new Date(`${dateKey}T00:00:00`).getDay() !== 0;

const businessCategorySchema = z.enum(BUSINESS_CATEGORIES);
const productCategorySchema = z.string().trim().min(1).max(80);
const resolveBusinessCategory = (value?: BusinessCategory): BusinessCategory => value ?? DEFAULT_BUSINESS_CATEGORY;

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
  password: z.string().min(5).max(200),
});

export const createRowSchema = z.object({
  name: z.string().trim().min(2).max(140),
  businessCategory: businessCategorySchema.optional().default(DEFAULT_BUSINESS_CATEGORY),
  category: productCategorySchema,
  packType: z.string().trim().min(1).max(40),
  unitsInPack: z.number().int().positive().max(9999),
  packWeightKg: z.number().positive().max(99999),
  shelfLifeDays: z.number().int().positive().max(9999),
  unitPriceRubVat: z.number().min(0).max(999999),
  minStockUnits: z.number().int().min(0).max(999999),
  maxStockUnits: z.number().int().min(0).max(999999),
})
  .strict()
  .refine((payload) => payload.minStockUnits <= payload.maxStockUnits, {
    message: 'Min stock cannot exceed max stock.',
  });

const nullablePositiveInt = z.union([z.number().int().positive(), z.null()]);
const machineNumberSchema = z.number().int().min(1).max(3);

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
  password: z.string().min(5).max(200),
  role: z.enum(['manager', 'worker']).default('worker'),
  shopId: z.string().trim().min(1).max(100).optional().nullable(),
});

export const assignUserShopSchema = z.object({
  shopId: z.string().trim().min(1).max(100).nullable(),
});

export const createShopSchema = z.object({
  name: z.string().trim().min(2).max(140),
  machineNumber: machineNumberSchema.optional().default(1),
});

export const updateShopSchema = z
  .object({
    name: z.string().trim().min(2).max(140).optional(),
    machineNumber: machineNumberSchema.optional(),
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Empty update payload.',
  });

export const updateShopMachineSchema = z.object({
  machineNumber: machineNumberSchema,
});

export const listStockTableQuerySchema = z.object({
  shopId: z.string().trim().min(1).max(100).optional(),
  businessCategory: businessCategorySchema.optional().default(DEFAULT_BUSINESS_CATEGORY),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  range: z.enum(['week', 'year']).optional(),
});

export const upsertStockValueSchema = z.object({
  shopId: z.string().trim().min(1).max(100).optional(),
  productId: z.string().trim().min(1).max(100),
  date: dateKeySchema,
  value: z
    .string()
    .regex(/^\d{0,2}$/)
    .refine((raw) => raw === '' || Number.parseInt(raw, 10) <= 50, {
      message: 'Stock must be in range 0-50.',
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

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(140).optional(),
    businessCategory: businessCategorySchema.optional(),
    category: productCategorySchema.optional(),
    packType: z.string().trim().min(1).max(40).optional(),
    unitsInPack: z.number().int().positive().max(9999).optional(),
    packWeightKg: z.number().positive().max(99999).optional(),
    shelfLifeDays: z.number().int().positive().max(9999).optional(),
    unitPriceRubVat: z.number().min(0).max(999999).optional(),
    minStockUnits: z.number().int().min(0).max(999999).optional(),
    maxStockUnits: z.number().int().min(0).max(999999).optional(),
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Empty update payload.',
  })
  .refine(
    (payload) =>
      payload.minStockUnits === undefined ||
      payload.maxStockUnits === undefined ||
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
  businessCategory: businessCategorySchema.optional().default(DEFAULT_BUSINESS_CATEGORY),
  productId: z.string().trim().min(1).max(100),
  stockOnHand: z.number().int().min(0).max(9999).optional().nullable(),
  requestedPacks: z.number().int().min(1).max(9999),
  requestedUnits: z.number().int().min(1).max(99999),
  autoSuggested: z.boolean().optional().default(false),
  orderDate: dateKeySchema.optional(),
}).strict()
  .refine((payload) => !payload.orderDate || isAllowedBusinessOrderDate(resolveBusinessCategory(payload.businessCategory), payload.orderDate), {
    message: 'Order date is unavailable for this business category.',
  });

const sellerOrderItemSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  stockOnHand: z.number().int().min(0).max(9999).optional().nullable(),
  requestedPacks: z.number().int().min(1).max(9999),
  requestedUnits: z.number().int().min(1).max(99999),
  autoSuggested: z.boolean().optional().default(false),
}).strict();

export const createSellerOrderBulkSchema = z.object({
  shopId: z.string().trim().min(1).max(100),
  businessCategory: businessCategorySchema.optional().default(DEFAULT_BUSINESS_CATEGORY),
  orderDate: dateKeySchema,
  items: z.array(sellerOrderItemSchema).min(1).max(1000),
}).strict()
  .refine((payload) => isAllowedBusinessOrderDate(resolveBusinessCategory(payload.businessCategory), payload.orderDate), {
    message: 'Order date is unavailable for this business category.',
  })
  .refine((payload) => new Set(payload.items.map((item) => item.productId)).size === payload.items.length, {
    message: 'Order items must have unique products.',
  });

export const updateSellerOrderStatusSchema = z.object({
  status: z.enum(['new', 'processed']),
});

export const updateCheckInStatusSchema = z.object({
  status: z.enum(['in', 'out']),
});

export const orderSheetQuerySchema = z.object({
  date: dateKeySchema,
  businessCategory: businessCategorySchema.optional().default(DEFAULT_BUSINESS_CATEGORY),
}).refine((payload) => isAllowedBusinessOrderDate(payload.businessCategory, payload.date), {
  message: 'Order date is unavailable for this business category.',
});

export const upsertOrderSheetValueSchema = z.object({
  shopId: z.string().trim().min(1).max(100),
  productId: z.string().trim().min(1).max(100),
  date: dateKeySchema,
  value: z.string().regex(/^\d{0,5}$/),
});

export const subcategorySchema = z.object({
  businessCategory: businessCategorySchema,
  name: productCategorySchema,
}).strict();
