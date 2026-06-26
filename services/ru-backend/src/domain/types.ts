export type Role = 'manager' | 'worker' | 'store_tablet';

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

export type ProductCategory = 'Йогурты' | 'Кефир, Ряженка, Снежок' | 'Молоко' | 'Сметана' | 'Творог';

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
  category: ProductCategory;
  packType: string | null;
  unitsInPack: number | null;
  packWeightKg: number | null;
  shelfLifeDays: number | null;
  unitPriceRubVat: number | null;
  minStockUnits: number | null;
  maxStockUnits: number | null;
  values: Record<string, string>;
};

export type StockTable = {
  shop: Shop;
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
  stockOnHand: number | null;
  requestedPacks: number;
  requestedUnits: number;
  autoSuggested: boolean;
  status: 'new' | 'processed';
  createdAt: string;
};

export type WorkerCheckInStatus = {
  workerId: string;
  workerDisplayName: string;
  status: 'in' | 'out';
  lastChangedAt: string;
  shopId: string | null;
  shopName: string | null;
  source: 'manual' | 'tablet_qr';
  scannedByTabletId: string | null;
  scannedByTabletDisplayName: string | null;
};

export type WorkerCheckInEvent = {
  id: string;
  workerId: string;
  workerDisplayName: string;
  status: 'in' | 'out';
  eventAt: string;
  shopId: string | null;
  shopName: string | null;
  source: 'manual' | 'tablet_qr';
  scannedByTabletId: string | null;
  scannedByTabletDisplayName: string | null;
};

export type FobChallenge = {
  payload: string;
  expiresAt: string;
  refreshAfterSeconds: number;
};

export type WorkerCheckInSummary = WorkerCheckInStatus & {
  totalCheckIns: number;
  daysPresent: number;
  workedMinutes: number;
  lateDays: number;
  missingDays: number;
};

export type DailyCheckInSummary = {
  date: string;
  checkIns: number;
  workedMinutes: number;
  lateCount: number;
  missingCount: number;
};

export type CheckInStats = {
  from: string;
  to: string;
  expectedStartTime: string;
  currentlyIn: number;
  currentlyOut: number;
  totalCheckIns: number;
  workedMinutes: number;
  lateCount: number;
  missingCount: number;
  workers: WorkerCheckInSummary[];
  daily: DailyCheckInSummary[];
  events: WorkerCheckInEvent[];
};
