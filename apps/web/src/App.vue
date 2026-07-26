<script setup lang="ts">
import { NConfigProvider, NLoadingBarProvider, zhCN, dateZhCN } from 'naive-ui'
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-loading-bar-provider>
      <router-view />
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<style>
body {
  margin: 0;
  font-family:
    -apple-system,
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
}
</style>
