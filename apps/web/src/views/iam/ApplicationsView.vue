<script setup lang="ts">
import { onMounted } from 'vue'
import GenericListView from '../../components/generic-crud/GenericListView.vue'
import GenericFormModal from '../../components/generic-crud/GenericFormModal.vue'
import { useCrudResource } from '../../composables/useCrudResource'
import { applicationApi } from '../../api/modules/application.api'
import type { CrudColumn, CrudFormField } from '../../components/generic-crud/types'
import type { Application } from '../../api/types/application'
import { renderStatusBadge, COMMON_STATUS_MAP, APPLICATION_TYPE_MAP } from '../../utils/status-map'

const crud = useCrudResource(applicationApi, '应用', (row) => row.name)

const columns: CrudColumn<Application>[] = [
  { key: 'code', title: '编码' },
  { key: 'name', title: '名称' },
  { key: 'type', title: '类型', render: (row) => renderStatusBadge(row.type, APPLICATION_TYPE_MAP) },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
]

const fields: CrudFormField[] = [
  { key: 'code', label: '编码', component: 'input', showOn: 'create', rules: [{ required: true, message: '请输入编码' }] },
  { key: 'name', label: '名称', component: 'input', showOn: 'both', rules: [{ required: true, message: '请输入名称' }] },
  {
    key: 'type',
    label: '类型',
    component: 'select',
    showOn: 'create',
    rules: [{ required: true, message: '请选择类型' }],
    options: [
      { label: 'Web 端', value: 'WEB' },
      { label: '移动端', value: 'MOBILE' },
      { label: '开放接口', value: 'OPENAPI' },
    ],
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
    resource-name="应用"
    :columns="columns"
    :rows="crud.rows.value"
    :loading="crud.loading.value"
    @create="crud.openCreateModal"
    @edit="crud.openEditModal"
    @delete="(row) => crud.confirmDelete(row)"
  />
  <GenericFormModal
    v-model:visible="crud.formVisible.value"
    :title="crud.editingRow.value ? '编辑应用' : '新建应用'"
    :fields="fields"
    :initial-data="crud.editingRow.value"
    :submitting="crud.submitting.value"
    @submit="crud.submitForm"
  />
</template>
