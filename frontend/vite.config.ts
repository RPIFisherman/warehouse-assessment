import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// Reads ALLOWED_HOSTS from .env / .env.local (comma-separated list).
// Example in .env.local: ALLOWED_HOSTS=my-tunnel.trycloudflare.com,staging.example.com
// .env.local is gitignored so your personal tunnel URL never gets committed.
//
// IMPORTANT — two separate runtimes, both get the same allowedHosts:
//   `vite` (dev):     full dev server with HMR, source maps, `/@fs/`, raw query imports.
//                     DO NOT expose over a tunnel/public URL — use for localhost-only.
//   `vite preview`:   static file server for `dist/` built output + proxy for /api, /uploads.
//                     SAFE to expose over a tunnel. Production-like, no file-system reads,
//                     no dev middleware, no HMR websocket.
//
// For tunnel exposure (Cloudflare Tunnel, ngrok, etc.) ALWAYS use `npm run build`
// then `npm run preview` — never `npm run dev`.
export default defineConfig(({ mode }) => {
  // Read env from the root .env (one dir up) + local overrides
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const allowedHosts = (env.ALLOWED_HOSTS || '')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean)

  const proxy = {
    '/api': 'http://localhost:3001',
    '/uploads': 'http://localhost:3001',
  }

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') }
    },
    server: {
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
      proxy,
    },
    preview: {
      // Match the dev server port so the same Cloudflare Tunnel ingress rule works
      // for both `vite` and `vite preview` without dashboard changes.
      port: 5173,
      strictPort: true,
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
      proxy,
    },
  }
})
