export type Role = 'manager' | 'worker' | 'store_tablet';

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

export type AudioQcRecordingQcSummary = {
  sessionId: string;
  status: 'created' | 'queued' | 'transcribing' | 'analysis_queued' | 'analyzing' | 'completed' | 'transcription_failed' | 'analysis_failed';
  latestAnalysis: {
    id: string;
    version: number;
    overallScore: number;
    qualityClass: 'good' | 'neutral' | 'bad';
    analyzedAt: string;
  } | null;
};

export type AudioQcRecordingSummary = {
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
  qc: AudioQcRecordingQcSummary | null;
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

export type AudioQcPolicyWithHeartbeat = AudioQcPolicy & {
  heartbeat: AudioQcDeviceHeartbeat | null;
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
export type TaskPhotoReviewStatus = 'none' | 'pending' | 'approved' | 'declined';

export type Task = {
  id: string;
  groupId: string | null;
  seriesId: string | null;
  instructionPhotoUrl: string | null;
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

export type TaskSeries = {
  id: string;
  title: string;
  assigneeIds: string[];
  createdById: string;
  createdByDisplayName: string;
  requiresPhotoConfirmation: boolean;
  repeat: import('./taskRepeat').TaskRepeat;
  nextDeadlineAt: string;
  instructionPhotoId: string | null;
  active: boolean;
  createdAt: string;
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
