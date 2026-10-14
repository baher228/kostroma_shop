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

export type AudioQcRecordingMode = 'manual' | 'vad_auto';

export type AudioQcRecordingStatus =
  | 'recording'
  | 'recorded'
  | 'waiting_network'
  | 'creating_ml_session'
  | 'uploading_audio'
  | 'audio_uploaded'
  | 'starting_processing'
  | 'processing_started'
  | 'completed'
  | 'failed_retryable'
  | 'failed_permanent';

export type AudioQcDeviceHeartbeat = {
  deviceId: string;
  shopId: string;
  userId: string | null;
  appVersion: string | null;
  currentMode: AudioQcRecordingMode | null;
  queueSize: number;
  isRecording: boolean;
  lastError: string | null;
  lastUploadAt: string | null;
  lastSeenAt: string;
  online: boolean;
};

export type AudioQcPolicy = {
  enabled: boolean;
  mode: AudioQcRecordingMode;
  shopId: string;
  targetRole: 'store_tablet';
  maxSegmentDurationSec: number;
  silenceToStopSec: number;
  preRollSec: number;
  uploadImmediately: boolean;
  updatedAt: string;
};

export type AudioQcPolicyWithHeartbeat = AudioQcPolicy & {
  heartbeat: AudioQcDeviceHeartbeat | null;
};

export type QualityClass = 'good' | 'neutral' | 'bad';

export type QcSessionStatus =
  | 'created'
  | 'queued'
  | 'transcribing'
  | 'analysis_queued'
  | 'analyzing'
  | 'completed'
  | 'transcription_failed'
  | 'analysis_failed';

export type AudioQcLatestAnalysis = {
  id: string;
  version: number;
  overallScore: number;
  qualityClass: QualityClass;
  analyzedAt: string;
};

export type AudioQcRecordingQc = {
  sessionId: string;
  status: QcSessionStatus;
  latestAnalysis: AudioQcLatestAnalysis | null;
};

export type AudioQcRecording = {
  localRecordingId: string;
  mlSessionId: string | null;
  jobId: string | null;
  shopId: string;
  sellerId: string | null;
  shiftId: string | null;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  appVersion: string;
  timezone: string;
  recordingMode: AudioQcRecordingMode;
  durationSec: number | null;
  fileSizeBytes: number | null;
  status: AudioQcRecordingStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  qc: AudioQcRecordingQc | null;
};

export type AudioQcRecordingsPage = {
  recordings: AudioQcRecording[];
  total: number;
};

