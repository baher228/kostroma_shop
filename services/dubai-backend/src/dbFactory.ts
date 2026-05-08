import { Pool, QueryResult, QueryResultRow } from 'pg';

export type Database = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
  close: () => Promise<void>;
};

type DatabaseOptions = {
  connectionString?: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
};

export const createDatabase = (options: DatabaseOptions): Database => {
  const pool = new Pool(
    options.connectionString
      ? {
          connectionString: options.connectionString,
          ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
        }
      : {
          host: options.host,
          port: options.port,
          user: options.user,
          password: options.password,
          database: options.database,
          ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
        },
  );

  return {
    query: <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> => pool.query<T>(text, params),
    close: async () => pool.end(),
  };
};
