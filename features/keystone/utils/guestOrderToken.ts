import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'v2';
const LEGACY_TOKEN_VERSION = 'v1';
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const CLOCK_SKEW_SECONDS = 5 * 60;

function tokenSecret() {
  return process.env.SESSION_SECRET || 'this secret should only be used in testing';
}

function maxAgeSeconds() {
  const configured = Number.parseInt(process.env.GUEST_ORDER_TOKEN_MAX_AGE_SECONDS || '', 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_AGE_SECONDS;
}

function v2Signature(orderId: string, sessionId: string, issuedAtSeconds: number) {
  return createHmac('sha256', tokenSecret())
    .update(`${TOKEN_VERSION}:${orderId}:${sessionId}:${issuedAtSeconds}`)
    .digest('base64url');
}

function v1Signature(orderId: string, sessionId: string) {
  return createHmac('sha256', tokenSecret())
    .update(`${LEGACY_TOKEN_VERSION}:${orderId}:${sessionId}`)
    .digest('base64url');
}

function signaturesMatch(expectedSignature: string, suppliedSignature: string) {
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function createGuestOrderToken(
  orderId: string,
  sessionId: string,
  issuedAtSeconds = Math.floor(Date.now() / 1000)
) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error('Guest order token requires a session ID');
  }
  if (!Number.isSafeInteger(issuedAtSeconds) || issuedAtSeconds <= 0) {
    throw new Error('Guest order token requires a valid issue time');
  }
  return `${TOKEN_VERSION}.${issuedAtSeconds}.${v2Signature(
    orderId,
    normalizedSessionId,
    issuedAtSeconds
  )}`;
}

export function verifyGuestOrderToken(
  orderId: string,
  sessionId: string,
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  orderCreatedAt?: Date | string | null
) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) return false;

  const parts = token.split('.');
  if (parts[0] === TOKEN_VERSION) {
    const issuedAtSeconds = Number.parseInt(parts[1] || '', 10);
    const suppliedSignature = parts[2];
    if (
      parts.length !== 3 ||
      !Number.isSafeInteger(issuedAtSeconds) ||
      issuedAtSeconds <= 0 ||
      !suppliedSignature ||
      issuedAtSeconds > nowSeconds + CLOCK_SKEW_SECONDS ||
      nowSeconds - issuedAtSeconds > maxAgeSeconds()
    ) {
      return false;
    }

    return signaturesMatch(
      v2Signature(orderId, normalizedSessionId, issuedAtSeconds),
      suppliedSignature
    );
  }

  if (parts[0] === LEGACY_TOKEN_VERSION) {
    const suppliedSignature = parts[1];
    if (parts.length !== 2 || !suppliedSignature || !orderCreatedAt) return false;
    const createdAtSeconds = Math.floor(new Date(orderCreatedAt).getTime() / 1000);
    if (
      !Number.isSafeInteger(createdAtSeconds) ||
      createdAtSeconds <= 0 ||
      createdAtSeconds > nowSeconds + CLOCK_SKEW_SECONDS ||
      nowSeconds - createdAtSeconds > maxAgeSeconds()
    ) {
      return false;
    }
    return signaturesMatch(v1Signature(orderId, normalizedSessionId), suppliedSignature);
  }

  return false;
}
