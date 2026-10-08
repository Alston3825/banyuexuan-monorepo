<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NInput, NRadioButton, NRadioGroup, type DataTableColumns } from 'naive-ui'
import { customerApi } from '../../api/modules/customer.api'
import { customerChannelApi } from '../../api/modules/customer-channel.api'
import { storeApi } from '../../api/modules/store.api'
import type { Customer, StaffOption } from '../../api/types/customer'
import { useAuthStore } from '../../stores/auth'
import RecordRemovalDialog from '../../components/crm/RecordRemovalDialog.vue'

const router = useRouter()
const rows = ref<Customer[]>([])
const loading = ref(false)
const keyword = ref('')
const auth = useAuthStore()
// 在用 / 已归档（用过的客户不删，只归档；归档的默认不显示，可恢复）
const view = ref<'active' | 'archived'>('active')
const removal = ref<{ id: string; label: string } | null>(null)
const removalShow = ref(false)
function openRemoval(row: Customer) {
  removal.value = { id: row.id, label: row.name }
  removalShow.value = true
}

const storeNameById = ref<Record<string, string>>({})
const staffNameById = ref<Record<string, string>>({})
const channelNameById = ref<Record<string, string>>({})
const typeNameById = ref<Record<string, string>>({})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await customerApi.list({ ...(keyword.value ? { keyword: keyword.value } : {}), ...(view.value === 'archived' ? { archived: 'only' as const } : {}) })
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
    width: 230,
    fixed: 'right',
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => router.push(`/crm/customers/${row.id}/edit`) }, { default: () => '编辑' }),
          h(NButton, { size: 'small', onClick: () => router.push(`/crm/customers/${row.id}`) }, { default: () => '查看详情' }),
          ...(auth.hasAccess('crm.customer.archive')
            ? [h(NButton, { size: 'small', type: row.archivedAt ? 'primary' : 'warning', ghost: true, onClick: () => openRemoval(row) }, { default: () => (row.archivedAt ? '恢复/删除' : '归档/删除') })]
            : []),
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
      <n-space>
        <n-input v-model:value="keyword" placeholder="按姓名/手机号/客户编号搜索" style="width: min(260px, 94vw)" clearable @keyup.enter="fetchList" @clear="fetchList" />
        <n-radio-group v-model:value="view" @update:value="fetchList">
          <n-radio-button value="active">在用</n-radio-button>
          <n-radio-button value="archived">已归档</n-radio-button>
        </n-radio-group>
      </n-space>
      <n-button type="primary" @click="router.push('/crm/customers/new')">新建客户</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Customer) => r.id" :scroll-x="1320" />
    <record-removal-dialog v-if="removal" v-model:show="removalShow" kind="customer" :id="removal.id" :label="removal.label" @done="fetchList" />
  </div>
</template>
