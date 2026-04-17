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

export type StockRow = {
  id: string;
  name: string;
  values: StockValues;
};

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
};

export type UserRecord = SessionUser & {
  passwordHash: string;
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
