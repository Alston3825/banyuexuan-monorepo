<script setup lang="ts">
/**
 * 把“每日服务报告”发给客户确认：生成一个 7 天有效的链接，护理师复制后发给客户（微信等；后期接小程序）。
 * 客户打开后输入自己登记的手机号后四位核验本人，就能看到最近 7 天的服务报告，逐天确认、对护理师打分。
 * 重新生成会让之前没用完的旧链接作废；链接只在生成这一刻能看到，丢了就重新生成。
 */
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NInput, NModal, NSpace, NTag } from 'naive-ui'
import { careSignApi, type ConfirmLinkRow } from '../../api/modules/care-sign.api'
import { dialog, message } from '../../utils/discrete-api'

const props = defineProps<{ show: boolean; motherProfileId: string; customerName?: string }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const fresh = ref<{ url: string; expiresAt: string } | null>(null)
const links = ref<ConfirmLinkRow[]>([])
const creating = ref(false)

async function loadLinks() {
  links.value = await careSignApi.links(props.motherProfileId)
}
watch(
  () => props.show,
  (v) => {
    if (v) {
      fresh.value = null
      void loadLinks()
    }
  },
)

const sendText = computed(() =>
  fresh.value
    ? `${props.customerName ? props.customerName + '，' : ''}您好！这是您最近的护理服务报告，请点击链接查看并确认，也可以给护理师打分：\n${fresh.value.url}\n（打开后需输入您登记的手机号后四位；链接 7 天内有效）`
    : '',
)

async function create() {
  creating.value = true
  try {
    const r = await careSignApi.createLink(props.motherProfileId)
    fresh.value = { url: `${window.location.origin}${r.path}`, expiresAt: r.expiresAt }
    await loadLinks()
  } finally {
    creating.value = false
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制，去微信里粘贴发给客户')
  } catch {
    message.warning('这个浏览器不让自动复制，请长按文字手动复制')
  }
}

function revoke(l: ConfirmLinkRow) {
  dialog.warning({
    title: '作废这个链接？',
    content: '作废后客户用这个链接打不开了。',
    positiveText: '作废',
    negativeText: '取消',
    onPositiveClick: async () => {
      await careSignApi.revokeLink(l.id)
      await loadLinks()
    },
  })
}

const STATUS: Record<ConfirmLinkRow['status'], { t: string; type: 'success' | 'default' | 'warning' | 'error' }> = {
  ACTIVE: { t: '有效', type: 'success' },
  REVOKED: { t: '已作废', type: 'default' },
  EXPIRED: { t: '已过期', type: 'default' },
  LOCKED: { t: '已锁定（输错次数过多）', type: 'warning' },
}
const fmt = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <n-modal :mask-closable="false" :show="show" @update:show="(v) => emit('update:show', v)">
    <n-card title="发给客户确认每日服务报告" style="width: min(560px, 96vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="emit('update:show', false)">
      <n-alert type="info" :show-icon="false" style="margin-bottom: 10px">
        客户打开链接 → 输入自己登记的<b>手机号后四位</b>核验本人 → 查看最近 7 天的服务报告 → 逐天确认（手写签名或长按确认）并给当班护理师打分。超过 7 天的记录不能再补确认。
      </n-alert>

      <n-button type="primary" :loading="creating" @click="create">{{ fresh ? '重新生成（旧链接作废）' : '生成确认链接' }}</n-button>

      <div v-if="fresh" class="cl-fresh">
        <div class="cl-label">发给客户的内容（点“复制”后粘贴到微信）：</div>
        <n-input :value="sendText" type="textarea" readonly :autosize="{ minRows: 4, maxRows: 7 }" />
        <n-space style="margin-top: 8px" align="center">
          <n-button type="primary" size="small" @click="copy(sendText)">复制全部内容</n-button>
          <n-button size="small" @click="copy(fresh.url)">只复制链接</n-button>
          <span class="cl-tip">有效期至 {{ fmt(fresh.expiresAt) }}。链接只在这里显示一次，丢了重新生成即可。</span>
        </n-space>
      </div>

      <div v-if="links.length" class="cl-list">
        <div class="cl-label">最近的链接</div>
        <div v-for="l in links" :key="l.id" class="cl-row">
          <n-tag :type="STATUS[l.status].type" size="small">{{ STATUS[l.status].t }}</n-tag>
          <span class="cl-tip">生成 {{ fmt(l.createdAt) }} · 打开 {{ l.openCount }} 次<template v-if="l.lastOpenedAt"> · 最近 {{ fmt(l.lastOpenedAt) }}</template></span>
          <n-button v-if="l.status === 'ACTIVE' || l.status === 'LOCKED'" size="tiny" quaternary type="error" @click="revoke(l)">作废</n-button>
        </div>
      </div>
    </n-card>
  </n-modal>
</template>

<style scoped>
.cl-fresh {
  margin-top: 12px;
}
.cl-label {
  margin: 8px 0 4px;
  color: #555;
  font-size: 13px;
}
.cl-tip {
  color: #999;
  font-size: 12px;
}
.cl-list {
  margin-top: 12px;
}
.cl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.cl-row .cl-tip {
  flex: 1;
}
</style>
