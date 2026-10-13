<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NAlert, type DataTableColumns, type FormInst } from 'naive-ui'
import { knowledgeDocumentApi } from '../../api/modules/knowledge.api'
import type { KnowledgeDocument } from '../../api/types/knowledge'
import { renderStatusBadge, COMMON_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<KnowledgeDocument[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<KnowledgeDocument | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const model = ref({
  title: '',
  content: '',
  category: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
})

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await knowledgeDocumentApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { title: '', content: '', category: '', status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: KnowledgeDocument) {
  editingRow.value = row
  model.value = { title: row.title, content: row.content, category: row.category ?? '', status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await knowledgeDocumentApi.update(editingRow.value.id, {
        title: model.value.title,
        content: model.value.content,
        category: model.value.category || undefined,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('知识库文档已更新（正文若有变动会重新生成向量索引）')
    } else {
      await knowledgeDocumentApi.create({
        title: model.value.title,
        content: model.value.content,
        category: model.value.category || undefined,
      })
      message.success('知识库文档已创建，正在后台生成向量索引')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: KnowledgeDocument) {
  if (!window.confirm(`确认删除知识库文档「${row.title}」？其检索片段也会一并删除。`)) return
  await knowledgeDocumentApi.delete(row.id)
  message.success('知识库文档已删除')
  await fetchAll()
}

const columns: DataTableColumns<KnowledgeDocument> = [
  { key: 'title', title: '标题' },
  { key: 'category', title: '分类', render: (row) => row.category ?? '-' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
  { key: 'updatedAt', title: '更新时间', render: (row) => new Date(row.updatedAt).toLocaleString() },
  {
    key: 'actions',
    title: '操作',
    width: 160,
    render: (row) =>
      h(NSpace, {}, { default: () => [h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }), h(NButton, { size: 'small', onClick: () => handleDelete(row) }, { default: () => '删除' })] }),
  },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-alert type="info" :bordered="false" style="margin-bottom: 12px">
      供智能客服/护理异常建议两个AI场景检索参考。创建/修改正文时会自动分段并调用模型网关生成向量索引，无需手动处理。
    </n-alert>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建知识库文档</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: KnowledgeDocument) => r.id" :scroll-x="800" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑知识库文档' : '新建知识库文档'" style="width: min(640px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="80">
          <n-form-item label="标题" path="title" :rule="{ required: true, message: '请输入标题' }">
            <n-input v-model:value="model.title" />
          </n-form-item>
          <n-form-item label="分类"><n-input v-model:value="model.category" placeholder="如 合同模板说明/护理规范/常见问题" /></n-form-item>
          <n-form-item label="正文" path="content" :rule="{ required: true, message: '请输入正文' }">
            <n-input v-model:value="model.content" type="textarea" :autosize="{ minRows: 8, maxRows: 20 }" />
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
