// IAM OAuth2 client — wraps item.pub Central/IAM endpoints.
// All outbound calls use Node 18+ global fetch; no third-party deps.
//
// Upstream contract (per IAM OAuth2 Onboarding SKILL.md):
//   POST {domain}/platform/oauth2/token   Content-Type: application/json, Basic Auth
//   GET  {domain}/user-info               Authorization: Bearer <access_token>
//   GET  {domain}/oauth2/logout?post_logout_redirect_uri=...
//
// IMPORTANT — IAM platform deviates from standard OAuth2 in three ways:
//   1. Token endpoint path includes /platform/ prefix
//   2. Token requests use application/json (NOT form-urlencoded)
//   3. Token request body uses camelCase field names (grantType, redirectUri)
//   4. All responses are wrapped in { code, data, msg, success } envelope
// Credentials are sent via HTTP Basic Auth (clientId:clientSecret).

const DOMAIN = (process.env.OAUTH_IAM_DOMAIN || '').replace(/\/+$/, '');
const CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || '';
const AUTHORIZE_TEMPLATE =
  process.env.OAUTH_AUTHORIZE_URL_TEMPLATE ||
  '%s/oauth2/authorize?response_type=code&client_id=%s&redirect_uri=%s';
const POST_LOGOUT_REDIRECT_URI =
  process.env.OAUTH_POST_LOGOUT_REDIRECT_URI || REDIRECT_URI;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
}

export interface UserInfo {
  id: string;
  accountId?: string;
  email: string;
  companyCode?: string;
  userName: string;
  userRoles?: Array<{ id: string; name: string; description?: string; isDefault?: boolean; roleType?: string }>;
  userRoleIds?: string[];
  userPermissions?: Array<{ name: string; title: string; app: string; group: string }>;
}

interface IamEnvelope<T> {
  code: number;
  msg: string;
  data: T;
  success: boolean;
}

function assertConfigured(): void {
  if (!DOMAIN) throw new Error('OAUTH_IAM_DOMAIN is not set');
  if (!CLIENT_ID) throw new Error('OAUTH_CLIENT_ID is not set');
  if (!CLIENT_SECRET) throw new Error('OAUTH_CLIENT_SECRET is not set');
  if (!REDIRECT_URI) throw new Error('OAUTH_REDIRECT_URI is not set');
}

function basicAuthHeader(): string {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  return `Basic ${creds}`;
}

// Replace the first 3 %s placeholders in the template with domain, clientId, redirect_uri.
function format3(template: string, a: string, b: string, c: string): string {
  let i = 0;
  return template.replace(/%s/g, () => {
    i += 1;
    if (i === 1) return a;
    if (i === 2) return b;
    if (i === 3) return c;
    return '%s';
  });
}

export function buildAuthorizeUrl(): string {
  assertConfigured();
  return format3(
    AUTHORIZE_TEMPLATE,
    DOMAIN,
    encodeURIComponent(CLIENT_ID),
    encodeURIComponent(REDIRECT_URI),
  );
}

export function buildLogoutUrl(): string {
  assertConfigured();
  const encoded = encodeURIComponent(POST_LOGOUT_REDIRECT_URI);
  return `${DOMAIN}/oauth2/logout?post_logout_redirect_uri=${encoded}`;
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  assertConfigured();
  // IAM uses JSON body with camelCase fields (not standard form-urlencoded)
  const res = await fetch(`${DOMAIN}/platform/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': basicAuthHeader(),
    },
    body: JSON.stringify({
      grantType: 'authorization_code',
      code,
      redirectUri: REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IAM token exchange failed (${res.status}): ${text}`);
  }

  // IAM wraps token response in { code, data, msg, success } envelope
  const wrapped = (await res.json()) as IamEnvelope<TokenResponse>;
  if (wrapped.code !== 0 || !wrapped.success) {
    throw new Error(`IAM token exchange returned code ${wrapped.code}: ${wrapped.msg}`);
  }
  return wrapped.data;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  assertConfigured();
  const res = await fetch(`${DOMAIN}/platform/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': basicAuthHeader(),
    },
    body: JSON.stringify({
      grantType: 'refresh_token',
      refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IAM token refresh failed (${res.status}): ${text}`);
  }

  const wrapped = (await res.json()) as IamEnvelope<TokenResponse>;
  if (wrapped.code !== 0 || !wrapped.success) {
    throw new Error(`IAM token refresh returned code ${wrapped.code}: ${wrapped.msg}`);
  }
  return wrapped.data;
}

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  assertConfigured();
  const res = await fetch(`${DOMAIN}/user-info`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IAM user-info failed (${res.status}): ${text}`);
  }

  // IAM wraps the payload: { code, msg, data: UserInfo, success }
  const wrapped = (await res.json()) as IamEnvelope<UserInfo>;
  if (wrapped.code !== 0) {
    throw new Error(`IAM user-info returned code ${wrapped.code}: ${wrapped.msg}`);
  }
  return wrapped.data;
}

export function isConfigured(): boolean {
  return Boolean(DOMAIN && CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}
