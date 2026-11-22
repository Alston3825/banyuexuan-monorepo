<script setup lang="ts">
/**
 * 消息中心：审批、抄送、催办、护理计划评审、日常记录未填、个人提醒到点……系统发给我的消息都在这里。
 * 电脑和手机都用卡片列表（一条一张卡，点卡片直达对应页面并标为已读），不用宽表格。
 */
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NEmpty, NSelect, NSpin, NSwitch } from 'naive-ui'
import { notificationApi, timeAgo, NOTIFICATION_CATEGORY_LABEL, type NotificationItem } from '../../api/modules/notification.api'
import { message } from '../../utils/discrete-api'
import BxTheme from '../../components/BxTheme.vue'

const router = useRouter()
const items = ref<NotificationItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const onlyUnread = ref(false)
const category = ref<string | null>(null)
const categoryOptions = [{ label: '全部类别', value: '' }, ...Object.entries(NOTIFICATION_CATEGORY_LABEL).map(([value, label]) => ({ label, value }))]
const PAGE_SIZE = 20

async function load(reset = true) {
  loading.value = true
  try {
    if (reset) page.value = 1
    const r = await notificationApi.list({ unread: onlyUnread.value, category: category.value || undefined, page: page.value, pageSize: PAGE_SIZE })
    items.value = reset ? r.items : [...items.value, ...r.items]
    total.value = r.total
  } finally {
    loading.value = false
  }
}
function more() {
  page.value += 1
  load(false)
}
watch([onlyUnread, category], () => load())
onMounted(() => load())

const changed = () => window.dispatchEvent(new Event('bx:notifications-changed'))

async function open(n: NotificationItem) {
  if (!n.readAt) {
    n.readAt = new Date().toISOString()
    await notificationApi.read(n.id).catch(() => undefined)
    changed()
  }
  if (n.link) router.push(n.link)
}
async function readAll() {
  const r = await notificationApi.readAll(category.value || undefined)
  message.success(r.updated ? `已把 ${r.updated} 条消息标为已读` : '没有未读消息')
  changed()
  load()
}

// 浏览器桌面通知：授权后，页面在后台时新消息也会在电脑右下角/手机通知栏弹出
const desktopSupported = 'Notification' in window
const desktopPerm = ref(desktopSupported ? Notification.permission : 'denied')
async function enableDesktop() {
  if (!desktopSupported) return
  desktopPerm.value = await Notification.requestPermission()
  if (desktopPerm.value === 'granted') message.success('已开启桌面提醒')
  else message.warning('浏览器没有允许通知，可以在浏览器地址栏左侧的网站设置里打开')
}
</script>

<template>
  <BxTheme>
    <div class="msg-page">
      <div class="msg-bar">
        <n-select v-model:value="category" :options="categoryOptions" placeholder="全部类别" style="width: min(200px, 100%)" />
        <label class="msg-switch"><n-switch v-model:value="onlyUnread" /> 只看未读</label>
        <span class="msg-spacer" />
        <n-button v-if="desktopSupported && desktopPerm !== 'granted'" secondary @click="enableDesktop">开启桌面提醒</n-button>
        <n-button secondary @click="readAll">全部标为已读</n-button>
      </div>

      <n-spin :show="loading">
        <n-empty v-if="!loading && items.length === 0" :description="onlyUnread ? '没有未读消息' : '还没有消息。有人提交审批、抄送给你、护理计划到期、提醒到点时，会在这里出现'" style="margin-top: 60px" />
        <div v-for="n in items" :key="n.id" class="msg-card" :class="[`lv-${n.level}`, { unread: !n.readAt }]" @click="open(n)">
          <div class="msg-title"><span v-if="!n.readAt" class="msg-dot" />{{ n.title }}</div>
          <div v-if="n.body" class="msg-body">{{ n.body }}</div>
          <div class="msg-meta">
            <span class="msg-cat">{{ NOTIFICATION_CATEGORY_LABEL[n.category] }}</span>
            <span>{{ timeAgo(n.createdAt) }}</span>
            <span v-if="n.link" class="msg-go">去看看 ›</span>
          </div>
        </div>
        <div v-if="items.length < total" class="msg-more">
          <n-button block secondary :loading="loading" @click="more">加载更多（还有 {{ total - items.length }} 条）</n-button>
        </div>
        <div v-else-if="items.length > 0" class="msg-end">消息保留 90 天</div>
      </n-spin>
    </div>
  </BxTheme>
</template>

<style scoped>
.msg-page {
  max-width: 820px;
  margin: 0 auto;
}
.msg-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
.msg-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
}
.msg-spacer {
  flex: 1;
}
.msg-card {
  padding: 12px 14px;
  margin-bottom: 10px;
  border: 1px solid var(--bx-paper-3);
  border-left: 4px solid var(--bx-paper-3);
  border-radius: 6px;
  background: var(--bx-paper);
  cursor: pointer;
}
.msg-card:hover {
  background: var(--bx-paper-2);
}
.msg-card.unread.lv-info,
.msg-card.unread.lv-success {
  border-left-color: var(--bx-ink);
}
.msg-card.unread.lv-warning {
  border-left-color: var(--bx-oat);
}
.msg-card.unread.lv-danger {
  border-left-color: var(--bx-clay);
}
.msg-title {
  font-size: 15px;
  color: var(--bx-ink);
}
.msg-card.unread .msg-title {
  font-weight: 600;
}
.msg-card:not(.unread) .msg-title {
  color: var(--bx-gray);
}
.msg-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--bx-clay);
  vertical-align: middle;
}
.msg-body {
  margin-top: 4px;
  font-size: 13px;
  color: var(--bx-gray);
  word-break: break-all;
}
.msg-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--bx-gray);
}
.msg-cat {
  color: var(--bx-ink);
}
.msg-go {
  margin-left: auto;
  color: var(--bx-clay);
}
.msg-more,
.msg-end {
  margin: 12px 0 24px;
  text-align: center;
  font-size: 12px;
  color: var(--bx-gray);
}
</style>
