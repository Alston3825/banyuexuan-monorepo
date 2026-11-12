<script setup lang="ts">
import { NConfigProvider, NLoadingBarProvider, zhCN, dateZhCN } from 'naive-ui'
import { bxThemeOverrides } from './bx-theme'
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="bxThemeOverrides">
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
