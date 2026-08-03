<script setup lang="ts">
import { onMounted } from 'vue'
import GenericListView from '../../components/generic-crud/GenericListView.vue'
import GenericFormModal from '../../components/generic-crud/GenericFormModal.vue'
import { useCrudResource } from '../../composables/useCrudResource'
import { teamApi } from '../../api/modules/team.api'
import { departmentApi } from '../../api/modules/department.api'
import type { CrudColumn, CrudFormField } from '../../components/generic-crud/types'
import type { Team } from '../../api/types/team'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'

const crud = useCrudResource(teamApi, '班组', (row) => row.name)

const columns: CrudColumn<Team>[] = [
  { key: 'name', title: '名称' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
]

const fields: CrudFormField[] = [
  { key: 'name', label: '名称', component: 'input', showOn: 'both', rules: [{ required: true, message: '请输入名称' }] },
  {
    key: 'departmentId',
    label: '所属部门',
    component: 'select',
    showOn: 'create',
    rules: [{ required: true, message: '请选择所属部门' }],
    options: async () => {
      const departments = await departmentApi.list()
      return departments.map((d) => ({ label: d.name, value: d.id }))
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

onMounted(crud.fetchList)
</script>

<template>
  <GenericListView
    resource-name="班组"
    :columns="columns"
    :rows="crud.rows.value"
    :loading="crud.loading.value"
    @create="crud.openCreateModal"
    @edit="crud.openEditModal"
    @delete="(row) => crud.confirmDelete(row)"
  />
  <GenericFormModal
    v-model:visible="crud.formVisible.value"
    :title="crud.editingRow.value ? '编辑班组' : '新建班组'"
    :fields="fields"
    :initial-data="crud.editingRow.value"
    :submitting="crud.submitting.value"
    @submit="crud.submitForm"
  />
</template>
