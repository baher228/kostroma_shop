export type Role = 'manager' | 'worker';

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

export type Session = {
  token: string;
  user: SessionUser;
};

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

export type StockRow = {
  id: string;
  name: string;
  values: StockValues;
};

export type Shop = {
  id: string;
  name: string;
};

export type ProductCategory = 'Йогурты' | 'Кефир, Ряженка, Снежок' | 'Молоко' | 'Сметана' | 'Творог';

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

export type ColumnType = 'base' | 'stock' | 'order';

export type TableColumn = {
  key: ColumnKey;
  label: string;
  type: ColumnType;
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

export type Worker = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
};

export type ManagedUser = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  shopId: string | null;
  shopName: string | null;
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
  workerId: string;
  workerDisplayName: string;
  shopId: string;
  shopName: string | null;
  productId: string;
  productName: string;
  stockOnHand: number | null;
  requestedPacks: number;
  requestedUnits: number;
  autoSuggested: boolean;
  note: string | null;
  status: 'new' | 'processed';
  createdAt: string;
};

export type WorkerCheckInStatus = {
  workerId: string;
  workerDisplayName: string;
  status: 'in' | 'out';
  lastChangedAt: string;
};

export type OrderSheetRow = {
  productId: string;
  productName: string;
  category: string;
  packType: string | null;
  unitsInPack: number | null;
  packWeightKg: number | null;
  shelfLifeDays: number | null;
  unitPriceRubVat: number | null;
  shopValues: Record<string, number>;
  total: number;
};

export type OrderSheet = {
  date: string;
  shops: Shop[];
  rows: OrderSheetRow[];
};
