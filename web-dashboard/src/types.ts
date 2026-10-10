export type Role = 'manager' | 'worker' | 'store_tablet';

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

export type BusinessCategory = 'Хлеб' | 'Молоко' | 'Деликатесы' | 'Сыр' | 'Мороженое' | 'Курица';
export type ProductCategory = string;

export type Product = {
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
  rows: Product[];
};

export type OrderValueEntry = {
  shopId: string;
  productId: string;
  orderDate: string;
  packs: number;
};

export type ManagedUser = SessionUser;

export type TaskStatus = 'open' | 'done';
export type TaskPhotoReviewStatus = 'none' | 'pending' | 'approved' | 'declined';

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
  photoReviewStatus: TaskPhotoReviewStatus;
  photoReviewedAt: string | null;
  photoDeletesAt: string | null;
  overdue: boolean;
};

export type StoreTablet = Pick<SessionUser, 'id' | 'username' | 'firstName' | 'lastName' | 'fullName' | 'shopId'>;

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

export type OrderSheetRow = {
  productId: string;
  productName: string;
  businessCategory: BusinessCategory;
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

export type PromotionTablePreview = {
  type: 'table';
  sheets: Array<{ name: string; rows: string[][] }>;
  truncated: boolean;
};

export type GmailHealth = {
  enabled: boolean;
  authenticated: boolean;
  running: boolean;
  lastPollAt: string | null;
  lastSuccessfulPollAt: string | null;
  lastImportAt: string | null;
  lastError: string | null;
};

export type GmailImport = {
  id: string;
  filename: string;
  sender: string;
  subject: string;
  receivedAt: string | null;
  status: 'processing' | 'success' | 'failed' | 'skipped';
  error: string | null;
  retryable: boolean;
  attemptCount: number;
  promotionDocumentId: string | null;
  processedAt: string | null;
};

export type PromotionOutputs = {
  priceTag: { available: boolean };
  poster: { available: boolean; templateFileName?: string; matchScore?: number; error?: string };
};

export type PromotionBatchScope = 'current' | 'future' | 'current_and_future' | 'selected';
export type PromotionBatchRequest = {
  scope: PromotionBatchScope;
  rowNumbers?: number[];
  from?: string | null;
  to?: string | null;
  layout?: 'a4_2x2';
};

export type ProductPayload = {
  name: string;
  businessCategory: BusinessCategory;
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
