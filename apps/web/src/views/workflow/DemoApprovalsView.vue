<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NSpace,
  NDataTable,
  NModal,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  type DataTableColumns,
} from 'naive-ui'
import { demoApprovalApi } from '../../api/modules/demo-approval.api'
import type { DemoApprovalRequest } from '../../api/types/workflow'
import { renderStatusBadge, WORKFLOW_INSTANCE_STATUS_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'

const router = useRouter()
const rows = ref<DemoApprovalRequest[]>([])
const loading = ref(false)

async function fetchList() {
  loading.value = true
  try {
    rows.value = await demoApprovalApi.list()
  } finally {
    loading.value = false
  }
}

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({ title: '', content: '', amountYuan: null as number | null })

function openCreateModal() {
  model.value = { title: '', content: '', amountYuan: null }
  formVisible.value = true
}

async function handleCreate() {
  if (!model.value.title || !model.value.content) {
    message.error('请填写标题和内容')
    return
  }
  submitting.value = true
  try {
    await demoApprovalApi.create({
      title: model.value.title,
      content: model.value.content,
      amount: toMinorUnits(model.value.amountYuan ?? undefined),
    })
    message.success('示例审批单已创建')
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const submittingId = ref<string | null>(null)
async function handleSubmitApproval(row: DemoApprovalRequest) {
  submittingId.value = row.id
  try {
    const instance = await demoApprovalApi.submit(row.id)
    message.success('已提交审批')
    router.push(`/workflow/instances/${instance.id}`)
  } finally {
    submittingId.value = null
  }
}

const columns: DataTableColumns<DemoApprovalRequest> = [
  { key: 'title', title: '标题' },
  { key: 'content', title: '内容' },
  { key: 'amount', title: '金额（元）', render: (row) => (toMajorUnits(row.amount) ?? '-').toString() },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, WORKFLOW_INSTANCE_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 140,
    // 注意：已提交的审批单在这里拿不到对应 WorkflowInstance 的 id（列表接口不返回这层关联，
    // 只有刚提交那一刻的响应里有），所以非 DRAFT 状态暂不提供"查看详情"跳转，避免链接到错误的 id。
    // 后续如需支持，要在后端加一个按 businessId 反查 WorkflowInstance 的接口。
    render: (row) =>
      row.status === 'DRAFT'
        ? h(
            NButton,
            { size: 'small', type: 'primary', loading: submittingId.value === row.id, onClick: () => handleSubmitApproval(row) },
            { default: () => '提交审批' },
          )
        : null,
  },
]

onMounted(fetchList)
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <span />
      <n-button type="primary" @click="openCreateModal">新建示例审批单</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: DemoApprovalRequest) => r.id" :scroll-x="760" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建示例审批单" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="标题">
            <n-input v-model:value="model.title" />
          </n-form-item>
          <n-form-item label="内容">
            <n-input v-model:value="model.content" type="textarea" />
          </n-form-item>
          <n-form-item label="金额（元）">
            <n-input-number v-model:value="model.amountYuan" style="width: 100%" :precision="2" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleCreate">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
