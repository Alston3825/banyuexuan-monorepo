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
  NSelect,
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import { accountApi } from '../../api/modules/account.api'
import type { Customer } from '../../api/types/customer'
import { CUSTOMER_SOURCE_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const router = useRouter()
const rows = ref<Customer[]>([])
const loading = ref(false)
const keyword = ref('')

const storeOptions = ref<{ label: string; value: string }[]>([])
const storeNameById = ref<Record<string, string>>({})
const accountOptions = ref<{ label: string; value: string }[]>([])
const accountNameById = ref<Record<string, string>>({})

const sourceOptions = Object.entries(CUSTOMER_SOURCE_LABEL_MAP).map(([value, label]) => ({ label, value }))

async function fetchList() {
  loading.value = true
  try {
    rows.value = await customerApi.list(keyword.value ? { keyword: keyword.value } : undefined)
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  const [stores, accounts] = await Promise.all([storeApi.list(), accountApi.list()])
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  storeNameById.value = Object.fromEntries(stores.map((s) => [s.id, s.name]))
  accountOptions.value = accounts.map((a) => ({ label: `${a.realName}（${a.username}）`, value: a.id }))
  accountNameById.value = Object.fromEntries(accounts.map((a) => [a.id, a.realName]))
}

const formVisible = ref(false)
const editingRow = ref<Customer | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const model = ref({
  name: '',
  phone: '',
  source: 'WALK_IN' as Customer['source'],
  primaryStoreId: undefined as string | undefined,
  assignedToId: undefined as string | undefined,
  remark: '',
})

function openCreateModal() {
  editingRow.value = null
  model.value = { name: '', phone: '', source: 'WALK_IN', primaryStoreId: undefined, assignedToId: undefined, remark: '' }
  formVisible.value = true
}

function openEditModal(row: Customer) {
  editingRow.value = row
  model.value = {
    name: row.name,
    phone: row.phone,
    source: row.source,
    primaryStoreId: row.primaryStoreId ?? undefined,
    assignedToId: row.assignedToId ?? undefined,
    remark: row.remark ?? '',
  }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await customerApi.update(editingRow.value.id, {
        name: model.value.name,
        phone: model.value.phone,
        assignedToId: model.value.assignedToId,
        remark: model.value.remark || undefined,
        version: editingRow.value.version,
      })
      message.success('客户已更新')
    } else {
      await customerApi.create({
        name: model.value.name,
        phone: model.value.phone,
        source: model.value.source,
        primaryStoreId: model.value.primaryStoreId,
        assignedToId: model.value.assignedToId,
        remark: model.value.remark || undefined,
      })
      message.success('客户已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<Customer> = [
  { key: 'customerNo', title: '客户编号' },
  { key: 'name', title: '姓名' },
  { key: 'phone', title: '手机号' },
  { key: 'source', title: '来源', render: (row) => CUSTOMER_SOURCE_LABEL_MAP[row.source] ?? row.source },
  { key: 'assignedToId', title: '归属销售', render: (row) => (row.assignedToId ? accountNameById.value[row.assignedToId] ?? row.assignedToId : '-') },
  { key: 'primaryStoreId', title: '建档门店', render: (row) => (row.primaryStoreId ? storeNameById.value[row.primaryStoreId] ?? row.primaryStoreId : '-') },
  {
    key: 'actions',
    title: '操作',
    width: 160,
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
          h(NButton, { size: 'small', onClick: () => router.push(`/crm/customers/${row.id}`) }, { default: () => '查看详情' }),
        ],
      }),
  },
]

onMounted(async () => {
  await Promise.all([fetchList(), fetchPickerOptions()])
})
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <n-input v-model:value="keyword" placeholder="按姓名/手机号搜索" style="width: 240px" clearable @keyup.enter="fetchList" @clear="fetchList" />
      <n-button type="primary" @click="openCreateModal">新建客户</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Customer) => r.id" :scroll-x="960" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑客户' : '新建客户'" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="90">
          <n-form-item label="姓名" path="name" :rule="{ required: true, message: '请输入姓名' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item label="手机号" path="phone" :rule="{ required: true, message: '请输入手机号' }">
            <n-input v-model:value="model.phone" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="来源" path="source">
            <n-select v-model:value="model.source" :options="sourceOptions" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="建档门店" path="primaryStoreId">
            <n-select v-model:value="model.primaryStoreId" :options="storeOptions" clearable />
          </n-form-item>
          <n-form-item label="归属销售" path="assignedToId">
            <n-select v-model:value="model.assignedToId" :options="accountOptions" clearable />
          </n-form-item>
          <n-form-item label="备注" path="remark">
            <n-input v-model:value="model.remark" type="textarea" />
          </n-form-item>
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
