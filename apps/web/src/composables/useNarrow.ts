import { onBeforeUnmount, onMounted, ref } from 'vue'

/** 手机宽度（<768px）判断：用来切换“折叠卡片 / 卡片行”等手机版排版 */
export function useNarrow(maxWidth = 767) {
  const narrow = ref(false)
  let mq: MediaQueryList | null = null
  const update = () => (narrow.value = !!mq?.matches)
  onMounted(() => {
    mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    update()
    mq.addEventListener('change', update)
  })
  onBeforeUnmount(() => mq?.removeEventListener('change', update))
  return narrow
}
