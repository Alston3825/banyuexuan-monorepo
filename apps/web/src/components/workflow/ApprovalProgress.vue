<script setup lang="ts">
/**
 * 审批进度 + 审批操作：谁在审、审到哪一步、等了多久、有没有超时、各自的意见；
 * 当前登录人是待审批人时直接出现“通过 / 驳回”按钮，发起人可以“催办 / 撤回”。
 * 用法：<ApprovalProgress :instance-id="id" /> 或 <ApprovalProgress business-type="PURCHASE_REQUEST" :business-id="id" />
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NButton, NCollapse, NCollapseItem, NEmpty, NForm, NFormItem, NInput, NModal, NCard, NSelect, NSpace, NSpin, NTag } from 'naive-ui'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { customerApi } from '../../api/modules/customer.api'
import type { ProgressApprover, ProgressNode, WorkflowProgress } from '../../api/types/workflow'
import { renderStatusBadge, WORKFLOW_INSTANCE_STATUS_MAP, APPROVER_STATUS_MAP, WORKFLOW_ACTION_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const props = defineProps<{ instanceId?: string; businessType?: string; businessId?: string }>()
const emit = defineEmits<{ (e: 'changed', p: WorkflowProgress | null): void; (e: 'loaded', p: WorkflowProgress | null): void }>()

const data = ref<WorkflowProgress | null>(null)
const loading = ref(false)
const now = ref(Date.now())
let ticker: number | undefined

async function load() {
  loading.value = true
  try {
    data.value = props.instanceId
      ? await workflowInstanceApi.progress(props.instanceId)
      : props.businessType && props.businessId
        ? await workflowInstanceApi.progressByBusiness(props.businessType, props.businessId)
        : null
    emit('loaded', data.value)
  } finally {
    loading.value = false
  }
}
watch(() => [props.instanceId, props.businessType, props.businessId], load)
onMounted(() => {
  load()
  ticker = window.setInterval(() => (now.value = Date.now()), 60_000)
})
onBeforeUnmount(() => window.clearInterval(ticker))
defineExpose({ reload: load })

const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : '-')
function span(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000))
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} 小时${m % 60 ? ` ${m % 60} 分钟` : ''}`
  return `${Math.floor(h / 24)} 天 ${h % 24} 小时`
}

const STATE_META: Record<string, { color: string; text: string }> = {
  DONE: { color: '#18a058', text: '已通过' },
  CURRENT: { color: '#f0a020', text: '审批中' },
  WAITING: { color: '#bbb', text: '等待中' },
  REJECTED: { color: '#d03050', text: '已驳回' },
  WITHDRAWN: { color: '#999', text: '已撤回' },
  SKIPPED: { color: '#bbb', text: '无人审批，已跳过' },
}

function pendingNote(a: ProgressApprover): string {
  const waited = `已等待 ${span(now.value - new Date(a.arrivedAt).getTime())}`
  if (!a.dueAt) return waited
  const left = new Date(a.dueAt).getTime() - now.value
  return left < 0 ? `${waited}，已超时 ${span(-left)}` : `${waited}，还剩 ${span(left)}`
}
const approverOverdue = (a: ProgressApprover) => a.status === 'PENDING' && !!a.dueAt && new Date(a.dueAt).getTime() < now.value

const modeLabel = (n: ProgressNode) => (n.approvers.length > 1 || n.planned.startsWith('角色') ? (n.mode === 'ANY' ? '或签：任意一人通过即可' : '会签：全部通过') : '')

// ---------------- 操作 ----------------
type Kind = 'approve' | 'reject' | 'withdraw' | 'reassign' | 'add-approver' | 'cc' | 'urge'
const TITLE: Record<Kind, string> = { approve: '通过审批', reject: '驳回', withdraw: '撤回申请', reassign: '转交给别人审批', 'add-approver': '加签（增加一位审批人）', cc: '抄送', urge: '催办' }
const kind = ref<Kind>('approve')
const visible = ref(false)
const submitting = ref(false)
const form = ref({ comment: '', accountId: '', accountIds: [] as string[] })
const staff = ref<{ label: string; value: string }[]>([])

async function open(k: Kind) {
  kind.value = k
  form.value = { comment: '', accountId: '', accountIds: [] }
  visible.value = true
  if (['reassign', 'add-approver', 'cc'].includes(k) && staff.value.length === 0) {
    staff.value = (await customerApi.staffOptions()).map((a) => ({ label: `${a.realName}（${a.username}）`, value: a.id }))
  }
}

async function submit() {
  if (!data.value) return
  const id = data.value.id
  const c = form.value.comment.trim() || undefined
  if (kind.value === 'reject' && !c) return void message.error('驳回请写明原因，方便申请人修改')
  if ((kind.value === 'reassign' || kind.value === 'add-approver') && !form.value.accountId) return void message.error('请选择人员')
  if (kind.value === 'cc' && form.value.accountIds.length === 0) return void message.error('请选择抄送人')
  submitting.value = true
  try {
    if (kind.value === 'approve') await workflowInstanceApi.approve(id, c)
    else if (kind.value === 'reject') await workflowInstanceApi.reject(id, c)
    else if (kind.value === 'withdraw') await workflowInstanceApi.withdraw(id, c)
    else if (kind.value === 'reassign') await workflowInstanceApi.reassign(id, form.value.accountId, c)
    else if (kind.value === 'add-approver') await workflowInstanceApi.addApprover(id, form.value.accountId, c)
    else if (kind.value === 'cc') await workflowInstanceApi.cc(id, form.value.accountIds)
    else await workflowInstanceApi.urge(id, c)
    message.success(kind.value === 'urge' ? '已催办，对方的待办里会标出“被催办”' : '操作成功')
    visible.value = false
    await load()
    emit('changed', data.value)
  } finally {
    submitting.value = false
  }
}

const canAct = computed(() => !!data.value && (data.value.me.canApprove || data.value.me.canWithdraw || data.value.me.canUrge || data.value.me.canReassignAsAdmin))
</script>

<template>
  <n-spin :show="loading">
    <div v-if="data" class="ap">
      <div class="ap-head">
        <component :is="() => renderStatusBadge(data!.status, WORKFLOW_INSTANCE_STATUS_MAP)" />
        <span class="ap-sub">{{ data.initiator.name }} 于 {{ dt(data.submittedAt) }} 提交 · 流程：{{ data.definitionName }}</span>
        <span v-if="data.urgeCount" class="ap-warn">已催办 {{ data.urgeCount }} 次</span>
      </div>

      <div v-for="n in data.nodes" :key="n.seq" class="ap-node">
        <div class="ap-dot" :style="{ background: STATE_META[n.state].color }" />
        <div class="ap-body">
          <div class="ap-title">
            第 {{ n.seq }} 步：{{ n.name }}
            <n-tag size="small" :bordered="false" :color="{ textColor: STATE_META[n.state].color, color: 'transparent' }" style="margin-left: 6px">{{ STATE_META[n.state].text }}</n-tag>
            <span v-if="n.timeoutHours" class="ap-hint">限时 {{ n.timeoutHours }} 小时</span>
            <span v-if="modeLabel(n)" class="ap-hint">{{ modeLabel(n) }}</span>
          </div>
          <div v-if="n.approvers.length === 0" class="ap-line ap-hint">{{ n.state === 'WAITING' ? `将由 ${n.planned} 审批` : n.planned }}</div>
          <div v-for="a in n.approvers" :key="a.accountId + a.arrivedAt" class="ap-line">
            <b>{{ a.name }}</b>
            <component :is="() => renderStatusBadge(a.status, APPROVER_STATUS_MAP)" />
            <span v-if="a.status === 'PENDING'" :class="{ 'ap-over': approverOverdue(a) }">{{ pendingNote(a) }}</span>
            <span v-else-if="a.actedAt" class="ap-hint">{{ dt(a.actedAt) }}</span>
            <span v-if="a.comment" class="ap-cmt">“{{ a.comment }}”</span>
          </div>
        </div>
      </div>
      <div v-if="data.ccs.length" class="ap-line ap-hint" style="margin: 4px 0 8px 22px">抄送：{{ data.ccs.map((c) => c.name).join('、') }}</div>

      <n-space v-if="canAct" style="margin: 10px 0">
        <template v-if="data.me.canApprove">
          <n-button type="primary" @click="open('approve')">通过</n-button>
          <n-button type="error" @click="open('reject')">驳回</n-button>
          <n-button @click="open('reassign')">转交</n-button>
          <n-button @click="open('add-approver')">加签</n-button>
          <n-button @click="open('cc')">抄送</n-button>
        </template>
        <n-button v-else-if="data.me.canReassignAsAdmin" @click="open('reassign')">管理员：重新指定审批人</n-button>
        <n-button v-if="data.me.canUrge" type="warning" secondary @click="open('urge')">催办</n-button>
        <n-button v-if="data.me.canWithdraw" @click="open('withdraw')">撤回申请</n-button>
      </n-space>

      <n-collapse>
        <n-collapse-item title="操作记录" name="log">
          <div v-for="a in data.actions" :key="a.id" class="ap-line">
            <span class="ap-hint">{{ dt(a.createdAt) }}</span>
            <b>{{ a.actorName }}</b> {{ WORKFLOW_ACTION_LABEL_MAP[a.action] ?? a.action }}
            <span v-if="a.comment" class="ap-cmt">“{{ a.comment }}”</span>
          </div>
        </n-collapse-item>
      </n-collapse>
    </div>
    <n-empty v-else-if="!loading" description="这张单据还没有提交审批" />

    <n-modal :mask-closable="false" :show="visible" @update:show="(v) => (visible = v)">
      <n-card :title="TITLE[kind]" style="width: min(440px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="top">
          <n-form-item v-if="kind === 'reassign' || kind === 'add-approver'" label="选择人员">
            <n-select v-model:value="form.accountId" :options="staff" filterable placeholder="选择员工" />
          </n-form-item>
          <n-form-item v-if="kind === 'cc'" label="抄送给">
            <n-select v-model:value="form.accountIds" multiple filterable :options="staff" />
          </n-form-item>
          <n-form-item v-if="kind !== 'cc'" :label="kind === 'reject' ? '驳回原因（必填）' : kind === 'urge' ? '催办说明（选填）' : '审批意见（选填）'">
            <n-input v-model:value="form.comment" type="textarea" :autosize="{ minRows: 2 }" :placeholder="kind === 'reject' ? '请写明为什么不通过，申请人会看到' : ''" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="visible = false">取消</n-button>
            <n-button :type="kind === 'reject' ? 'error' : 'primary'" :loading="submitting" @click="submit">确认</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </n-spin>
</template>

<style scoped>
.ap-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.ap-sub {
  color: #666;
  font-size: 13px;
}
.ap-warn {
  color: #d9822b;
  font-size: 12px;
}
.ap-node {
  display: flex;
  gap: 10px;
  padding-bottom: 10px;
  position: relative;
}
.ap-node:not(:last-of-type)::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 16px;
  bottom: 0;
  width: 2px;
  background: #e5e5e5;
}
.ap-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 4px;
  flex: none;
}
.ap-body {
  flex: 1;
  min-width: 0;
}
.ap-title {
  font-weight: 600;
  font-size: 14px;
}
.ap-hint {
  color: #999;
  font-size: 12px;
  margin-left: 6px;
}
.ap-line {
  margin-top: 4px;
  font-size: 13px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ap-over {
  color: #d03050;
  font-weight: 600;
}
.ap-cmt {
  color: #555;
}
</style>
