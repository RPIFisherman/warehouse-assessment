// IAM OAuth2 client-side helpers.
// Token storage lives in localStorage so sessions survive page reloads.
// The refresh flow is single-flight: if 5 parallel requests all 401 at once,
// only one /auth/refresh-token call goes out.
//
// Endpoint contract matches backend/src/routes/auth.ts:
//   GET  /api/auth/authorize-url     -> text/plain URL to redirect the browser
//   POST /api/auth/login-by-code     -> { accessToken, refreshToken, userInfo }
//   POST /api/auth/refresh-token     -> raw IAM token response (underscore fields)
//   GET  /api/auth/logout-url        -> text/plain URL to redirect the browser

const API_BASE = '/api'

export interface UserInfo {
  id: string
  accountId?: string
  email: string
  userName: string
  companyCode?: string
  userRoles?: Array<{ id: string; name: string; description?: string }>
  userRoleIds?: string[]
  userPermissions?: Array<{ name: string; title: string; app: string; group: string }>
}

// ---------- token storage ----------

const KEY_ACCESS = 'access_token'
const KEY_REFRESH = 'refresh_token'
const KEY_USER = 'user_info'
const KEY_PROVIDER = 'auth_provider'

export type AuthProvider = 'iam' | 'google' | 'github'

export function getAccessToken(): string {
  return localStorage.getItem(KEY_ACCESS) || ''
}

export function getRefreshToken(): string {
  return localStorage.getItem(KEY_REFRESH) || ''
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(KEY_ACCESS, accessToken)
  localStorage.setItem(KEY_REFRESH, refreshToken)
}

export function getProvider(): AuthProvider {
  return (localStorage.getItem(KEY_PROVIDER) as AuthProvider) || 'iam'
}

export function clearAuth(): void {
  localStorage.removeItem(KEY_ACCESS)
  localStorage.removeItem(KEY_REFRESH)
  localStorage.removeItem(KEY_USER)
  localStorage.removeItem(KEY_PROVIDER)
}

export function isLoggedIn(): boolean {
  return Boolean(getAccessToken())
}

export function getUserInfo(): UserInfo | null {
  const raw = localStorage.getItem(KEY_USER)
  return raw ? (JSON.parse(raw) as UserInfo) : null
}

function setUserInfo(info: UserInfo): void {
  localStorage.setItem(KEY_USER, JSON.stringify(info))
}

// ---------- auth flow ----------

/** Redirect the browser to a provider's login page. Never resolves. */
export async function goToLogin(provider: AuthProvider = 'iam'): Promise<never> {
  const res = await fetch(`${API_BASE}/auth/authorize-url?provider=${provider}`)
  if (!res.ok) throw new Error(`authorize-url failed: ${res.status}`)
  const url = (await res.text()).trim()
  window.location.href = url
  return new Promise<never>(() => {})
}

/** Clear local state and redirect to the provider's logout page. Never resolves. */
export async function logout(): Promise<never> {
  const provider = getProvider()
  let url = '/'
  try {
    const res = await fetch(`${API_BASE}/auth/logout-url?provider=${provider}`)
    if (res.ok) url = (await res.text()).trim()
  } catch {
    // If logout-url lookup fails, fall back to local clear + root redirect.
  }
  clearAuth()
  window.location.href = url
  return new Promise<never>(() => {})
}

/** Exchange the OAuth code for tokens. Called by the callback view. */
export async function loginByCode(code: string, provider: AuthProvider = 'iam', state?: string): Promise<{ accessToken: string; refreshToken: string; userInfo?: UserInfo; provider: AuthProvider }> {
  const res = await fetch(`${API_BASE}/auth/login-by-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, provider, state }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`login-by-code failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string; userInfo?: UserInfo; provider?: AuthProvider }
  setTokens(data.accessToken, data.refreshToken || '')
  localStorage.setItem(KEY_PROVIDER, data.provider || provider)
  if (data.userInfo) setUserInfo(data.userInfo)
  return { ...data, provider: (data.provider || provider) as AuthProvider }
}

// ---------- refresh (single-flight) ----------

let refreshPromise: Promise<string> | null = null

export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) throw new Error('no refresh token')

    const res = await fetch(`${API_BASE}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      clearAuth()
      throw new Error(`refresh-token failed: ${res.status}`)
    }
    // IAM returns underscore-style; backend proxies it as-is.
    // Support both shapes in case the backend ever normalizes.
    const data = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      accessToken?: string
      refreshToken?: string
    }
    const newAccess = data.access_token || data.accessToken || ''
    const newRefresh = data.refresh_token || data.refreshToken || refreshToken
    if (!newAccess) {
      clearAuth()
      throw new Error('refresh-token response missing access_token')
    }
    setTokens(newAccess, newRefresh)
    return newAccess
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}
