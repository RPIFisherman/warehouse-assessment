import { Router } from 'express';
import {
  buildAuthorizeUrl,
  buildLogoutUrl,
  exchangeCodeAndGetUser,
  refreshToken,
  getConfiguredProviders,
  validateState,
  type Provider,
} from '../auth/oauthProviders.js';

const VALID_PROVIDERS = new Set<string>(['iam', 'google', 'github']);

function asProvider(value: unknown): Provider | null {
  if (typeof value === 'string' && VALID_PROVIDERS.has(value)) return value as Provider;
  return null;
}

const router = Router();

// GET /api/auth/providers — list configured providers (frontend uses this to show buttons)
router.get('/auth/providers', (_req, res) => {
  res.json({ providers: getConfiguredProviders() });
});

// GET /api/auth/authorize-url?provider=iam|google|github
router.get('/auth/authorize-url', (req, res) => {
  try {
    const provider = asProvider(req.query.provider) || 'iam';
    res.type('text/plain').send(buildAuthorizeUrl(provider));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/auth/login-by-code
// Body: { code: string, provider?: 'iam' | 'google' | 'github' }
router.post('/auth/login-by-code', async (req, res) => {
  try {
    const { code, provider: rawProvider } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'code is required' });
    }
    // If state is provided (from OAuth callback), validate the CSRF nonce
    const state = req.body.state as string | undefined;
    let provider: Provider;
    if (state) {
      const validated = validateState(state);
      if (!validated.valid) {
        return res.status(403).json({ error: 'Invalid or expired OAuth state (CSRF protection)' });
      }
      provider = validated.provider;
    } else {
      provider = asProvider(rawProvider) || 'iam';
    }
    const result = await exchangeCodeAndGetUser(provider, code);
    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      userInfo: result.userInfo,
      provider: result.provider,
    });
  } catch (e) {
    console.error('[auth/login-by-code]', e);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// POST /api/auth/refresh-token
router.post('/auth/refresh-token', async (req, res) => {
  try {
    const { refreshToken: rt, provider: rawProvider } = req.body || {};
    if (!rt || typeof rt !== 'string') {
      return res.status(400).json({ error: 'refreshToken is required' });
    }
    const provider = asProvider(rawProvider) || 'iam';
    const token = await refreshToken(provider, rt);
    res.json(token);
  } catch (e) {
    console.error('[auth/refresh-token]', e);
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

// GET /api/auth/logout-url?provider=iam|google|github
router.get('/auth/logout-url', (req, res) => {
  try {
    const provider = asProvider(req.query.provider) || 'iam';
    res.type('text/plain').send(buildLogoutUrl(provider));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/auth/session/clear — OIDC back-channel logout (IAM server-to-server)
router.post('/auth/session/clear', (req, res) => {
  try {
    console.log('[back-channel logout]', {
      body: req.body,
      headers: { 'content-type': req.headers['content-type'] },
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