export type QcSession = {
  id: string;
  shopId: string;
  sellerId: string | null;
  shiftId: string | null;
  createdBy: string;
  externalSessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: QcSessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type QcJob = {
  id: string;
  sessionId: string;
  stage: 'transcription' | 'analysis';
  status: 'queued' | 'running' | 'completed' | 'failed';
  attempt: number;
  transcriptId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type QcStatus = {
  sessionId: string;
  status: QcSessionStatus;
  jobs: QcJob[];
  latestJob: QcJob | null;
};

export type QcTranscriptSegment = {
  start: number | null;
  end: number | null;
  speaker: string;
  text: string;
  confidence?: number;
};

export type QcTranscript = {
  id: string;
  transcript: {
    sessionId: string;
    language: string | null;
    duration: number | null;
    segments: QcTranscriptSegment[];
  };
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type QcCriterion = {
  score: number;
  maxScore: 10;
  status: 'good' | 'neutral' | 'needs_improvement' | 'not_applicable';
  comment: string;
};

export type QcFinding = {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string | null | Array<{ segmentIndex: number; quote: string }>;
};

export type QcStructuredResult = {
  schemaVersion: '1.0' | '1.1';
  summary: { short: string; customerIntent: string; outcome: string };
  quality: {
    overallScore: number;
    criteria: Record<'greeting' | 'politeness' | 'needsDiscovery' | 'productKnowledge' | 'objectionHandling' | 'closing' | 'scriptCompliance', QcCriterion>;
  };
  customer: {
    sentiment: 'positive' | 'neutral' | 'negative' | 'unknown';
    satisfaction: 'satisfied' | 'neutral' | 'dissatisfied' | 'unknown';
  };
  dialog: {
    hasConflict: boolean; hasComplaint: boolean; hasObjection: boolean; saleIntentDetected: boolean;
    upsellDetected?: boolean; crossSellDetected?: boolean; purchaseCompleted?: boolean;
  };
  strengths: string[];
  problems: QcFinding[];
  violations: QcFinding[];
  recommendations: string[];
};

export type QcAudioInfo = {
  available: boolean;
  mimeType: string;
  size: number;
  duration: number | null;
  retentionClass: 'standard' | 'bad' | 'interesting' | 'pinned';
  retentionReason: string;
  expiresAt: string | null;
  pinnedAt: string | null;
  deletedAt: string | null;
};

export type QcAnalysis = {
  id: string;
  sessionId: string;
  transcriptId: string;
  provider: string;
  model: string | null;
  promptVersion: string;
  scorecardVersion: string;
  schemaVersion: string;
  overallScore: number;
  qualityClass: QualityClass;
  version: number;
  customerSentiment: QcStructuredResult['customer']['sentiment'];
  customerSatisfaction: QcStructuredResult['customer']['satisfaction'];
  structuredResult: QcStructuredResult;
  metadata: Record<string, unknown>;
  analyzedAt: string;
};

export type QcOverview = {
  totalDialogs: number;
  processedDialogs: number;
  averageScore: number | string | null;
  good: number;
  neutral: number;
  bad: number;
  conflicts: number;
  complaints: number;
  violations: number;
  criticalViolations: number;
  goodPercentage: number;
  neutralPercentage: number;
  badPercentage: number;
};

export type QcTrendPoint = Omit<QcOverview, 'goodPercentage' | 'neutralPercentage' | 'badPercentage'> & {
  date: string;
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
  groupId?: string | null;
  seriesId?: string | null;
  instructionPhotoUrl?: string | null;
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

export type TaskWeekdayRepeat =
  | 'every_monday'
  | 'every_tuesday'
  | 'every_wednesday'
  | 'every_thursday'
  | 'every_friday'
  | 'every_saturday'
  | 'every_sunday';

export type TaskRepeat = 'daily' | 'every_2_days' | 'weekly' | TaskWeekdayRepeat;

export type TaskSeries = {
  id: string;
  title: string;
  assigneeIds: string[];
  repeat: TaskRepeat;
  nextDeadlineAt: string;
  active: boolean;
  createdAt: string;
};

export type StoreTablet = Pick<SessionUser, 'id' | 'username' | 'firstName' | 'lastName' | 'fullName' | 'shopId' | 'shopName'>;

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
  canSend?: boolean;
  configured?: boolean;
  connected?: boolean;
  email?: string | null;
  enabled: boolean;
  authenticated: boolean;
  running: boolean;
  lastPollAt: string | null;
  lastSuccessfulPollAt: string | null;
  lastImportAt: string | null;
  lastError: string | null;
};

export type GmailDeliverySettings = { recipient: string | null; allowedSenders: string[]; autoSend: boolean };
export type GmailDelivery = {
  id:string; mailbox:string; status:'queued'|'preparing'|'ready'|'sending'|'sent'|'failed'|'unknown';
  manual:boolean;recipient:string|null;downloadAvailable:boolean;error:string|null;createdAt:string;sentAt:string|null;
  manifest:{products:string[];priceTags:number;posters:number;missingPosters:string[];missingPrices:string[];files:string[]}|null;
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

export type WorkerCheckInDay = {
  date: string;
  present: boolean;
  firstInAt: string | null;
  lastOutAt: string | null;
  workedMinutes: number;
  late: boolean;
  missingCheckOut: boolean;
};

export type WorkerCheckInSummary = WorkerCheckInStatus & {
  totalCheckIns: number;
  daysPresent: number;
  workedMinutes: number;
  lateDays: number;
  missingDays: number;
  missingCheckOuts: number;
  days: WorkerCheckInDay[];
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
  missingCheckOuts: number;
  workers: WorkerCheckInSummary[];
  daily: DailyCheckInSummary[];
  events: WorkerCheckInEvent[];
};
