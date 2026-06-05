exports.parsePort = (value, fallback = 4000) => {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
};

exports.parseBoolean = (value, fallback) => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
};

exports.trimToUndefined = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

exports.insecureFallback = ({ value, fallback, label, isProduction }) => {
  const resolved = exports.trimToUndefined(value) ?? fallback;
  if (isProduction && resolved === fallback) {
    throw new Error(`${label} must be set in production.`);
  }
  return resolved;
};

exports.resolveCorsOrigin = ({ value, isProduction }) => {
  const resolved = exports.trimToUndefined(value) ?? '*';
  if (isProduction && resolved === '*') {
    throw new Error('CORS_ORIGIN must be explicitly configured in production.');
  }
  return resolved;
};

exports.requireDatabaseSetting = ({ value, label, fallback, isProduction }) => {
  const resolved = exports.trimToUndefined(value) ?? fallback;
  if (!resolved) {
    throw new Error(`${label} must be set.`);
  }
  if (isProduction && fallback && resolved === fallback) {
    throw new Error(`${label} must be explicitly configured in production.`);
  }
  return resolved;
};
