<script setup lang="ts">
import { ref } from 'vue'
import { goToLogin } from '@/utils/auth'

const loading = ref(false)
const errorMsg = ref('')

async function signIn() {
  loading.value = true
  errorMsg.value = ''
  try {
    await goToLogin()
  } catch (e) {
    loading.value = false
    errorMsg.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="login-view">
    <div class="card">
      <h1>Warehouse Assessment</h1>
      <p class="subtitle">Mobile-first facility walkthrough</p>

      <el-button
        type="primary"
        size="large"
        :loading="loading"
        class="sign-in-btn"
        @click="signIn"
      >
        Sign in with IAM
      </el-button>

      <p v-if="errorMsg" class="err">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.card {
  max-width: 24rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  text-align: center;
}
h1 {
  font-size: 1.75rem;
  margin: 0;
}
.subtitle {
  margin: 0;
  opacity: 0.7;
}
.sign-in-btn {
  width: 100%;
  height: 48px;
  font-size: 1rem;
}
.err {
  color: var(--el-color-danger);
  font-size: 0.875rem;
  word-break: break-word;
}
</style>
