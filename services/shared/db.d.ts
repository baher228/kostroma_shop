import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

export type Database = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
  withClient: <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

export declare function createDatabase(options: {
  connectionString?: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
}): Database;
