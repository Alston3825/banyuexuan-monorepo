<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NDynamicInput, NAlert, type DataTableColumns, type FormInst } from 'naive-ui'
import { careOutreachTemplateApi } from '../../api/modules/care.api'
import type { CareOutreachTemplate, CareOutreachTemplateItemInput } from '../../api/types/care'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

interface ItemRow extends CareOutreachTemplateItemInput {
  key: number
}

const rows = ref<CareOutreachTemplate[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<CareOutreachTemplate | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

let itemRowKey = 0

const model = ref({
  code: '',
  name: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  items: [] as ItemRow[],
})

function createItemRow(): ItemRow {
  return { key: itemRowKey++, dayOffset: 0, title: '', content: '' }
}

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await careOutreachTemplateApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { code: '', name: '', status: 'ACTIVE', items: [createItemRow()] }
  formVisible.value = true
}

function openEditModal(row: CareOutreachTemplate) {
  editingRow.value = row
  model.value = {
    code: row.code,
    name: row.name,
    status: row.status,
    items: row.items
      .slice()
      .sort((a, b) => a.dayOffset - b.dayOffset)
      .map((i) => ({ key: itemRowKey++, dayOffset: i.dayOffset, title: i.title, content: i.content ?? '' })),
  }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  if (model.value.items.length === 0 || model.value.items.some((i) => !i.title.trim())) {
    message.error('至少需要一个关怀节点，且每个节点都要填写标题')
    return
  }
  submitting.value = true
  try {
    const itemsPayload: CareOutreachTemplateItemInput[] = model.value.items.map((i) => ({ dayOffset: i.dayOffset, title: i.title, content: i.content || undefined }))
    if (editingRow.value) {
      await careOutreachTemplateApi.update(editingRow.value.id, {
        name: model.value.name,
        status: model.value.status,
        items: itemsPayload,
        version: editingRow.value.version,
      })
      message.success('关怀模板已更新')
    } else {
      await careOutreachTemplateApi.create({ code: model.value.code, name: model.value.name, items: itemsPayload })
      message.success('关怀模板已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<CareOutreachTemplate> = [
  { key: 'name', title: '模板名称' },
  { key: 'code', title: '编码' },
  { key: 'itemCount', title: '关怀节点数', render: (row) => row.items.length },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
  },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-alert type="info" :bordered="false" style="margin-bottom: 12px">
      关怀模板是总部统一的运营框架，具体第几天提醒什么内容需要你或护理团队自行填写——不代表AI给出的医学建议，请按实际护理规范审阅调整。
    </n-alert>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建关怀模板</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: CareOutreachTemplate) => r.id" :scroll-x="700" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑关怀模板' : '新建关怀模板'" style="width: min(640px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="90">
          <n-form-item v-if="!editingRow" label="编码" path="code" :rule="{ required: true, message: '请输入编码' }">
            <n-input v-model:value="model.code" placeholder="如 default_outreach" />
          </n-form-item>
          <n-form-item label="模板名称" path="name" :rule="{ required: true, message: '请输入模板名称' }">
            <n-input v-model:value="model.name" />
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
          <n-form-item label="关怀节点">
            <n-dynamic-input v-model:value="model.items" :on-create="createItemRow">
              <template #="{ value }: { value: ItemRow }">
                <n-space :wrap="false" align="center" style="width: 100%; overflow-x: auto; padding-bottom: 4px">
                  <n-input-number v-model:value="value.dayOffset" :min="0" placeholder="第几天" style="width: min(110px, 94vw)" />
                  <n-input v-model:value="value.title" placeholder="节点标题" style="width: min(160px, 94vw)" />
                  <n-input v-model:value="value.content" placeholder="提醒要点（可选）" />
                </n-space>
              </template>
            </n-dynamic-input>
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
