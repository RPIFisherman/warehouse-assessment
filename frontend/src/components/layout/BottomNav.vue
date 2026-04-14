<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const tabs = [
  { name: 'home', label: 'Assess', icon: 'Finished', path: '/' },
  { name: 'ai-scan', label: 'AI Scan', icon: 'VideoCamera', path: '/ai-scan' },
  { name: 'issues', label: 'Issues', icon: 'Warning', path: '/issues' },
  { name: 'history', label: 'History', icon: 'Clock', path: '/history' },
  { name: 'settings', label: 'Settings', icon: 'Setting', path: '/settings' },
]

const activeTab = computed(() => {
  if (route.path === '/ai-scan' || route.path.startsWith('/ai-scan/')) return 'ai-scan'
  if (route.path === '/issues' || route.path.startsWith('/issues/')) return 'issues'
  if (route.path === '/history') return 'history'
  if (route.path === '/settings') return 'settings'
  return 'home'
})

function navigate(tab: typeof tabs[0]) {
  router.push(tab.path)
}
</script>

<template>
  <nav class="bottom-nav">
    <button
      v-for="tab in tabs"
      :key="tab.name"
      class="nav-tab"
      :class="{ active: activeTab === tab.name }"
      @click="navigate(tab)"
    >
      <el-icon :size="22"><component :is="tab.icon" /></el-icon>
      <span class="nav-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped lang="scss">
.bottom-nav {
  display: flex;
  height: 64px;
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-primary);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  flex-shrink: 0;
}
.nav-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  transition: color 0.2s;
  &.active { color: var(--bg-brand-primary); }
}
.nav-label { font-size: 11px; font-weight: 500; }
</style>
