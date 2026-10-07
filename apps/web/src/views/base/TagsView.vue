<script setup lang="ts">
import { onMounted } from 'vue'
import GenericListView from '../../components/generic-crud/GenericListView.vue'
import GenericFormModal from '../../components/generic-crud/GenericFormModal.vue'
import { useCrudResource } from '../../composables/useCrudResource'
import { tagApi } from '../../api/modules/tag.api'
import type { CrudColumn, CrudFormField } from '../../components/generic-crud/types'
import type { Tag } from '../../api/types/tag'

const crud = useCrudResource(tagApi, '标签', (row) => row.name)

// 标签分类：决定这个标签出现在哪个地方的下拉框里（如“母婴风险标签”只出现在母婴档案的风险标签里）
const CATEGORY_LABELS: Record<string, string> = {
  CARE_RISK: '母婴风险标签（母婴档案）',
  CUSTOMER_CLASSIFICATION: '客户分类 A~E（客户管理）',
  CUSTOMER_TYPE: '客户类型（客户管理）',
}
const categoryOptions = [...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ label, value })), { label: '其他（不限用途）', value: 'OTHER' }]

const columns: CrudColumn<Tag>[] = [
  { key: 'name', title: '名称' },
  { key: 'category', title: '分类', render: (row) => (row.category ? CATEGORY_LABELS[row.category] ?? row.category : '-') },
  { key: 'color', title: '颜色', render: (row) => row.color ?? '-' },
]

const fields: CrudFormField[] = [
  { key: 'name', label: '名称', component: 'input', showOn: 'both', rules: [{ required: true, message: '请输入名称' }] },
  { key: 'category', label: '分类', component: 'select', options: categoryOptions, showOn: 'both', placeholder: '母婴风险标签选第一项' },
  { key: 'color', label: '颜色', component: 'input', showOn: 'both', placeholder: '如 #1f3a5f' },
]

onMounted(crud.fetchList)
</script>

<template>
  <GenericListView
    resource-name="标签"
    :columns="columns"
    :rows="crud.rows.value"
    :loading="crud.loading.value"
    @create="crud.openCreateModal"
    @edit="crud.openEditModal"
    @delete="(row) => crud.confirmDelete(row)"
  />
  <GenericFormModal
    v-model:visible="crud.formVisible.value"
    :title="crud.editingRow.value ? '编辑标签' : '新建标签'"
    :fields="fields"
    :initial-data="crud.editingRow.value"
    :submitting="crud.submitting.value"
    @submit="crud.submitForm"
  />
</template>
