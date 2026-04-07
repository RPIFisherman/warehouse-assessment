import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// Reads ALLOWED_HOSTS from .env / .env.local (comma-separated list).
// Example in .env.local: ALLOWED_HOSTS=my-tunnel.trycloudflare.com,staging.example.com
// .env.local is gitignored so your personal tunnel URL never gets committed.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = (env.ALLOWED_HOSTS || '')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean)

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') }
    },
    server: {
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
      proxy: {
        '/api': 'http://localhost:3001',
        '/uploads': 'http://localhost:3001'
      }
    }
  }
})
