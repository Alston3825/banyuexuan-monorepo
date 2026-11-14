<script setup lang="ts">
import { NConfigProvider, NLoadingBarProvider, zhCN, dateZhCN } from 'naive-ui'
import { computed } from 'vue'
import { useUiStore } from './stores/ui'
import { themeOf } from './themes'

const ui = useUiStore()
const overrides = computed(() => themeOf(ui.theme).overrides)
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="overrides">
    <n-loading-bar-provider>
      <router-view />
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<style>
body {
  margin: 0;
  font-family: var(--bx-sans);
  background: var(--bx-paper);
  color: var(--bx-ink);
}
</style>
