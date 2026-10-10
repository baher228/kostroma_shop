// Run in the built container before replacing the production service. Importing
// configuration does not open a database or contact external AI providers.
try {
  const { qcConfig, validateQcConfig } = require('./config') as typeof import('./config');
  validateQcConfig();
  console.log(`QC configuration valid enabled=${qcConfig.enabled} worker=${qcConfig.workerEnabled}`);
} catch {
  // Configuration is supplied from ENV_FILE; never print its values or a raw
  // exception that may originate from dotenv or a certificate library.
  console.error('QC configuration invalid. Check required settings, endpoints, certificate bundle, thresholds and lease time.');
  process.exitCode = 1;
}
