<script setup lang="ts">
import BottomNav from './BottomNav.vue'
</script>

<template>
  <div class="mobile-shell">
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
}
.shell-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}
</style>
