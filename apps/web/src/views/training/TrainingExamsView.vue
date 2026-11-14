<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NDynamicInput, NAlert, type DataTableColumns, type FormInst } from 'naive-ui'
import { trainingExamApi } from '../../api/modules/training.api'
import type { ExamQuestionInput, ExamQuestionType, TrainingExam } from '../../api/types/training'
import { renderStatusBadge, TRAINING_EXAM_STATUS_MAP, EXAM_QUESTION_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

interface QuestionRow {
  key: number
  order: number
  type: ExamQuestionType
  content: string
  score: number
  optionsText: string // 每行一个选项，格式 "key|文本"
  correctAnswerText: string // 选择题："A" 或 "A,C"；判断题："true"/"false"；简答题不需要
}

const rows = ref<TrainingExam[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<TrainingExam | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

let questionRowKey = 0

const model = ref({
  title: '',
  studyMaterial: '',
  passScore: null as number | null,
  status: 'DRAFT' as TrainingExam['status'],
  questions: [] as QuestionRow[],
})

const questionTypeOptions = Object.entries(EXAM_QUESTION_TYPE_LABEL_MAP).map(([value, label]) => ({ label, value }))

function createQuestionRow(): QuestionRow {
  return { key: questionRowKey++, order: model.value.questions.length + 1, type: 'SINGLE_CHOICE', content: '', score: 10, optionsText: 'A|选项一\nB|选项二', correctAnswerText: 'A' }
}

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await trainingExamApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { title: '', studyMaterial: '', passScore: null, status: 'DRAFT', questions: [createQuestionRow()] }
  formVisible.value = true
}

function openEditModal(row: TrainingExam) {
  editingRow.value = row
  model.value = {
    title: row.title,
    studyMaterial: row.studyMaterial ?? '',
    passScore: row.passScore,
    status: row.status,
    questions:
      row.status === 'DRAFT'
        ? row.questions
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((q) => ({
              key: questionRowKey++,
              order: q.order,
              type: q.type,
              content: q.content,
              score: q.score,
              optionsText: (q.options ?? []).map((o) => `${o.key}|${o.text}`).join('\n'),
              correctAnswerText: q.type === 'TRUE_FALSE' ? String(q.correctAnswer ?? 'true') : Array.isArray(q.correctAnswer) ? q.correctAnswer.join(',') : '',
            }))
        : [],
  }
  formVisible.value = true
}

function parseQuestions(questionRows: QuestionRow[]): ExamQuestionInput[] {
  return questionRows.map((q, idx) => {
    const options =
      q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE'
        ? q.optionsText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [key, ...rest] = line.split('|')
              return { key: key.trim(), text: rest.join('|').trim() }
            })
        : undefined
    let correctAnswer: unknown
    if (q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE') {
      correctAnswer = q.correctAnswerText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (q.type === 'TRUE_FALSE') {
      correctAnswer = q.correctAnswerText.trim().toLowerCase() === 'true'
    }
    return { order: idx + 1, type: q.type, content: q.content, options, correctAnswer, score: q.score }
  })
}

async function handleSubmit() {
  await formRef.value?.validate()
  if (model.value.questions.length === 0) {
    message.error('至少需要一道题目')
    return
  }
  if (model.value.questions.some((q) => !q.content.trim())) {
    message.error('每道题目都要填写题干')
    return
  }
  submitting.value = true
  try {
    if (editingRow.value) {
      await trainingExamApi.update(editingRow.value.id, {
        title: model.value.title,
        studyMaterial: model.value.studyMaterial || undefined,
        passScore: model.value.passScore ?? undefined,
        status: model.value.status,
        questions: editingRow.value.status === 'DRAFT' ? parseQuestions(model.value.questions) : undefined,
        version: editingRow.value.version,
      })
      message.success('试卷已更新')
    } else {
      await trainingExamApi.create({
        title: model.value.title,
        studyMaterial: model.value.studyMaterial || undefined,
        passScore: model.value.passScore ?? undefined,
        questions: parseQuestions(model.value.questions),
      })
      message.success('试卷已创建（草稿状态，需发布后员工才能作答）')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<TrainingExam> = [
  { key: 'title', title: '试卷名称' },
  { key: 'passScore', title: '及格线', render: (row) => row.passScore ?? '-' },
  { key: 'questionCount', title: '题目数', render: (row) => row.questions.length },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, TRAINING_EXAM_STATUS_MAP) },
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
      试卷是总部统一培训标准。草稿状态可以自由修改题目；发布(PUBLISHED)后员工才能参加考试，且发布后不能再整体替换题目列表（如需变更请重新创建试卷）。
    </n-alert>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建试卷</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: TrainingExam) => r.id" :scroll-x="800" />

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑试卷' : '新建试卷'" style="width: min(720px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="90">
          <n-form-item label="试卷名称" path="title" :rule="{ required: true, message: '请输入试卷名称' }">
            <n-input v-model:value="model.title" />
          </n-form-item>
          <n-form-item label="学习资料"><n-input v-model:value="model.studyMaterial" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" placeholder="考前学习资料，自由文本" /></n-form-item>
          <n-form-item label="及格线"><n-input-number v-model:value="model.passScore" :min="0" style="width: 100%" /></n-form-item>
          <n-form-item v-if="editingRow" label="状态">
            <n-select
              v-model:value="model.status"
              :options="[
                { label: '草稿', value: 'DRAFT' },
                { label: '已发布', value: 'PUBLISHED' },
                { label: '已归档', value: 'ARCHIVED' },
              ]"
            />
          </n-form-item>
          <n-form-item v-if="!editingRow || editingRow.status === 'DRAFT'" label="题目">
            <n-dynamic-input v-model:value="model.questions" :on-create="createQuestionRow">
              <template #="{ value }: { value: QuestionRow }">
                <n-card size="small" embedded style="width: 100%; margin-bottom: 8px">
                  <n-space vertical :size="8">
                    <n-space :wrap="false" align="center">
                      <n-select v-model:value="value.type" :options="questionTypeOptions" style="width: min(140px, 94vw)" />
                      <n-input-number v-model:value="value.score" :min="1" placeholder="分值" style="width: min(100px, 94vw)" />
                    </n-space>
                    <n-input v-model:value="value.content" placeholder="题干" />
                    <template v-if="value.type === 'SINGLE_CHOICE' || value.type === 'MULTIPLE_CHOICE'">
                      <n-input v-model:value="value.optionsText" type="textarea" placeholder="每行一个选项，格式：A|选项文本" :autosize="{ minRows: 2 }" />
                      <n-input v-model:value="value.correctAnswerText" placeholder="正确答案的选项key，多个用逗号分隔，如 A 或 A,C" />
                    </template>
                    <n-select
                      v-else-if="value.type === 'TRUE_FALSE'"
                      v-model:value="value.correctAnswerText"
                      :options="[
                        { label: '正确', value: 'true' },
                        { label: '错误', value: 'false' },
                      ]"
                      placeholder="正确答案"
                    />
                  </n-space>
                </n-card>
              </template>
            </n-dynamic-input>
          </n-form-item>
          <n-alert v-else type="warning" :bordered="false">试卷已发布，题目列表不可编辑</n-alert>
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
