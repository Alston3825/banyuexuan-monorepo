<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const breakpoint = ref('desktop')

function updateBreakpoint() {
  const w = window.innerWidth
  if (w < 640) breakpoint.value = 'mobile (< 640px)'
  else if (w < 1024) breakpoint.value = 'tablet (640–1024px)'
  else breakpoint.value = 'desktop (≥ 1024px)'
}

onMounted(() => {
  updateBreakpoint()
  window.addEventListener('resize', updateBreakpoint)
})
onUnmounted(() => window.removeEventListener('resize', updateBreakpoint))
</script>

<template>
  <main class="shell">
    <h1>伴月轩月子中心管理系统</h1>
    <p class="subtitle">P0 骨架占位页 — apps/web</p>
    <p class="breakpoint">当前响应式断点：<strong>{{ breakpoint }}</strong></p>
  </main>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  text-align: center;
  padding: 1.5rem;
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
h1 {
  font-size: clamp(1.5rem, 4vw, 2.25rem);
  color: #1f3a5f;
  margin: 0;
}
.subtitle {
  color: #666;
  margin: 0;
}
.breakpoint {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  background: #eaf1fa;
  color: #1f3a5f;
}
</style>
