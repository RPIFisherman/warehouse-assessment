import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { getAccessToken, getProvider, refreshAccessToken, goToLogin } from '@/utils/auth'

const client = axios.create({ baseURL: '/api', timeout: 10000 })

// Attach the current access token to every outbound request.
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    if (!config.headers) config.headers = new AxiosHeaders()
    config.headers.set('Authorization', `Bearer ${token}`)
    config.headers.set('X-Auth-Provider', getProvider())
  }
  return config
})

// On 401, try refreshing the token exactly once, then retry the original request.
// If refresh also fails, redirect to IAM login.
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    const status = error.response?.status

    // Never try to refresh auth endpoints themselves — that loops.
    const url = original?.url || ''
    const isAuthEndpoint = url.startsWith('/auth/') || url.includes('/api/auth/')

    if (status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true
      try {
        const newToken = await refreshAccessToken()
        if (!original.headers) original.headers = new AxiosHeaders()
        original.headers.set('Authorization', `Bearer ${newToken}`)
        return client.request(original)
      } catch {
        // Refresh failed — send the user back to IAM login.
        await goToLogin()
        return Promise.reject(error)
      }
    }
    return Promise.reject(error)
  },
)

export default client
