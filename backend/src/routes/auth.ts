import { Router } from 'express';
import {
  buildAuthorizeUrl,
  buildLogoutUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUserInfo,
} from '../auth/iamClient.js';

const router = Router();

// GET /api/auth/authorize-url
// Returns the IAM authorize URL as plain text. Frontend calls this, then
// sets window.location.href = <response body>.
router.get('/auth/authorize-url', (_req, res) => {
  try {
    res.type('text/plain').send(buildAuthorizeUrl());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/auth/login-by-code
// Body: { code: string }
// Returns: { accessToken, refreshToken, userInfo }
// Exchanges the authorization code for tokens, then fetches the user profile.
router.post('/auth/login-by-code', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'code is required' });
    }
    const token = await exchangeCodeForToken(code);
    const userInfo = await getUserInfo(token.access_token);
    res.json({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      userInfo,
    });
  } catch (e) {
    console.error('[auth/login-by-code]', e);
    res.status(401).json({ error: String(e) });
  }
});

// POST /api/auth/refresh-token
// Body: { refreshToken: string }
// Returns the raw IAM token response (underscore-style field names).
// Frontend already handles both naming conventions.
router.post('/auth/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ error: 'refreshToken is required' });
    }
    const token = await refreshAccessToken(refreshToken);
    res.json(token);
  } catch (e) {
    console.error('[auth/refresh-token]', e);
    res.status(401).json({ error: String(e) });
  }
});

// GET /api/auth/logout-url
// Returns the IAM logout URL as plain text. Frontend clears local state,
// then redirects the browser to this URL.
router.get('/auth/logout-url', (_req, res) => {
  try {
    res.type('text/plain').send(buildLogoutUrl());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/auth/session/clear
// OIDC Back-Channel Logout — IAM calls this from its servers (server-to-server)
// when a global/SSO logout happens. We ACK with 200 so IAM's logout flow succeeds.
//
// Current implementation is STATELESS: tokens live in the browser's localStorage
// and there's nothing server-side to invalidate. If you later add a server-side
// session table (e.g. to support token revocation lists or per-sid tracking),
// add the cleanup logic here and key it off the `sub` or `sid` fields from the
// logout_token JWT.
//
// TODO(security): per the OIDC Back-Channel Logout spec, verify the `logout_token`
// JWT signature using IAM's JWKS before acting on it. Without verification,
// anyone on the internet who can reach this endpoint can forge logout calls.
// For now we just log, because our stateless setup can't be "abused" this way.
router.post('/auth/session/clear', (req, res) => {
  try {
    console.log('[back-channel logout]', {
      body: req.body,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
