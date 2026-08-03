<script setup lang="ts">
import { onMounted } from 'vue'
import GenericListView from '../../components/generic-crud/GenericListView.vue'
import GenericFormModal from '../../components/generic-crud/GenericFormModal.vue'
import { useCrudResource } from '../../composables/useCrudResource'
import { positionApi } from '../../api/modules/position.api'
import type { CrudColumn, CrudFormField } from '../../components/generic-crud/types'
import type { Position } from '../../api/types/position'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'

const crud = useCrudResource(positionApi, '职位', (row) => row.name)

const columns: CrudColumn<Position>[] = [
  { key: 'name', title: '名称' },
  { key: 'rank', title: '级别', render: (row) => (row.rank ?? '-').toString() },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
]

const fields: CrudFormField[] = [
  { key: 'name', label: '名称', component: 'input', showOn: 'both', rules: [{ required: true, message: '请输入名称' }] },
  { key: 'rank', label: '级别', component: 'number', showOn: 'create' },
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

onMounted(crud.fetchList)
</script>

<template>
  <GenericListView
    resource-name="职位"
    :columns="columns"
    :rows="crud.rows.value"
    :loading="crud.loading.value"
    @create="crud.openCreateModal"
    @edit="crud.openEditModal"
    @delete="(row) => crud.confirmDelete(row)"
  />
  <GenericFormModal
    v-model:visible="crud.formVisible.value"
    :title="crud.editingRow.value ? '编辑职位' : '新建职位'"
    :fields="fields"
    :initial-data="crud.editingRow.value"
    :submitting="crud.submitting.value"
    @submit="crud.submitForm"
  />
</template>
