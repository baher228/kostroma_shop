import { config } from './config';
import { createDatabase } from './dbFactory';

export const personalDb = createDatabase({
  connectionString: config.personalDatabaseUrl,
  host: config.personalDbHost,
  port: config.personalDbPort,
  user: config.personalDbUser,
  password: config.personalDbPassword,
  database: config.personalDbName,
  ssl: config.personalDbSsl,
  sslRejectUnauthorized: config.personalDbSslRejectUnauthorized,
});
