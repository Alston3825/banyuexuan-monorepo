<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NSpace, NCard, NModal, NRadio, NRadioGroup, NCheckbox, NCheckboxGroup, NInput, NEmpty, NTabs, NTabPane, NDescriptions, NDescriptionsItem } from 'naive-ui'
import { examAttemptApi } from '../../api/modules/training.api'
import type { AvailableExam, ExamAttempt, SanitizedExamQuestion, SubmitExamAnswerInput } from '../../api/types/training'
import { EXAM_ATTEMPT_STATUS_MAP, EXAM_QUESTION_TYPE_LABEL_MAP, renderStatusBadge } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const availableExams = ref<AvailableExam[]>([])
const myAttempts = ref<ExamAttempt[]>([])
const loading = ref(false)

const takingExam = ref<AvailableExam | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const answerModel = ref<Record<string, any>>({})
const submitting = ref(false)

async function fetchAll() {
  loading.value = true
  try {
    const [exams, attempts] = await Promise.all([examAttemptApi.listAvailableExams(), examAttemptApi.listMine()])
    availableExams.value = exams
    myAttempts.value = attempts
  } finally {
    loading.value = false
  }
}

function openExam(exam: AvailableExam) {
  takingExam.value = exam
  answerModel.value = {}
  for (const q of exam.questions) {
    if (q.type === 'MULTIPLE_CHOICE') answerModel.value[q.id] = []
    else if (q.type === 'SHORT_ANSWER') answerModel.value[q.id] = ''
    else answerModel.value[q.id] = null
  }
}

function optionLabel(q: SanitizedExamQuestion, key: string) {
  return q.options?.find((o) => o.key === key)?.text ?? key
}

async function handleSubmitAttempt() {
  if (!takingExam.value) return
  const unanswered = takingExam.value.questions.filter((q) => {
    const v = answerModel.value[q.id]
    if (q.type === 'MULTIPLE_CHOICE') return !Array.isArray(v) || v.length === 0
    if (q.type === 'SHORT_ANSWER') return !String(v ?? '').trim()
    return v === null || v === undefined
  })
  if (unanswered.length > 0) {
    message.error('还有题目未作答')
    return
  }
  submitting.value = true
  try {
    const answers: SubmitExamAnswerInput[] = takingExam.value.questions.map((q) => {
      const v = answerModel.value[q.id]
      if (q.type === 'SHORT_ANSWER') return { questionId: q.id, textAnswer: String(v) }
      if (q.type === 'SINGLE_CHOICE') return { questionId: q.id, selectedKeys: [v] }
      if (q.type === 'MULTIPLE_CHOICE') return { questionId: q.id, selectedKeys: v }
      return { questionId: q.id, selectedKeys: v } // TRUE_FALSE：v 本身就是 true/false
    })
    await examAttemptApi.submit({ examId: takingExam.value.id, answers })
    message.success('提交成功')
    takingExam.value = null
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const sortedAttempts = computed(() => myAttempts.value.slice().sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()))

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-tabs type="line" default-value="available">
      <n-tab-pane name="available" tab="可参加的考试">
        <n-empty v-if="!loading && availableExams.length === 0" description="暂无可参加的考试" />
        <n-space vertical :size="12">
          <n-card v-for="exam in availableExams" :key="exam.id" size="small" :title="exam.title">
            <p v-if="exam.studyMaterial" style="white-space: pre-wrap; color: var(--n-text-color-3, #666)">{{ exam.studyMaterial }}</p>
            <n-space justify="space-between" align="center">
              <span>共 {{ exam.questions.length }} 题{{ exam.passScore ? `，及格线 ${exam.passScore} 分` : '' }}</span>
              <n-button type="primary" size="small" @click="openExam(exam)">开始作答</n-button>
            </n-space>
          </n-card>
        </n-space>
      </n-tab-pane>
      <n-tab-pane name="mine" tab="我的成绩">
        <n-empty v-if="!loading && sortedAttempts.length === 0" description="暂无考试记录" />
        <n-space vertical :size="12">
          <n-card v-for="attempt in sortedAttempts" :key="attempt.id" size="small">
            <n-descriptions bordered size="small" :column="3">
              <n-descriptions-item label="试卷">{{ attempt.exam.title }}</n-descriptions-item>
              <n-descriptions-item label="提交时间">{{ new Date(attempt.submittedAt).toLocaleString() }}</n-descriptions-item>
              <n-descriptions-item label="状态"><component :is="() => renderStatusBadge(attempt.status, EXAM_ATTEMPT_STATUS_MAP)" /></n-descriptions-item>
              <n-descriptions-item label="得分">{{ attempt.totalScore ?? '待批阅' }}</n-descriptions-item>
            </n-descriptions>
          </n-card>
        </n-space>
      </n-tab-pane>
    </n-tabs>

    <n-modal :show="!!takingExam" @update:show="(v) => !v && (takingExam = null)">
      <n-card v-if="takingExam" :title="takingExam.title" style="width: 640px; max-height: 80vh; overflow-y: auto" :bordered="false" role="dialog" aria-modal="true">
        <n-space vertical :size="16">
          <n-card v-for="(q, idx) in takingExam.questions" :key="q.id" size="small" embedded>
            <template #header>{{ idx + 1 }}. [{{ EXAM_QUESTION_TYPE_LABEL_MAP[q.type] }}，{{ q.score }}分] {{ q.content }}</template>
            <n-radio-group v-if="q.type === 'SINGLE_CHOICE'" v-model:value="answerModel[q.id]">
              <n-space vertical>
                <n-radio v-for="opt in q.options ?? []" :key="opt.key" :value="opt.key">{{ optionLabel(q, opt.key) }}</n-radio>
              </n-space>
            </n-radio-group>
            <n-checkbox-group v-else-if="q.type === 'MULTIPLE_CHOICE'" v-model:value="answerModel[q.id] as string[]">
              <n-space vertical>
                <n-checkbox v-for="opt in q.options ?? []" :key="opt.key" :value="opt.key">{{ optionLabel(q, opt.key) }}</n-checkbox>
              </n-space>
            </n-checkbox-group>
            <n-radio-group v-else-if="q.type === 'TRUE_FALSE'" v-model:value="answerModel[q.id]">
              <n-space>
                <n-radio :value="true">正确</n-radio>
                <n-radio :value="false">错误</n-radio>
              </n-space>
            </n-radio-group>
            <n-input v-else v-model:value="answerModel[q.id] as string" type="textarea" placeholder="请输入答案" :autosize="{ minRows: 2 }" />
          </n-card>
        </n-space>
        <template #footer>
          <n-space justify="end">
            <n-button @click="takingExam = null">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmitAttempt">提交作答</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
