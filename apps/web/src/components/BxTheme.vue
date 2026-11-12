<script setup lang="ts">
/** 按 docs/设计语言.md 给一块页面套上“纸张感”主题：近黑主色、米白底、暖灰边线、陶土橙只做强调。 */
import { NConfigProvider, type GlobalThemeOverrides } from 'naive-ui'

defineProps<{ bare?: boolean }>()
const ink = '#161615'
const paper = '#F7F5EF'
const line = '#E6E3D9'
const overrides: GlobalThemeOverrides = {
  common: {
    primaryColor: ink,
    primaryColorHover: '#3B3A37',
    primaryColorPressed: '#000000',
    primaryColorSuppl: '#3B3A37',
    errorColor: '#B4533A',
    errorColorHover: '#C96F4F',
    errorColorPressed: '#9A452F',
    errorColorSuppl: '#C96F4F',
    warningColor: '#C96F4F',
    warningColorHover: '#D68567',
    warningColorPressed: '#B4533A',
    warningColorSuppl: '#D68567',
    successColor: '#7D8B63',
    successColorHover: '#8E9B75',
    successColorPressed: '#6B7853',
    successColorSuppl: '#8E9B75',
    infoColor: '#6E97BF',
    infoColorHover: '#84A7CA',
    infoColorPressed: '#5B83AA',
    infoColorSuppl: '#84A7CA',
    textColorBase: ink,
    textColor1: ink,
    textColor2: '#2E2D2A',
    textColor3: '#86817A',
    placeholderColor: '#A8A39A',
    borderColor: line,
    dividerColor: line,
    bodyColor: paper,
    cardColor: '#FBFAF6',
    modalColor: paper,
    popoverColor: '#FBFAF6',
    inputColor: '#FBFAF6',
    hoverColor: '#EEEBE3',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    boxShadow1: '0 1px 2px rgba(22,22,21,0.06)',
    boxShadow2: '0 2px 8px rgba(22,22,21,0.08)',
    boxShadow3: '0 4px 14px rgba(22,22,21,0.10)',
    fontFamily: "Inter, -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif",
  },
  Button: { textColorPrimary: paper, textColorHoverPrimary: paper, textColorPressedPrimary: paper, textColorFocusPrimary: paper, fontWeight: '500' },
  Card: { borderColor: line, titleFontWeight: '600' },
}
</script>

<template>
  <n-config-provider :theme-overrides="overrides" abstract>
    <div :class="bare ? '' : 'bx-page'"><slot /></div>
  </n-config-provider>
</template>
