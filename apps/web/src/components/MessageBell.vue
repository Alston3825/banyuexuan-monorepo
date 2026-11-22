<script setup lang="ts">
/**
 * 顶栏“消息”按钮：未读数红点；每 30 秒查一次，新到的消息在右上角弹出提示（点一下直达）。
 * 电脑上点按钮展开最近消息；手机上直接进消息中心页（弹层在小屏上不好点）。
 * 浏览器桌面通知：用户在消息中心页点“开启桌面提醒”授权后，个人提醒/催办等在别的窗口也能弹出。
 */
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NBadge, NButton, NEmpty, NIcon, NPopover } from 'naive-ui'
import { MailOutline } from '@vicons/ionicons5'
import { notificationApi, timeAgo, NOTIFICATION_CATEGORY_LABEL, type NotificationItem } from '../api/modules/notification.api'
import { notification } from '../utils/discrete-api'
import { useBreakpoint } from '../composables/useBreakpoint'

const router = useRouter()
const { breakpoint } = useBreakpoint()
const isDesktop = computed(() => breakpoint.value === 'desktop')

const unread = ref(0)
const latest = ref<NotificationItem[]>([])
const show = ref(false)
let since: string | undefined
let timer: number | undefined

const TOAST_TYPE: Record<string, 'info' | 'warning' | 'error' | 'success'> = { info: 'info', warning: 'warning', danger: 'error', success: 'success' }

async function open(n: NotificationItem) {
  show.value = false
  if (!n.readAt) {
    n.readAt = new Date().toISOString()
    unread.value = Math.max(0, unread.value - 1)
    notificationApi.read(n.id).catch(() => undefined)
  }
  if (n.link) router.push(n.link)
}

function toast(n: NotificationItem) {
  const inst = notification.create({
    type: TOAST_TYPE[n.level] ?? 'info',
    title: n.title,
    description: NOTIFICATION_CATEGORY_LABEL[n.category],
    content: n.body ?? undefined,
    duration: n.category === 'REMINDER' || n.level === 'danger' ? 0 : 10_000,
    keepAliveOnHover: true,
    closable: true,
    action: n.link
      ? () =>
          h(
            NButton,
            { size: 'small', type: 'primary', onClick: () => { inst.destroy(); open(n) } },
            { default: () => '去看看' },
          )
      : undefined,
  })
  // 页面不在前台时，用浏览器桌面通知（需要用户在消息中心授权过）
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const bn = new Notification(n.title, { body: n.body ?? '', tag: n.id })
      bn.onclick = () => { window.focus(); open(n); bn.close() }
    } catch {
      /* 某些浏览器不支持在页面里直接 new Notification，忽略 */
    }
  }
}

async function refresh() {
  try {
    const s = await notificationApi.summary(since)
    unread.value = s.unread
    latest.value = s.latest
    // 第一次只记下时间，不把登录前的旧消息全弹一遍
    if (since) [...s.fresh].reverse().forEach(toast)
    since = s.serverTime
  } catch {
    /* 取消息失败不影响使用 */
  }
}

async function readAll() {
  await notificationApi.readAll()
  unread.value = 0
  latest.value.forEach((n) => (n.readAt = n.readAt ?? new Date().toISOString()))
}

function onClick() {
  if (!isDesktop.value) router.push('/workspace/messages')
}

onMounted(() => {
  refresh()
  timer = window.setInterval(refresh, 30_000)
  window.addEventListener('bx:notifications-changed', refresh)
})
onBeforeUnmount(() => {
  window.clearInterval(timer)
  window.removeEventListener('bx:notifications-changed', refresh)
})
</script>

<template>
  <n-popover v-if="isDesktop" v-model:show="show" trigger="click" placement="bottom-end" :width="360" style="padding: 0">
    <template #trigger>
      <n-badge :value="unread" :max="99" type="error" :show="unread > 0">
        <n-button quaternary circle title="消息">
          <template #icon><n-icon size="20"><MailOutline /></n-icon></template>
        </n-button>
      </n-badge>
    </template>
    <div class="mb-head">
      <span class="bx-serif">消息{{ unread ? `（${unread} 条未读）` : '' }}</span>
      <n-button v-if="unread" text size="small" @click="readAll">全部标为已读</n-button>
    </div>
    <div class="mb-list">
      <n-empty v-if="latest.length === 0" description="还没有消息" style="padding: 28px 0" />
      <div v-for="n in latest" :key="n.id" class="mb-item" :class="[`lv-${n.level}`, { unread: !n.readAt }]" @click="open(n)">
        <div class="mb-title"><span v-if="!n.readAt" class="mb-dot" />{{ n.title }}</div>
        <div v-if="n.body" class="mb-body">{{ n.body }}</div>
        <div class="mb-meta">{{ NOTIFICATION_CATEGORY_LABEL[n.category] }} · {{ timeAgo(n.createdAt) }}</div>
      </div>
    </div>
    <div class="mb-foot">
      <n-button text type="primary" @click="show = false; router.push('/workspace/messages')">查看全部消息</n-button>
    </div>
  </n-popover>
  <n-badge v-else :value="unread" :max="99" type="error" :show="unread > 0">
    <n-button quaternary circle title="消息" @click="onClick">
      <template #icon><n-icon size="20"><MailOutline /></n-icon></template>
    </n-button>
  </n-badge>
</template>

<style scoped>
.mb-head,
.mb-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
}
.mb-head {
  border-bottom: 1px solid var(--bx-paper-3);
  font-weight: 700;
}
.mb-foot {
  justify-content: center;
  border-top: 1px solid var(--bx-paper-3);
}
.mb-list {
  max-height: 420px;
  overflow-y: auto;
}
.mb-item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--bx-paper-3);
  border-left: 3px solid transparent;
  cursor: pointer;
}
.mb-item:hover {
  background: var(--bx-paper-2);
}
.mb-item.unread.lv-warning {
  border-left-color: var(--bx-oat);
}
.mb-item.unread.lv-danger {
  border-left-color: var(--bx-clay);
}
.mb-item.unread.lv-info,
.mb-item.unread.lv-success {
  border-left-color: var(--bx-ink);
}
.mb-title {
  font-size: 14px;
  color: var(--bx-ink);
}
.mb-item.unread .mb-title {
  font-weight: 600;
}
.mb-item:not(.unread) .mb-title {
  color: var(--bx-gray);
}
.mb-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--bx-clay);
  vertical-align: middle;
}
.mb-body {
  margin-top: 3px;
  font-size: 12px;
  color: var(--bx-gray);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mb-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--bx-gray);
}
</style>
