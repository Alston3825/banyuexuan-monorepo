/**
 * 设备号：浏览器第一次打开时随机生成并存在本地。登录请求会带上它，后端据此记下“哪些设备是员工用过的”；
 * 客户确认页也带它——如果客户确认是在护理师自己用过的设备上点的，系统会打风险标记（见后端 CareConfirmPublicService）。
 * 同一个浏览器里，员工登录页和客户确认页共用同一个设备号（同源 localStorage）。
 */
const KEY = 'banyuexuan_device_id'

function random(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      id = random()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return random() // 隐私模式等拿不到 localStorage：本次随机一个
  }
}
