// requireAuth — Express middleware that gates routes behind a valid IAM token.
//
// Strategy: we don't have IAM's JWKS URL to verify the JWT signature locally,
// so we proxy trust to IAM's /user-info endpoint — it only returns data for
// currently-valid tokens, which is itself a signature + expiry check.
//
// To keep p50 latency sane, responses are cached for 5 minutes keyed by a
// SHA-256 fingerprint of the token. The cache is strict-upper-bound at 1000
// entries; when full, we drop the 500 oldest by expiry timestamp.
//
// Tradeoff: if IAM revokes a token mid-session, we still accept it for up to
// 5 minutes. Acceptable for warehouse-assessment (human workflow app, not a
// high-value API). Tighten CACHE_TTL_MS if your threat model needs faster
// revocation propagation.

import type { RequestHandler } from 'express';
import crypto from 'node:crypto';
import { getUserInfo, type UserInfo } from './iamClient.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;

interface CacheEntry {
  user: UserInfo;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function tokenFingerprint(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function evictIfFull(): void {
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  // Drop the 500 oldest by expiry. Avoids unbounded growth if a malicious
  // client keeps throwing unique fake tokens at us (each miss still adds
  // nothing to cache, but be defensive for a valid-token storm scenario).
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (let i = 0; i < Math.floor(CACHE_MAX_ENTRIES / 2); i++) {
    cache.delete(entries[i][0]);
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserInfo;
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  const token = match[1].trim();
  if (!token) {
    res.status(401).json({ error: 'empty bearer token' });
    return;
  }

  const key = tokenFingerprint(token);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    req.user = hit.user;
    next();
    return;
  }

  try {
    const user = await getUserInfo(token);
    cache.set(key, { user, expiresAt: now + CACHE_TTL_MS });
    evictIfFull();
    req.user = user;
    next();
  } catch (e) {
    console.error('[requireAuth]', String(e));
    res.status(401).json({ error: 'invalid or expired token' });
  }
};

// Exposed for tests / manual cache flush (e.g. on back-channel logout we could
// call this to drop the user's entry immediately instead of waiting for TTL).
export function invalidateToken(token: string): void {
  cache.delete(tokenFingerprint(token));
}
