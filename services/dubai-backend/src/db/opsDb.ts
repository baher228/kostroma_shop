import { config } from '../config/config';
import { createDatabase } from './dbFactory';

export const opsDb = createDatabase({
  connectionString: config.opsDatabaseUrl,
  host: config.opsDbHost,
  port: config.opsDbPort,
  user: config.opsDbUser,
  password: config.opsDbPassword,
  database: config.opsDbName,
  ssl: config.opsDbSsl,
  sslRejectUnauthorized: config.opsDbSslRejectUnauthorized,
});
