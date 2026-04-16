import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from './config';

const pool = new Pool(
  config.databaseUrl
    ? {
        connectionString: config.databaseUrl,
        ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: config.dbHost,
        port: config.dbPort,
        user: config.dbUser,
        password: config.dbPassword,
        database: config.dbName,
        ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
      },
);

export const db = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> => pool.query<T>(text, params),
  close: async () => pool.end(),
};
