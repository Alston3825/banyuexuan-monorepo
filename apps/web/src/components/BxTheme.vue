<script setup lang="ts">
/** 按 docs/设计语言.md 给一块页面套上“纸张感”主题：近黑主色、米白底、暖灰边线、陶土橙只做强调。 */
import { NConfigProvider, type GlobalThemeOverrides } from 'naive-ui'
import { bxThemeOverrides } from '../bx-theme'

defineProps<{ bare?: boolean }>()
const overrides: GlobalThemeOverrides = bxThemeOverrides
</script>

<template>
  <n-config-provider :theme-overrides="overrides" abstract>
    <div :class="bare ? '' : 'bx-page'"><slot /></div>
  </n-config-provider>
</template>
