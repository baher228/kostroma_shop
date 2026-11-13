import { z } from 'zod';
import { ColumnKey } from '../domain/types';
import { TASK_REPEATS } from '../domain/taskRepeat';

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

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(2).max(240),
    assigneeId: z.string().trim().min(1).max(100).optional(),
    assigneeIds: z.array(z.string().trim().min(1).max(100)).min(1).max(200).optional(),
    deadlineAt: dateTimeString,
    requiresPhotoConfirmation: z.boolean().optional().default(false),
    repeat: z.enum(['none', ...TASK_REPEATS]).optional().default('none'),
    repeatWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    repeatUtcOffsetMinutes: z.number().int().min(-14 * 60).max(14 * 60).optional(),
    instructionPhotoDataUrl: z
      .string()
      .regex(/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/, 'Invalid photo payload.')
      .optional(),
  })
  .refine((payload) => Boolean(payload.assigneeId || payload.assigneeIds?.length), {
    message: 'Choose at least one store tablet.',
  })
  .refine((payload) => payload.repeat === 'none' || Boolean(payload.deadlineAt), {
    message: 'A repeating task needs a deadline.',
  })
  .refine((payload) => payload.repeat !== 'weekdays' || Boolean(payload.repeatWeekdays?.length && payload.repeatUtcOffsetMinutes !== undefined), {
    message: 'Choose at least one weekday.',
  });

export const updateTaskStatusSchema = z.object({
  status: z.enum(['open', 'done']),
});

export const uploadTaskPhotoSchema = z.object({
  photoDataUrl: z
    .string()
    .regex(/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/, 'Invalid photo payload.'),
});

export const reviewTaskPhotoSchema = z.object({
  decision: z.enum(['approve', 'decline']),
});

export const pushTokenSchema = z.object({
  pushToken: z.string().trim().regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/),
  alarmSound: z.boolean().optional().default(false),
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
  role: z.enum(['manager', 'worker', 'store_tablet']).default('worker'),
  shopId: z.string().trim().min(1).max(100).optional().nullable(),
});

export const updateUserSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,32}$/, 'Username must be 3-32 chars: a-z, 0-9, ., _, -.')
      .optional(),
    firstName: z.string().trim().min(2).max(80).optional(),
    lastName: z.string().trim().min(2).max(80).optional(),
    role: z.enum(['manager', 'worker', 'store_tablet']).optional(),
    shopId: z.string().trim().min(1).max(100).optional().nullable(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Empty update payload.',
  });

export const updateUserPasswordSchema = z.object({
  password: z.string().min(5).max(200),
});

export const assignUserShopSchema = z.object({
  shopId: z.string().trim().min(1).max(100).nullable(),
});

export const createShopSchema = z.object({
  name: z.string().trim().min(2).max(140),
  machineNumber: machineNumberSchema.optional().default(1),
});

export const updateShopMachineSchema = z.object({
  machineNumber: machineNumberSchema,
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
}).strict();

export const updateCheckInStatusSchema = z.object({
  status: z.enum(['in', 'out']),
});

export const checkInStatsQuerySchema = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  shopId: z.string().trim().min(1).max(100).optional(),
});

export const fobScanSchema = z.object({
  payload: z.string().trim().min(8).max(500),
});

export const shopIdParamSchema = z.object({
  shopId: z.string().trim().min(1).max(100),
});

export const audioQcPolicySchema = z.object({
  enabled: z.boolean(),
  mode: z.literal('vad_auto'),
  maxSegmentDurationSec: z.number().int().min(30).max(1800).default(300),
  silenceToStopSec: z.number().int().min(1).max(30).default(10),
  preRollSec: z.number().int().min(0).max(30).default(5),
  uploadImmediately: z.boolean().default(true),
}).strict();

export const audioQcBulkPolicySchema = z.object({
  shopIds: z.array(z.string().trim().min(1).max(100)).min(1).max(500)
    .refine(ids => new Set(ids).size === ids.length, 'Shop identifiers must be unique.'),
  policy: audioQcPolicySchema,
}).strict();

export const audioQcHeartbeatSchema = z.object({
  deviceId: z.string().trim().min(3).max(160),
  shopId: z.string().trim().min(1).max(100).optional(),
  appVersion: z.string().trim().max(80).optional().nullable(),
  currentMode: z.enum(['manual', 'vad_auto']).optional().nullable(),
  queueSize: z.number().int().min(0).max(10000),
  isRecording: z.boolean(),
  lastError: z.string().trim().max(1000).optional().nullable(),
  lastUploadAt: z.string().datetime().optional().nullable(),
}).strict();

export const audioQcRecordingStatusSchema = z.enum([
  'recording',
  'recorded',
  'waiting_network',
  'creating_ml_session',
  'uploading_audio',
  'audio_uploaded',
  'starting_processing',
  'processing_started',
  'completed',
  'failed_retryable',
  'failed_permanent',
]);

export const audioQcRecordingSchema = z.object({
  localRecordingId: z.string().trim().min(3).max(200),
  mlSessionId: z.string().trim().min(1).max(200).nullable().default(null),
  jobId: z.string().trim().min(1).max(200).nullable().default(null),
  shopId: z.string().trim().min(1).max(100),
  sellerId: z.string().trim().min(1).max(160).nullable().default(null),
  shiftId: z.string().trim().min(1).max(160).nullable().default(null),
  deviceId: z.string().trim().min(3).max(160),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().default(null),
  appVersion: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).max(100),
  recordingMode: z.literal('vad_auto'),
  durationSec: z.number().int().min(0).max(86_400).nullable().default(null),
  fileSizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().default(null),
  status: audioQcRecordingStatusSchema,
  lastError: z.string().trim().max(2000).nullable().default(null),
}).strict();

export const audioQcRecordingsQuerySchema = z.object({
  shopId: z.string().trim().min(1).max(100).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict().refine((input) => !input.from || !input.to || Date.parse(input.from) <= Date.parse(input.to), {
  message: 'from must not follow to.',
  path: ['to'],
});

export const orderSheetQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const upsertOrderSheetValueSchema = z.object({
  shopId: z.string().trim().min(1).max(100),
  productId: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.string().regex(/^\d{0,5}$/),
});
