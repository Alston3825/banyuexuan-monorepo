<script setup lang="ts">
/** 给一块页面套上“纸张”底（颜色跟随当前配色方案，见 themes.ts）。全站主题已在 App.vue 统一提供。 */
defineProps<{ bare?: boolean }>()
</script>

<template>
  <div :class="bare ? '' : 'bx-page'"><slot /></div>
</template>
