<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NInput, type DataTableColumns } from 'naive-ui'
import { customerApi } from '../../api/modules/customer.api'
import { customerChannelApi } from '../../api/modules/customer-channel.api'
import { storeApi } from '../../api/modules/store.api'
import type { Customer, StaffOption } from '../../api/types/customer'

const router = useRouter()
const rows = ref<Customer[]>([])
const loading = ref(false)
const keyword = ref('')

const storeNameById = ref<Record<string, string>>({})
const staffNameById = ref<Record<string, string>>({})
const channelNameById = ref<Record<string, string>>({})
const typeNameById = ref<Record<string, string>>({})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await customerApi.list(keyword.value ? { keyword: keyword.value } : undefined)
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  // 员工名字用 staff-options（不要求账号管理权限），店员也能看到销售员姓名
  const [stores, staff, channels, types] = await Promise.all([
    storeApi.list(),
    customerApi.staffOptions().catch(() => [] as StaffOption[]),
    customerChannelApi.list().catch(() => []),
    customerChannelApi.listTypes().catch(() => []),
  ])
  storeNameById.value = Object.fromEntries(stores.map((s) => [s.id, s.name]))
  staffNameById.value = Object.fromEntries(staff.map((a) => [a.id, a.realName]))
  channelNameById.value = Object.fromEntries(channels.map((c) => [c.id, c.name]))
  typeNameById.value = Object.fromEntries(types.map((t) => [t.id, t.name]))
}

const name = (map: Record<string, string>, id: string | null) => (id ? map[id] ?? id : '-')

// 新建/编辑都是整页（见 CustomerFormView），这里只负责跳转
const columns: DataTableColumns<Customer> = [
  { key: 'customerNo', title: '客户编号', width: 160 },
  { key: 'name', title: '姓名', width: 100 },
  { key: 'phone', title: '手机号', width: 130 },
  {
    key: 'source',
    title: '渠道',
    width: 170,
    render: (row) => {
      const type = name(typeNameById.value, row.channelTypeId)
      return row.channelId ? `${type} · ${name(channelNameById.value, row.channelId)}` : type
    },
  },
  { key: 'phoneSalesId', title: '电话销售员', width: 100, render: (row) => name(staffNameById.value, row.phoneSalesId) },
  { key: 'assignedToId', title: '门店销售员', width: 100, render: (row) => name(staffNameById.value, row.assignedToId) },
  { key: 'primaryStoreId', title: '建档门店', width: 130, render: (row) => name(storeNameById.value, row.primaryStoreId) },
  { key: 'registeredAt', title: '添加时间', width: 110, render: (row) => row.registeredAt.slice(0, 10) },
  {
    key: 'actions',
    title: '操作',
    width: 160,
    fixed: 'right',
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => router.push(`/crm/customers/${row.id}/edit`) }, { default: () => '编辑' }),
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
      <n-input v-model:value="keyword" placeholder="按姓名/手机号/客户编号搜索" style="width: min(260px, 94vw)" clearable @keyup.enter="fetchList" @clear="fetchList" />
      <n-button type="primary" @click="router.push('/crm/customers/new')">新建客户</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Customer) => r.id" :scroll-x="1250" />
  </div>
</template>
