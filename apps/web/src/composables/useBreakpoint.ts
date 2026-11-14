import { onMounted, onUnmounted, ref } from 'vue'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

/** 断点约定：<640px 手机，640–1024px 平板，≥1024px 桌面（与新系统开发文档 3.2 节一致）。 */
export function useBreakpoint() {
  const breakpoint = ref<Breakpoint>('desktop')

  function update() {
    const w = window.innerWidth
    if (w < 640) breakpoint.value = 'mobile'
    else if (w < 1024) breakpoint.value = 'tablet'
    else breakpoint.value = 'desktop'
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update)
  })
  onUnmounted(() => window.removeEventListener('resize', update))

  return { breakpoint }
}
