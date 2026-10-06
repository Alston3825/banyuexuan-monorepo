<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  NCard,
  NSpace,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NTimeline,
  NTimelineItem,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
} from 'naive-ui'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { accountApi } from '../../api/modules/account.api'
import type { WorkflowInstance, WorkflowActionType, WorkflowApproverStatus } from '../../api/types/workflow'
import {
  renderStatusBadge,
  WORKFLOW_INSTANCE_STATUS_MAP,
  APPROVER_STATUS_MAP,
  WORKFLOW_ACTION_LABEL_MAP,
} from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const route = useRoute()
const instanceId = route.params.id as string

const instance = ref<WorkflowInstance | null>(null)
const loading = ref(false)
const accountOptions = ref<{ label: string; value: string }[]>([])

async function fetchInstance() {
  loading.value = true
  try {
    instance.value = await workflowInstanceApi.get(instanceId)
  } finally {
    loading.value = false
  }
}

async function fetchAccountOptions() {
  const accounts = await accountApi.list()
  accountOptions.value = accounts.map((a) => ({ label: `${a.realName}（${a.username}）`, value: a.id }))
}

const groupedApprovers = computed(() => {
  if (!instance.value?.approvers) return []
  const map = new Map<number, typeof instance.value.approvers>()
  for (const a of instance.value.approvers) {
    if (!map.has(a.nodeSeq)) map.set(a.nodeSeq, [])
    map.get(a.nodeSeq)!.push(a)
  }
  return [...map.entries()].sort(([a], [b]) => a - b)
})

function approverStatusBadge(status: WorkflowApproverStatus) {
  return renderStatusBadge(status, APPROVER_STATUS_MAP)
}

function instanceStatusBadge() {
  return instance.value ? renderStatusBadge(instance.value.status, WORKFLOW_INSTANCE_STATUS_MAP) : null
}

function timelineType(action: WorkflowActionType): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (action === 'APPROVE' || action === 'ARCHIVE') return 'success'
  if (action === 'REJECT') return 'error'
  if (action === 'WITHDRAW') return 'warning'
  return 'info'
}

// ---------------- 操作弹窗 ----------------
type ActionKind = 'approve' | 'reject' | 'withdraw' | 'reassign' | 'add-approver' | 'cc'
const actionVisible = ref(false)
const actionKind = ref<ActionKind>('approve')
const actionSubmitting = ref(false)
const actionModel = ref({ comment: '', toAccountId: '', accountId: '', accountIds: [] as string[] })

const actionTitleMap: Record<ActionKind, string> = {
  approve: '通过审批',
  reject: '驳回审批',
  withdraw: '撤回审批',
  reassign: '转交审批',
  'add-approver': '加签',
  cc: '抄送',
}

function openAction(kind: ActionKind) {
  actionKind.value = kind
  actionModel.value = { comment: '', toAccountId: '', accountId: '', accountIds: [] }
  actionVisible.value = true
}

async function handleActionSubmit() {
  actionSubmitting.value = true
  try {
    switch (actionKind.value) {
      case 'approve':
        await workflowInstanceApi.approve(instanceId, actionModel.value.comment || undefined)
        break
      case 'reject':
        await workflowInstanceApi.reject(instanceId, actionModel.value.comment || undefined)
        break
      case 'withdraw':
        await workflowInstanceApi.withdraw(instanceId, actionModel.value.comment || undefined)
        break
      case 'reassign':
        if (!actionModel.value.toAccountId) {
          message.error('请选择转交对象')
          return
        }
        await workflowInstanceApi.reassign(instanceId, actionModel.value.toAccountId, actionModel.value.comment || undefined)
        break
      case 'add-approver':
        if (!actionModel.value.accountId) {
          message.error('请选择加签人')
          return
        }
        await workflowInstanceApi.addApprover(instanceId, actionModel.value.accountId, actionModel.value.comment || undefined)
        break
      case 'cc':
        if (actionModel.value.accountIds.length === 0) {
          message.error('请选择抄送人')
          return
        }
        await workflowInstanceApi.cc(instanceId, actionModel.value.accountIds)
        break
    }
    message.success('操作成功')
    actionVisible.value = false
    await fetchInstance()
  } finally {
    actionSubmitting.value = false
  }
}

