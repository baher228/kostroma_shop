const path = require('path');
const { Pool } = require(require.resolve('pg', {
  paths: [
    path.resolve(__dirname, '../ru-backend/node_modules'),
    path.resolve(__dirname, '../dubai-backend/node_modules'),
    path.resolve(__dirname, '../ru-backend'),
    path.resolve(__dirname, '../dubai-backend'),
    process.cwd(),
  ],
}));

exports.createDatabase = (options) => {
  const pool = new Pool(
    options.connectionString
      ? {
          connectionString: options.connectionString,
          ssl: options.ssl ? { rejectUnauthorized: options.sslRejectUnauthorized } : undefined,
        }
      : {
          host: options.host,
          port: options.port,
          user: options.user,
          password: options.password,
          database: options.database,
          ssl: options.ssl ? { rejectUnauthorized: options.sslRejectUnauthorized } : undefined,
        },
  );

  return {
    query: (text, params) => pool.query(text, params),
    withClient: async (callback) => {
      const client = await pool.connect();
      try {
        return await callback(client);
      } finally {
        client.release();
      }
    },
    close: async () => pool.end(),
  };
};
