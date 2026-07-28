<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NDynamicTags, type DataTableColumns, type FormInst } from 'naive-ui'
import { mealItemApi } from '../../api/modules/meal.api'
import type { MealItem, MealSlot } from '../../api/types/meal'
import { renderStatusBadge, COMMON_STATUS_MAP, MEAL_SLOT_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const SLOT_OPTIONS = Object.entries(MEAL_SLOT_LABEL_MAP).map(([value, label]) => ({ label, value }))

const rows = ref<MealItem[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<MealItem | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  code: '',
  name: '',
  defaultSlot: 'LUNCH' as MealSlot,
  ingredientTags: [] as string[],
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchList() {
  loading.value = true
  try {
    rows.value = await mealItemApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', defaultSlot: 'LUNCH', ingredientTags: [], status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: MealItem) {
  editingRow.value = row
  model.value = { code: row.code, name: row.name, defaultSlot: row.defaultSlot, ingredientTags: row.ingredientTags ? [...row.ingredientTags] : [], status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await mealItemApi.update(editingRow.value.id, {
        name: model.value.name,
        defaultSlot: model.value.defaultSlot,
        ingredientTags: model.value.ingredientTags,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('菜品已更新')
    } else {
      await mealItemApi.create({
        code: model.value.code,
        name: model.value.name,
        defaultSlot: model.value.defaultSlot,
        ingredientTags: model.value.ingredientTags,
      })
      message.success('菜品已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<MealItem> = [
  { key: 'name', title: '菜品名称' },
  { key: 'code', title: '编码' },
  { key: 'defaultSlot', title: '默认餐次', render: (row) => MEAL_SLOT_LABEL_MAP[row.defaultSlot] },
  { key: 'ingredientTags', title: '食材标签', render: (row) => (row.ingredientTags && row.ingredientTags.length > 0 ? row.ingredientTags.join('、') : '-') },
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
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建菜品</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: MealItem) => r.id" :scroll-x="800" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑菜品' : '新建菜品'" style="width: 520px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="100">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 egg_custard" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" placeholder="如 鸡蛋羹" />
          </n-form-item>
          <n-form-item label="默认餐次">
            <n-select v-model:value="model.defaultSlot" :options="SLOT_OPTIONS" />
          </n-form-item>
          <n-form-item label="食材标签">
            <n-dynamic-tags v-model:value="model.ingredientTags" />
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
