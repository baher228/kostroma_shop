import { config } from '../config/config';
import { createDatabase } from './dbFactory';
import { AsyncLocalStorage } from 'async_hooks';
import type { PoolClient } from 'pg';

const database = createDatabase({
  connectionString: config.opsDatabaseUrl,
  host: config.opsDbHost,
  port: config.opsDbPort,
  user: config.opsDbUser,
  password: config.opsDbPassword,
  database: config.opsDbName,
  ssl: config.opsDbSsl,
  sslRejectUnauthorized: config.opsDbSslRejectUnauthorized,
});

export const createTransactionalOpsDatabase = (database: ReturnType<typeof createDatabase>) => {
  const transactions = new AsyncLocalStorage<PoolClient>();
  let savepointNumber = 0;

  // Existing repositories manage their own BEGIN/COMMIT. Within an import they
  // share its connection and use savepoints, so they cannot commit the outer unit.
  const nestedClient = (client: PoolClient): PoolClient => {
    const savepoint = `promotion_import_${++savepointNumber}`;
    return new Proxy(client, {
      get(target, property) {
        if (property === 'query') return (text: string, params?: unknown[]) => {
          const command = typeof text === 'string' ? text.trim().replace(/;$/, '').toUpperCase() : '';
          if (command === 'BEGIN') return target.query(`SAVEPOINT ${savepoint}`);
          if (command === 'COMMIT') return target.query(`RELEASE SAVEPOINT ${savepoint}`);
          if (command === 'ROLLBACK') return target.query(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => ({ rows: [] }));
          return target.query(text, params);
        };
        if (property === 'release') return () => { throw new Error('Transaction connection is owned by the import.'); };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };

  const opsDb: typeof database = {
    query: (text, params) => {
      const client = transactions.getStore();
      return client ? client.query(text, params) : database.query(text, params);
    },
    withClient: async (callback) => {
      const client = transactions.getStore();
      return client ? callback(nestedClient(client)) : database.withClient(callback);
    },
    close: () => database.close(),
  };

  const withOpsTransaction = async <T>(callback: () => Promise<T>): Promise<T> => {
    if (transactions.getStore()) throw new Error('An import transaction is already active.');
    return database.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const result = await transactions.run(client, callback);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    });
  };

  // Poll locks need a dedicated session independent of any import transaction.
  return { opsDb,withOpsTransaction,withOpsSession: database.withClient };
};

export const { opsDb,withOpsTransaction,withOpsSession } = createTransactionalOpsDatabase(database);
