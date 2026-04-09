<script setup lang="ts">
import { computed, ref } from 'vue'
import BottomNav from './BottomNav.vue'
import { getUserInfo, logout } from '@/utils/auth'

const user = ref(getUserInfo())

const displayName = computed(() => user.value?.userName || user.value?.email || 'User')
const email = computed(() => user.value?.email || '')
const initial = computed(() => {
  const source = user.value?.userName || user.value?.email || '?'
  return source.slice(0, 1).toUpperCase()
})

async function handleCommand(cmd: string | number | object) {
  if (cmd === 'logout') {
    await logout()
  }
}
</script>

<template>
  <div class="mobile-shell">
    <div class="top-bar">
      <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
        <button class="user-chip" type="button" :aria-label="`Signed in as ${displayName}`">
          <span class="avatar">{{ initial }}</span>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="dropdown-header">
              <div class="dropdown-name">{{ displayName }}</div>
              <div class="dropdown-email" v-if="email">{{ email }}</div>
            </div>
            <el-dropdown-item divided command="logout">
              <el-icon><SwitchButton /></el-icon>
              <span>Sign out</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <div class="shell-content">
      <router-view />
    </div>
    <BottomNav />
  </div>
</template>

<style scoped lang="scss">
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background-color: var(--bg-primary);
  max-width: 768px;
  margin: 0 auto;
  width: 100%;
  position: relative;
}
.top-bar {
  position: absolute;
  top: env(safe-area-inset-top, 0);
  right: 0;
  z-index: 100;
  padding: 0.5rem 0.75rem;
}
.user-chip {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-brand-primary, #3b82f6);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.shell-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}
</style>

<style>
.dropdown-header {
  padding: 0.5rem 1rem 0.25rem;
  min-width: 180px;
}
.dropdown-name {
  font-weight: 600;
  font-size: 0.875rem;
}
.dropdown-email {
  font-size: 0.75rem;
  opacity: 0.7;
  word-break: break-all;
}
</style>
