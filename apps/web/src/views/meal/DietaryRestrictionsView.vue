<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NAlert, type DataTableColumns, type FormInst } from 'naive-ui'
import { dietaryRestrictionApi } from '../../api/modules/meal.api'
import type { DietaryRestriction, DietaryRestrictionCategory } from '../../api/types/meal'
import { renderStatusBadge, COMMON_STATUS_MAP, DIETARY_RESTRICTION_CATEGORY_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<DietaryRestriction[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<DietaryRestriction | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  category: 'INGREDIENT' as DietaryRestrictionCategory,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await dietaryRestrictionApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', category: 'INGREDIENT', status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: DietaryRestriction) {
  editingRow.value = row
  model.value = { code: row.code, name: row.name, category: row.category, status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await dietaryRestrictionApi.update(editingRow.value.id, { name: model.value.name, status: model.value.status, version: editingRow.value.version })
      message.success('禁忌已更新')
    } else {
      await dietaryRestrictionApi.create({ code: model.value.code, name: model.value.name, category: model.value.category })
      message.success('禁忌已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<DietaryRestriction> = [
  { key: 'name', title: '禁忌名称' },
  { key: 'code', title: '编码' },
  { key: 'category', title: '类别', render: (row) => DIETARY_RESTRICTION_CATEGORY_LABEL_MAP[row.category] },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
  },
]

onMounted(fetchList)
</script>

<template>
  <div>
    <n-alert type="info" style="margin-bottom: 12px" title="食材类禁忌命名提示">
      食材类禁忌的"名称"需与菜品的"食材标签"完全一致（如都写"鸡蛋"，而非"忌鸡蛋"），系统按名称做冲突匹配。
    </n-alert>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建禁忌</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: DietaryRestriction) => r.id" :scroll-x="700" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑禁忌' : '新建禁忌'" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 egg" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" placeholder="食材类请与食材标签同名，如：鸡蛋" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="类别">
            <n-select
              v-model:value="model.category"
              :options="[
                { label: '食材类', value: 'INGREDIENT' },
                { label: '病理性', value: 'MEDICAL' },
              ]"
            />
          </n-form-item>
          <n-form-item v-if="editingRow" label="状态">
            <n-select
              v-model:value="model.status"
              :options="[
                { label: '启用', value: 'ACTIVE' },
                { label: '停用', value: 'INACTIVE' },
              ]"
            />
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
