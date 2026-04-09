// IAM OAuth2 client — wraps item.pub Central/IAM endpoints.
// All outbound calls use Node 18+ global fetch; no third-party deps.
//
// Upstream contract (see IAM 落地页接入步骤 PDF):
//   POST {domain}/oauth2/token            grant_type=authorization_code|refresh_token
//   GET  {domain}/user-info               Authorization: Bearer <access_token>
//   GET  {domain}/oauth2/logout?post_logout_redirect_uri=...
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

// Replace the first 3 %s placeholders in the template with domain, clientId, encoded redirect_uri.
// Extra %s (e.g. a scope placeholder) left in place so you can still use 4+ placeholders if the
// template ever grows — but we only substitute 3 by default to stay faithful to the PDF Java example.
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
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', REDIRECT_URI);

  const res = await fetch(`${DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': basicAuthHeader(),
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IAM token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  assertConfigured();
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);

  const res = await fetch(`${DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': basicAuthHeader(),
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IAM token refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
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

  // IAM wraps the payload: { code, msg, data: UserInfo }
  const wrapped = (await res.json()) as IamEnvelope<UserInfo>;
  if (wrapped.code !== 0) {
    throw new Error(`IAM user-info returned code ${wrapped.code}: ${wrapped.msg}`);
  }
  return wrapped.data;
}

export function isConfigured(): boolean {
  return Boolean(DOMAIN && CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}
