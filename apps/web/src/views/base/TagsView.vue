<script setup lang="ts">
import { onMounted } from 'vue'
import GenericListView from '../../components/generic-crud/GenericListView.vue'
import GenericFormModal from '../../components/generic-crud/GenericFormModal.vue'
import { useCrudResource } from '../../composables/useCrudResource'
import { tagApi } from '../../api/modules/tag.api'
import type { CrudColumn, CrudFormField } from '../../components/generic-crud/types'
import type { Tag } from '../../api/types/tag'

const crud = useCrudResource(tagApi, '标签', (row) => row.name)

const columns: CrudColumn<Tag>[] = [
  { key: 'name', title: '名称' },
  { key: 'category', title: '分类', render: (row) => row.category ?? '-' },
  { key: 'color', title: '颜色', render: (row) => row.color ?? '-' },
]

const fields: CrudFormField[] = [
  { key: 'name', label: '名称', component: 'input', showOn: 'both', rules: [{ required: true, message: '请输入名称' }] },
  { key: 'category', label: '分类', component: 'input', showOn: 'both' },
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
