export type Role = 'manager' | 'worker';

export type ColumnKey =
  | 'packCount'
  | 'stockTue'
  | 'orderThu'
  | 'stockWed'
  | 'stockThu'
  | 'orderSat'
  | 'stockFri'
  | 'stockSun'
  | 'orderTue'
  | 'stockMon';

export type StockValues = Record<ColumnKey, string>;

export type LegacyStockRow = {
  id: string;
  name: string;
  values: StockValues;
};

export type Shop = {
  id: string;
  name: string;
  machineNumber: number;
};

export const PRODUCT_CATEGORIES = ['Йогурты', 'Кефир, Ряженка, Снежок', 'Молоко', 'Сметана', 'Творог'] as const;
export type ProductCategory = string;
export const DEFAULT_PRODUCT_CATEGORY: ProductCategory = PRODUCT_CATEGORIES[0];
export const BUSINESS_CATEGORIES = ['Хлеб', 'Молоко', 'Деликатесы', 'Сыр', 'Мороженое'] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];
export const DEFAULT_BUSINESS_CATEGORY: BusinessCategory = 'Молоко';

export type SessionUser = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  shopId: string | null;
  shopName: string | null;
};

export type OpsScope =
  | 'shops:read'
  | 'shops:write'
  | 'stock:read'
  | 'stock:write'
  | 'products:write'
  | 'orders:read'
  | 'orders:write';

export type OpsTokenClaims = {
  role: Role;
  shopIds: string[];
  scopes: OpsScope[];
  jti: string;
};

export type UserRecord = SessionUser & {
  passwordHash: string;
};

export type StockProduct = {
  id: string;
  name: string;
  businessCategory: BusinessCategory;
  category: ProductCategory;
  packType: string | null;
  unitsInPack: number | null;
  packWeightKg: number | null;
  shelfLifeDays: number | null;
  unitPriceRubVat: number | null;
  minStockUnits: number | null;
  maxStockUnits: number | null;
};

export type StockTableRow = {
  productId: string;
  name: string;
  businessCategory: BusinessCategory;
  category: ProductCategory;
  packType: string | null;
  unitsInPack: number | null;
  packWeightKg: number | null;
  shelfLifeDays: number | null;
  unitPriceRubVat: number | null;
  minStockUnits: number | null;
  maxStockUnits: number | null;
  values: Record<string, string>;
  dashboardOverrides?: Record<string, string>;
};

export type StockTable = {
  shop: Shop;
  businessCategory: BusinessCategory;
  subcategories: ProductCategory[];
  from: string;
  to: string;
  dates: string[];
  rows: StockTableRow[];
};

export type TaskStatus = 'open' | 'done';

export type Task = {
  id: string;
  title: string;
  assigneeId: string;
  assigneeDisplayName: string;
  createdById: string;
  createdByDisplayName: string;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
  deadlineAt: string | null;
  requiresPhotoConfirmation: boolean;
  photoConfirmationUrl: string | null;
  photoConfirmedAt: string | null;
  overdue: boolean;
};

export type SupportCategory = 'technical_failure' | 'suppliers_failure' | 'client_conflict';
export type SupportThreadStatus = 'open' | 'resolved';

export type SupportMessage = {
  id: string;
  threadId: string;
  authorId: string;
  authorDisplayName: string;
  body: string;
  photoUrl: string | null;
  createdAt: string;
};

export type SupportThread = {
  id: string;
  category: SupportCategory;
  subject: string;
  createdById: string;
  createdByDisplayName: string;
  status: SupportThreadStatus;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
};

export type SellerOrder = {
  id: string;
  shopId: string;
  shopName: string | null;
  productId: string;
  productName: string;
  businessCategory: BusinessCategory;
  stockOnHand: number | null;
  requestedPacks: number;
  requestedUnits: number;
  autoSuggested: boolean;
  orderDate: string | null;
  status: 'new' | 'processed';
  createdAt: string;
};

export type WorkerCheckInStatus = {
  workerId: string;
  workerDisplayName: string;
  status: 'in' | 'out';
  lastChangedAt: string;
};
