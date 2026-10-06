<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GenericListView from '../../components/generic-crud/GenericListView.vue'
import GenericFormModal from '../../components/generic-crud/GenericFormModal.vue'
import { useCrudResource } from '../../composables/useCrudResource'
import { departmentApi } from '../../api/modules/department.api'
import { storeApi } from '../../api/modules/store.api'
import type { CrudColumn, CrudFormField } from '../../components/generic-crud/types'
import type { Department } from '../../api/types/department'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'

const crud = useCrudResource(departmentApi, '部门', (row) => row.name)

// 同一个部门名称（比如"销售部"）在不同门店各建一个是正常业务场景，列表里必须能看出
// 每一行属于哪个门店，否则完全没法区分——之前列表只有名称+状态两列，看不出来。
const storeNameById = ref<Record<string, string>>({})
async function loadStoreNames() {
  const stores = await storeApi.list()
  storeNameById.value = Object.fromEntries(stores.map((s) => [s.id, s.name]))
}

const columns: CrudColumn<Department>[] = [
  { key: 'name', title: '名称' },
  { key: 'storeId', title: '所属门店', render: (row) => (row.storeId ? (storeNameById.value[row.storeId] ?? row.storeId) : '总部/跨店') },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
]

const fields: CrudFormField[] = [
  { key: 'name', label: '名称', component: 'input', showOn: 'both', rules: [{ required: true, message: '请输入名称' }] },
  {
    key: 'storeId',
    label: '所属门店',
    component: 'select',
    showOn: 'create',
    placeholder: '不选则为总部/跨店部门',
    options: async () => {
      const stores = await storeApi.list()
      return stores.map((s) => ({ label: s.name, value: s.id }))
    },
  },
  {
    key: 'status',
    label: '状态',
    component: 'select',
    showOn: 'update',
    options: [
      { label: '启用', value: 'ACTIVE' },
      { label: '停用', value: 'INACTIVE' },
    ],
  },
]

onMounted(async () => {
  await Promise.all([crud.fetchList(), loadStoreNames()])
})
</script>

<template>
  <GenericListView
    resource-name="部门"
    :columns="columns"
    :rows="crud.rows.value"
    :loading="crud.loading.value"
    @create="crud.openCreateModal"
    @edit="crud.openEditModal"
    @delete="(row) => crud.confirmDelete(row)"
  />
  <GenericFormModal
    v-model:visible="crud.formVisible.value"
    :title="crud.editingRow.value ? '编辑部门' : '新建部门'"
    :fields="fields"
    :initial-data="crud.editingRow.value"
    :submitting="crud.submitting.value"
    @submit="crud.submitForm"
  />
</template>
