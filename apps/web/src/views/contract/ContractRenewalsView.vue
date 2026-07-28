<script setup lang="ts">
import { h, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NSpace, NDataTable, NSelect, NForm, NFormItem, type DataTableColumns } from 'naive-ui'
import { contractApi } from '../../api/modules/contract.api'
import { customerApi } from '../../api/modules/customer.api'
import { storeApi } from '../../api/modules/store.api'
import type { Contract, ContractStatus } from '../../api/types/contract'
import { renderStatusBadge, CONTRACT_STATUS_MAP } from '../../utils/status-map'
import { toMajorUnits } from '../../utils/money'

const router = useRouter()
const rows = ref<Contract[]>([])
const loading = ref(false)

const customerOptions = ref<{ label: string; value: string }[]>([])
const customerNameById = ref<Record<string, string>>({})
const storeNameById = ref<Record<string, string>>({})
// 续签记录里的 renewalOfContractId 指向的原合同，可能不在本页数据集合中，单独维护一份编号映射。
const contractNoById = ref<Record<string, string>>({})

const filters = reactive<{ customerId?: string; status?: ContractStatus }>({})

const statusOptions = Object.entries(CONTRACT_STATUS_MAP).map(([value, meta]) => ({ label: meta.label, value }))

async function fetchOptions() {
  const [customers, stores] = await Promise.all([customerApi.list(), storeApi.list()])
  customerOptions.value = customers.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id }))
  customerNameById.value = Object.fromEntries(customers.map((c) => [c.id, c.name]))
  storeNameById.value = Object.fromEntries(stores.map((s) => [s.id, s.name]))
}

async function fetchList() {
  loading.value = true
  try {
    rows.value = await contractApi.list({ isRenewal: true, customerId: filters.customerId, status: filters.status })
    const missingIds = Array.from(new Set(rows.value.map((r) => r.renewalOfContractId).filter((id): id is string => !!id && !contractNoById.value[id])))
    if (missingIds.length) {
      const originals = await Promise.all(missingIds.map((id) => contractApi.get(id)))
      for (const o of originals) contractNoById.value[o.id] = o.contractNo
    }
  } finally {
    loading.value = false
  }
}

const columns: DataTableColumns<Contract> = [
  { key: 'contractNo', title: '续签合同编号' },
  {
    key: 'renewalOfContractId',
    title: '原合同',
    render: (row) =>
      row.renewalOfContractId
        ? h(
            'a',
            { style: 'cursor:pointer;color:#18a058', onClick: () => router.push(`/contract/records/${row.renewalOfContractId}`) },
            contractNoById.value[row.renewalOfContractId] ?? row.renewalOfContractId,
          )
        : '-',
  },
  { key: 'customerId', title: '客户', render: (row) => customerNameById.value[row.customerId] ?? row.customerId },
  { key: 'storeId', title: '门店', render: (row) => storeNameById.value[row.storeId] ?? row.storeId },
  { key: 'amount', title: '续签金额（元）', render: (row) => toMajorUnits(row.amount) },
  {
    key: 'range',
    title: '续签服务起止',
    render: (row) => `${new Date(row.startDate).toLocaleDateString()} ~ ${new Date(row.endDate).toLocaleDateString()}`,
  },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, CONTRACT_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => router.push(`/contract/records/${row.id}`) }, { default: () => '查看详情' }),
  },
]

onMounted(async () => {
  await fetchOptions()
  await fetchList()
})
</script>

<template>
  <div>
    <n-form inline label-placement="left" style="margin-bottom: 12px">
      <n-form-item label="客户">
        <n-select
          v-model:value="filters.customerId"
          :options="customerOptions"
          filterable
          clearable
          placeholder="全部客户"
          style="width: 220px"
          @update:value="fetchList"
        />
      </n-form-item>
      <n-form-item label="状态">
        <n-select
          v-model:value="filters.status"
          :options="statusOptions"
          clearable
          placeholder="全部状态"
          style="width: 160px"
          @update:value="fetchList"
        />
      </n-form-item>
    </n-form>
    <n-space justify="end" style="margin-bottom: 12px">
      <span style="color: #999">续签记录由合同详情页的"续签"操作生成，本页仅供查询</span>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Contract) => r.id" :scroll-x="1000" />
  </div>
</template>
