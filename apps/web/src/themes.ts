/**
 * 配色方案登记表。每个使用者可在右上角头像菜单里自选，选择按账号记在本机浏览器里。
 * 新增一套配色只需要三步（都不影响运行速度——颜色全靠浏览器原生的 CSS 变量切换，不重新加载页面）：
 *   1. 在这里加一项（key、名称、Naive UI 主题覆盖、侧边栏是否深色）；
 *   2. 在 bx-design.css 里加一段 :root[data-theme='key'] 定义 --bx-* 变量；
 *   3. 在 theme-colors.css 里加一段 :root[data-theme='key'] 定义 --c-* 变量（各页面里的零散颜色）。
 */
import type { GlobalThemeOverrides } from 'naive-ui'
import { bxThemeOverrides } from './bx-theme'

export interface ThemeDef {
  key: string
  label: string
  desc: string
  overrides: GlobalThemeOverrides | null
  darkSider: boolean
}

export const THEMES: ThemeDef[] = [
  { key: 'cloude', label: 'Cloude', desc: '纸张感 · 暖色', overrides: bxThemeOverrides, darkSider: true },
  { key: 'sample', label: 'Sample', desc: '经典 · 蓝绿', overrides: null, darkSider: false },
]
export const DEFAULT_THEME = 'cloude'
export const themeOf = (key: string | null | undefined): ThemeDef => THEMES.find((t) => t.key === key) ?? THEMES[0]

/** 把配色方案应用到页面（只是改 <html> 上的一个标记，瞬时完成） */
export function applyThemeAttr(key: string) {
  document.documentElement.dataset.theme = themeOf(key).key
}
