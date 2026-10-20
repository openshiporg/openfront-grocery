const PLACEHOLDER_VALUES = new Set([
  '',
  'change-me',
  'changeme',
  'secret',
  'test',
  'keystone',
  'keystone-test',
  'this secret should only be used in testing',
]);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value || PLACEHOLDER_VALUES.has(value.toLowerCase())) {
    throw new Error(`${name} is required and cannot use a placeholder value`);
  }
  return value;
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// Grocery runs on PostgreSQL only (advisory locks, raw SQL, Serializable
// transactions); development defaults to a local PostgreSQL database, never SQLite.
const DEVELOPMENT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/openfront_grocery';

export function getDatabaseUrl() {
  const value = isProduction() ? required('DATABASE_URL') : process.env.DATABASE_URL?.trim() || DEVELOPMENT_DATABASE_URL;
  if (!/^postgres(ql)?:\/\//i.test(value)) throw new Error('DATABASE_URL must be a PostgreSQL URL');
  return value;
}

const DEVELOPMENT_SESSION_SECRET = 'local-development-only-session-secret';
// Secrets published in this repository (the development fallback and the
// documented examples) are public knowledge and never sign production sessions.
const PUBLISHED_SESSION_SECRETS = new Set([
  DEVELOPMENT_SESSION_SECRET,
  'replace-with-at-least-32-random-characters',
  'replace-with-a-random-secret-at-least-32-characters',
]);

export function getSessionSecret() {
  const value = isProduction() ? required('SESSION_SECRET') : process.env.SESSION_SECRET || DEVELOPMENT_SESSION_SECRET;
  if (value.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  if (isProduction() && PUBLISHED_SESSION_SECRETS.has(value)) throw new Error('SESSION_SECRET must be a private random value, not a published example');
  return value;
}

export const GROCERY_STORE_ID = 'store_juniper';

export function getPublicStoreId() {
  const configuredValue = process.env.PUBLIC_STORE_ID?.trim();
  if (isProduction() && !configuredValue) {
    throw new Error('PUBLIC_STORE_ID is required in production');
  }

  const value = configuredValue || GROCERY_STORE_ID;
  if (isProduction() && value !== GROCERY_STORE_ID) {
    throw new Error(`PUBLIC_STORE_ID must match the migrated Grocery Store id ${GROCERY_STORE_ID}`);
  }
  return value;
}

export function getCanonicalSiteUrl() {
  const value = required('NEXT_PUBLIC_SITE_URL');
  const parsed = new URL(value);
  if (isProduction() && parsed.protocol !== 'https:') throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS in production');
  return value.replace(/\/$/, '');
}

export function getStorageConfig() {
  if (!isProduction()) {
    return {
      bucketName: process.env.S3_BUCKET_NAME || 'keystone-test',
      region: process.env.S3_REGION || 'ap-southeast-2',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || 'keystone',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'keystone',
      endpoint: process.env.S3_ENDPOINT || 'https://sfo3.digitaloceanspaces.com',
    };
  }
  return {
    bucketName: required('S3_BUCKET_NAME'),
    region: required('S3_REGION'),
    accessKeyId: required('S3_ACCESS_KEY_ID'),
    secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
    endpoint: required('S3_ENDPOINT'),
  };
}

export function getSessionMaxAge() {
  const configured = Number(process.env.SESSION_MAX_AGE_SECONDS || 60 * 60 * 24 * 7);
  if (!Number.isInteger(configured) || configured < 900 || configured > 60 * 60 * 24 * 30) {
    throw new Error('SESSION_MAX_AGE_SECONDS must be between 900 seconds and 30 days');
  }
  return configured;
}
