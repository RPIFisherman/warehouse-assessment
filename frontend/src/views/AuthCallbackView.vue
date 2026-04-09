<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { loginByCode } from '@/utils/auth'

const router = useRouter()
const status = ref<'working' | 'error'>('working')
const errorMsg = ref('')

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const from = params.get('state') || '/'

  if (!code) {
    status.value = 'error'
    errorMsg.value = 'Missing authorization code'
    setTimeout(() => router.replace('/login'), 1500)
    return
  }

  try {
    await loginByCode(code)
    // Strip the code from the URL so a refresh doesn't re-trigger the exchange.
    router.replace(from.startsWith('/') ? from : '/')
  } catch (e) {
    console.error('OAuth callback failed', e)
    status.value = 'error'
    errorMsg.value = e instanceof Error ? e.message : String(e)
    setTimeout(() => router.replace('/login'), 2000)
  }
})
</script>

<template>
  <div class="auth-callback">
    <template v-if="status === 'working'">
      <el-icon class="spin" :size="40"><Loading /></el-icon>
      <p>Signing you in…</p>
    </template>
    <template v-else>
      <el-icon :size="40" color="var(--el-color-danger)"><CircleCloseFilled /></el-icon>
      <p>Login failed</p>
      <p class="err">{{ errorMsg }}</p>
      <p class="hint">Redirecting to login…</p>
    </template>
  </div>
</template>

<style scoped>
.auth-callback {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
}
.spin {
  animation: spin 1s linear infinite;
}
.err {
  color: var(--el-color-danger);
  font-size: 0.875rem;
  max-width: 28rem;
  word-break: break-word;
}
.hint {
  font-size: 0.75rem;
  opacity: 0.7;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
