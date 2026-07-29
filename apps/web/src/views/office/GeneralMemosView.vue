<script setup lang="ts">
import { computed, h, onMounted, ref, type VNode } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, type DataTableColumns } from 'naive-ui'
import { generalMemoApi } from '../../api/modules/office.api'
import { workflowInstanceApi } from '../../api/modules/workflow-instance.api'
import { storeApi } from '../../api/modules/store.api'
import type { GeneralMemo } from '../../api/types/office'
import type { Store } from '../../api/types/store'
import { renderStatusBadge, OFFICE_APPROVAL_STATUS_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const router = useRouter()

const rows = ref<GeneralMemo[]>([])
const stores = ref<Store[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))

const formVisible = ref(false)
const submitting = ref(false)
const model = ref({ storeId: null as string | null, title: '', content: '' })

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await generalMemoApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  model.value = { storeId: stores.value[0]?.id ?? null, title: '', content: '' }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.storeId || !model.value.title || !model.value.content) {
    message.error('请完整填写门店、标题与正文')
    return
  }
  submitting.value = true
  try {
    await generalMemoApi.create({ storeId: model.value.storeId, title: model.value.title, content: model.value.content })
    message.success('签呈已创建')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function handleSubmitMemo(row: GeneralMemo) {
  dialog.warning({
    title: '提交审核',
    content: '确认提交该签呈进入审批流程？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await generalMemoApi.submit(row.id, row.version)
      message.success('已提交审批')
      await fetchAll()
    },
  })
}

async function viewApprovalProgress(row: GeneralMemo) {
  const instance = await workflowInstanceApi.findByBusiness('GENERAL_MEMO', row.id)
  if (!instance) {
    message.warning('未找到审批实例')
    return
  }
  router.push(`/workflow/instances/${instance.id}`)
}

function handleCancel(row: GeneralMemo) {
  const reason = window.prompt('请输入取消原因')
  if (!reason) return
  generalMemoApi.cancel(row.id, reason, row.version).then(() => {
    message.success('签呈已取消')
    fetchAll()
  })
}

const columns: DataTableColumns<GeneralMemo> = [
  { key: 'applicant', title: '申请人', render: (row) => row.applicant.realName },
  { key: 'title', title: '标题' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, OFFICE_APPROVAL_STATUS_MAP) },
  { key: 'createdAt', title: '创建时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  {
    key: 'actions',
    title: '操作',
    width: 220,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'DRAFT') {
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleSubmitMemo(row) }, { default: () => '提交审核' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'PENDING_APPROVAL') {
        buttons.push(h(NButton, { size: 'small', onClick: () => viewApprovalProgress(row) }, { default: () => '查看审批进度' }))
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      } else if (row.status === 'APPROVED') {
        buttons.push(h(NButton, { size: 'small', onClick: () => handleCancel(row) }, { default: () => '取消' }))
      }
      return h(NSpace, {}, { default: () => buttons })
    },
  },
]

onMounted(async () => {
  stores.value = await storeApi.list()
  await fetchAll()
})
</script>

<template>
  <div>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建签呈</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: GeneralMemo) => r.id" :scroll-x="900" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="新建签呈" style="width: 560px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="门店"><n-select v-model:value="model.storeId" :options="storeOptions" /></n-form-item>
          <n-form-item label="标题"><n-input v-model:value="model.title" /></n-form-item>
          <n-form-item label="正文"><n-input v-model:value="model.content" type="textarea" :autosize="{ minRows: 4 }" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
