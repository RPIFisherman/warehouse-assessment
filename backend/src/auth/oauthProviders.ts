// Multi-provider OAuth — IAM, Google, GitHub.
// Each provider implements: buildAuthorizeUrl, exchangeCode, getUserInfo.
// All return a normalized UserInfo shape so the rest of the app doesn't care
// which provider the user logged in with.

import crypto from 'node:crypto';
import type { UserInfo } from './iamClient.js';
import {
  buildAuthorizeUrl as iamAuthorizeUrl,
  buildLogoutUrl as iamLogoutUrl,
  exchangeCodeForToken as iamExchangeCode,
  getUserInfo as iamGetUserInfo,
  refreshAccessToken as iamRefreshToken,
} from './iamClient.js';

export type Provider = 'iam' | 'google' | 'github';
export type { UserInfo };

const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || '';

// CSRF protection: state = provider:random_nonce. The nonce is stored in a
// short-lived in-memory set (5 min TTL) and validated on callback.
const _pendingStates = new Map<string, number>();
const STATE_TTL_MS = 5 * 60 * 1000;

export function generateState(provider: Provider): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = `${provider}:${nonce}`;
  _pendingStates.set(state, Date.now());
  // Housekeep old entries
  const now = Date.now();
  for (const [k, ts] of _pendingStates) {
    if (now - ts > STATE_TTL_MS) _pendingStates.delete(k);
  }
  return state;
}

export function validateState(state: string): { valid: boolean; provider: Provider } {
  const ts = _pendingStates.get(state);
  if (!ts) {
    // Fallback: accept bare provider name for backward compat with old bookmarks
    if (state === 'iam' || state === 'google' || state === 'github') {
      return { valid: true, provider: state };
    }
    return { valid: false, provider: 'iam' };
  }
  _pendingStates.delete(state);
  if (Date.now() - ts > STATE_TTL_MS) {
    return { valid: false, provider: 'iam' };
  }
  const provider = state.split(':')[0] as Provider;
  return { valid: true, provider };
}

// ---------------------------------------------------------------------------
// Google OAuth2 (OIDC)
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function googleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

async function googleExchangeCode(code: string): Promise<{ access_token: string; refresh_token?: string }> {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token?: string }>;
}

async function googleGetUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo failed (${res.status})`);
  const data = (await res.json()) as { sub: string; email: string; name: string; picture?: string };
  return {
    id: data.sub,
    email: data.email,
    userName: data.name,
  };
}

// ---------------------------------------------------------------------------
// GitHub OAuth
// ---------------------------------------------------------------------------

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USERINFO_URL = 'https://api.github.com/user';

function githubAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'read:user user:email',
    state,
  });
  return `${GITHUB_AUTH_URL}?${params}`;
}

async function githubExchangeCode(code: string): Promise<{ access_token: string }> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub token exchange failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (data.error) throw new Error(`GitHub: ${data.error} — ${data.error_description}`);
  if (!data.access_token) throw new Error('GitHub: missing access_token in response');
  return { access_token: data.access_token };
}

async function githubGetUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(GITHUB_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GitHub userinfo failed (${res.status})`);
  const data = (await res.json()) as { id: number; login: string; name: string | null; email: string | null; avatar_url: string };
  // GitHub email can be private — fall back to login@users.noreply.github.com
  const email = data.email || `${data.login}@users.noreply.github.com`;
  return {
    id: String(data.id),
    email,
    userName: data.name || data.login,
  };
}

// ---------------------------------------------------------------------------
// Unified API
// ---------------------------------------------------------------------------

export function isProviderConfigured(provider: Provider): boolean {
  switch (provider) {
    case 'iam': return Boolean(process.env.OAUTH_CLIENT_ID);
    case 'google': return Boolean(GOOGLE_CLIENT_ID);
    case 'github': return Boolean(GITHUB_CLIENT_ID);
  }
}

export function getConfiguredProviders(): Provider[] {
  return (['iam', 'google', 'github'] as Provider[]).filter(isProviderConfigured);
}

export function buildAuthorizeUrl(provider: Provider): string {
  const state = generateState(provider);
  switch (provider) {
    case 'iam': return iamAuthorizeUrl();
    case 'google': return googleAuthorizeUrl(state);
    case 'github': return githubAuthorizeUrl(state);
  }
}

export function buildLogoutUrl(provider: Provider): string {
  // Only IAM has a dedicated logout URL; for Google/GitHub, just redirect home.
  if (provider === 'iam') return iamLogoutUrl();
  return process.env.OAUTH_POST_LOGOUT_REDIRECT_URI || '/';
}

export async function exchangeCodeAndGetUser(provider: Provider, code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  userInfo: UserInfo;
  provider: Provider;
}> {
  switch (provider) {
    case 'iam': {
      const token = await iamExchangeCode(code);
      const userInfo = await iamGetUserInfo(token.access_token);
      return { accessToken: token.access_token, refreshToken: token.refresh_token, userInfo, provider };
    }
    case 'google': {
      const token = await googleExchangeCode(code);
      const userInfo = await googleGetUserInfo(token.access_token);
      return { accessToken: token.access_token, refreshToken: token.refresh_token, userInfo, provider };
    }
    case 'github': {
      const token = await githubExchangeCode(code);
      const userInfo = await githubGetUserInfo(token.access_token);
      return { accessToken: token.access_token, userInfo, provider };
    }
  }
}

export async function validateToken(provider: Provider, accessToken: string): Promise<UserInfo> {
  switch (provider) {
    case 'iam': return iamGetUserInfo(accessToken);
    case 'google': return googleGetUserInfo(accessToken);
    case 'github': return githubGetUserInfo(accessToken);
  }
}

export async function refreshToken(provider: Provider, refreshTokenValue: string): Promise<{
  access_token: string;
  refresh_token?: string;
}> {
  if (provider === 'iam') return iamRefreshToken(refreshTokenValue);
  // Google/GitHub: no refresh in this PoC — re-login required
  throw new Error(`Token refresh not supported for ${provider}`);
}
