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

export type Shop = {
  id: string;
  name: string;
  machineNumber: number;
};

export type ProductCategory = 'Йогурты' | 'Кефир, Ряженка, Снежок' | 'Молоко' | 'Сметана' | 'Творог';

export type Product = {
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
  dashboardOverrides?: Record<string, string>;
};

export type StockTable = {
  shop: Shop;
  from: string;
  to: string;
  dates: string[];
  rows: Product[];
};

export type OrderValueEntry = {
  shopId: string;
  productId: string;
  orderDate: string;
  packs: number;
};

export type ManagedUser = SessionUser;

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

export type PromotionDocumentType = 'invoice' | 'two_month_plan' | 'retail_price_list' | 'final_table_csv';

export type PromotionDocument = {
  id: string;
  documentType: PromotionDocumentType;
  fileName: string;
  contentType: string;
  storageKey: string;
  sizeBytes: number;
  uploadedBy: string | null;
  uploadedAt: string;
};

export type PromotionRowStatus = 'past' | 'current' | 'future';

export type PromotionTableRow = {
  id: string;
  rowNumber: number;
  status: PromotionRowStatus;
  productName: string;
  startDate: string | null;
  endDate: string | null;
  promoPrice: number | null;
  regularPrice: number | null;
  priceDifference: number | null;
  realDiscountPercent: number | null;
  advertisingDiscountPercent: number | null;
  sourceDocumentId: string | null;
  sourceDocumentFileName: string | null;
  invoiceDocumentId: string | null;
  invoiceDocumentFileName: string | null;
  planDocumentId: string | null;
  planDocumentFileName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromotionRowPayload = {
  status: PromotionRowStatus;
  productName: string;
  startDate: string | null;
  endDate: string | null;
  promoPrice: number | null;
  regularPrice: number | null;
};

export type ProductPayload = {
  name: string;
  category: ProductCategory;
  packType: string;
  unitsInPack: number;
  packWeightKg: number;
  shelfLifeDays: number;
  unitPriceRubVat: number;
  minStockUnits: number;
  maxStockUnits: number;
};

export type WorkerCheckInStatus = {
  workerId: string;
  workerDisplayName: string;
  status: 'in' | 'out';
  lastChangedAt: string;
};

export type WorkerCheckInEvent = {
  id: string;
  workerId: string;
  workerDisplayName: string;
  status: 'in' | 'out';
  eventAt: string;
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
