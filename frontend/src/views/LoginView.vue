<script setup lang="ts">
import { ref, onMounted } from "vue";
import { goToLogin, type AuthProvider } from "@/utils/auth";

const loading = ref<AuthProvider | null>(null);
const errorMsg = ref("");
const providers = ref<AuthProvider[]>([]);

const providerInfo: Record<string, { label: string; icon: string; color: string }> = {
  iam: {
    label: "Sign in with IAM",
    icon: "OfficeBuilding",
    color: "var(--bg-brand-primary)",
  },
  google: { label: "Sign in with Google", icon: "ChromeFilled", color: "#4285f4" },
  github: { label: "Sign in with GitHub", icon: "Link", color: "#24292f" },
};

onMounted(async () => {
  try {
    const res = await fetch("/api/auth/providers");
    if (res.ok) {
      const data = await res.json();
      providers.value = data.providers || ["iam"];
    }
  } catch {
    providers.value = ["iam"];
  }
});

async function signIn(provider: AuthProvider) {
  loading.value = provider;
  errorMsg.value = "";
  try {
    await goToLogin(provider);
  } catch (e) {
    loading.value = null;
    errorMsg.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <div class="login-view">
    <div class="card">
      <h1>Warehouse Assessment</h1>
      <p class="subtitle">Mobile-first facility walkthrough</p>

      <div class="btn-stack">
        <el-button
          v-for="p in providers"
          :key="p"
          type="primary"
          size="large"
          :loading="loading === p"
          :disabled="loading !== null && loading !== p"
          class="sign-in-btn"
          :style="{ '--btn-bg': providerInfo[p]?.color }"
          @click="signIn(p)"
        >
          <el-icon><component :is="providerInfo[p]?.icon || 'User'" /></el-icon>
          {{ providerInfo[p]?.label || `Sign in with ${p}` }}
        </el-button>
      </div>

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
.btn-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.sign-in-btn {
  width: 100%;
  height: 48px;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 10px;
  border: none;
  background-color: var(--btn-bg, var(--el-color-primary)) !important;
  color: #fff !important;
  /* Override Element Plus default `.el-button+.el-button { margin-left: 12px }`
     that shifts Google + GitHub buttons right because they follow IAM in a
     vertical stack. .btn-stack already uses `gap`, no margin needed. */
  margin-left: 0 !important;
}
.err {
  color: var(--el-color-danger);
  font-size: 0.875rem;
  word-break: break-word;
}
</style>
