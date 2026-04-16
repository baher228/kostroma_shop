export type Role = 'manager' | 'worker';

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
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
};

export type Worker = {
  id: string;
  username: string;
  displayName: string;
};

export type ManagedUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
};
