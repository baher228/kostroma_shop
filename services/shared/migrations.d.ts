import type { Database } from './db';

export declare function runSqlMigrations(options: {
  db: Database;
  migrationsDir: string;
  lockId: number;
  label?: string;
}): Promise<void>;
