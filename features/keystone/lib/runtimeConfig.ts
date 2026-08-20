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

export function getDatabaseUrl() {
  if (isProduction()) {
    const value = required('DATABASE_URL');
    if (!/^postgres(ql)?:\/\//i.test(value)) throw new Error('DATABASE_URL must be a PostgreSQL URL in production');
    return value;
  }
  return process.env.DATABASE_URL || 'file:./keystone.db';
}

export function getSessionSecret() {
  const value = isProduction() ? required('SESSION_SECRET') : process.env.SESSION_SECRET || 'local-development-only-session-secret';
  if (value.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return value;
}

export function getPublicStoreId() {
  const value = process.env.PUBLIC_STORE_ID?.trim() || 'store_juniper';
  if (isProduction() && value === 'store_juniper' && !process.env.PUBLIC_STORE_ID) throw new Error('PUBLIC_STORE_ID is required in production');
  return value;
}

export function getCanonicalSiteUrl() {
  const value = required('NEXT_PUBLIC_SITE_URL');
  const parsed = new URL(value);
  if (isProduction() && parsed.protocol !== 'https:') throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS in production');
  return value.replace(/\/$/, '');
}

export function isStripeEnabled() {
  const value = process.env.STRIPE_ENABLED?.trim().toLowerCase();
  if (isProduction() && value !== 'true' && value !== 'false') {
    throw new Error('STRIPE_ENABLED must be explicitly true or false in production');
  }
  return value === 'true';
}

export function assertProductionPaymentConfig() {
  if (!isProduction()) return;
  if (isStripeEnabled()) {
    const secretKey = required('STRIPE_SECRET_KEY');
    required('STRIPE_WEBHOOK_SECRET');
    const publishableKey = required('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
    if (!secretKey.startsWith('sk_live_')) throw new Error('STRIPE_SECRET_KEY must be a live-mode key in production');
    if (!publishableKey.startsWith('pk_live_')) throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a live-mode key in production');
  }
  if (process.env.TRUSTED_PROXY !== 'true') throw new Error('TRUSTED_PROXY=true is required in production for rate-limit identity');
  required('TRUSTED_PROXY_IDENTITY_SECRET');
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