async function handleArchive() {
  await workflowInstanceApi.archive(instanceId)
  message.success('已归档')
  await fetchInstance()
}

onMounted(async () => {
  await Promise.all([fetchInstance(), fetchAccountOptions()])
})
</script>

<template>
  <div v-if="instance">
    <n-card :title="instance.title" style="margin-bottom: 16px">
      <template #header-extra>
        <component :is="instanceStatusBadge" />
      </template>
      <n-descriptions :column="2" label-placement="left">
        <n-descriptions-item label="业务类型">{{ instance.businessType }}</n-descriptions-item>
        <n-descriptions-item label="业务单据 ID">{{ instance.businessId }}</n-descriptions-item>
        <n-descriptions-item label="当前节点">{{ instance.currentNodeSeq ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="发起人">{{ instance.initiatorId }}</n-descriptions-item>
        <n-descriptions-item label="提交时间">{{ instance.submittedAt ? new Date(instance.submittedAt).toLocaleString() : '-' }}</n-descriptions-item>
        <n-descriptions-item label="完成时间">{{ instance.finishedAt ? new Date(instance.finishedAt).toLocaleString() : '-' }}</n-descriptions-item>
      </n-descriptions>

      <n-space style="margin-top: 16px">
        <template v-if="instance.status === 'IN_REVIEW'">
          <n-button type="primary" @click="openAction('approve')">通过</n-button>
          <n-button type="error" @click="openAction('reject')">驳回</n-button>
          <n-button @click="openAction('withdraw')">撤回</n-button>
          <n-button @click="openAction('reassign')">转交</n-button>
          <n-button @click="openAction('add-approver')">加签</n-button>
          <n-button @click="openAction('cc')">抄送</n-button>
        </template>
        <template v-else-if="instance.status === 'APPROVED'">
          <n-button type="primary" @click="handleArchive">归档</n-button>
        </template>
      </n-space>
    </n-card>

    <n-card title="审批人" style="margin-bottom: 16px">
      <div v-for="[nodeSeq, approvers] in groupedApprovers" :key="nodeSeq" style="margin-bottom: 16px">
        <h4>第 {{ nodeSeq }} 节点</h4>
        <n-space vertical>
          <div v-for="a in approvers" :key="a.id">
            {{ a.accountId }}（{{ a.role }}）—
            <component :is="() => approverStatusBadge(a.status)" />
            <span v-if="a.comment"> {{ a.comment }}</span>
          </div>
        </n-space>
      </div>
    </n-card>

    <n-card title="审批时间线">
      <n-timeline>
        <n-timeline-item
          v-for="action in instance.actions"
          :key="action.id"
          :type="timelineType(action.action)"
          :title="WORKFLOW_ACTION_LABEL_MAP[action.action] ?? action.action"
          :content="action.comment ?? undefined"
          :time="new Date(action.createdAt).toLocaleString()"
        />
      </n-timeline>
    </n-card>

    <n-modal :show="actionVisible" @update:show="(v) => (actionVisible = v)">
      <n-card :title="actionTitleMap[actionKind]" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item v-if="actionKind === 'reassign'" label="转交给">
            <n-select v-model:value="actionModel.toAccountId" :options="accountOptions" />
          </n-form-item>
          <n-form-item v-if="actionKind === 'add-approver'" label="加签人">
            <n-select v-model:value="actionModel.accountId" :options="accountOptions" />
          </n-form-item>
          <n-form-item v-if="actionKind === 'cc'" label="抄送给">
            <n-select v-model:value="actionModel.accountIds" multiple :options="accountOptions" />
          </n-form-item>
          <n-form-item v-if="actionKind !== 'cc'" label="备注">
            <n-input v-model:value="actionModel.comment" type="textarea" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="actionVisible = false">取消</n-button>
            <n-button type="primary" :loading="actionSubmitting" @click="handleActionSubmit">确认</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
