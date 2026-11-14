import { onBeforeUnmount, watch, type Ref } from 'vue'
import { dialog } from '../utils/discrete-api'

/**
 * 表单草稿自动保存：填了一半页面被刷新/闪退/误关，重新打开同一张表单能恢复，不用重填。
 * 用法：打开表单（model 初始化好）后调用 start()；提交成功后调用 clear()。
 * 草稿存在本浏览器里（localStorage），超过 3 天自动作废；内容和空表单一样时不存。
 */
export function useFormDraft<T>(key: string, model: Ref<T>, isEmpty: (m: T) => boolean, onRestore?: (m: T) => void) {
  const storageKey = `form-draft:${key}`
  let active = false
  let timer: ReturnType<typeof setTimeout> | null = null

  function write() {
    if (!active) return
    try {
      if (isEmpty(model.value)) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), data: model.value }))
    } catch {
      /* 存储满了或被禁用：不影响正常填写 */
    }
  }
  watch(
    model,
    () => {
      if (!active) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(write, 600)
    },
    { deep: true },
  )
  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
    write()
  })

  function clear() {
    active = false
    if (timer) clearTimeout(timer)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      /* ignore */
    }
  }

  /** 打开表单时调用：有上次没提交的草稿就问“恢复还是不要”，之后开始自动保存 */
  function start() {
    active = false
    let raw: string | null = null
    try {
      raw = localStorage.getItem(storageKey)
    } catch {
      /* ignore */
    }
    if (!raw) {
      active = true
      return
    }
    let saved: { at: number; data: T } | null = null
    try {
      saved = JSON.parse(raw)
    } catch {
      /* ignore */
    }
    if (!saved || Date.now() - saved.at > 3 * 86_400_000 || isEmpty(saved.data)) {
      clear()
      active = true
      return
    }
    const d = new Date(saved.at)
    dialog.info({
      title: '发现上次没提交的内容',
      content: `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} 填写的内容还没有提交，要恢复吗？`,
      positiveText: '恢复',
      negativeText: '不要了',
      closable: false,
      maskClosable: false,
      onPositiveClick: () => {
        model.value = saved!.data
        onRestore?.(saved!.data)
        active = true
      },
      onNegativeClick: () => {
        clear()
        active = true
      },
    })
  }

  return { start, clear }
}
