<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NSpace, NCard, NModal, NInputNumber, NEmpty, NDescriptions, NDescriptionsItem } from 'naive-ui'
import { examAttemptApi } from '../../api/modules/training.api'
import type { ExamAttempt } from '../../api/types/training'
import { message } from '../../utils/discrete-api'

const pending = ref<ExamAttempt[]>([])
const loading = ref(false)

const gradingAttempt = ref<ExamAttempt | null>(null)
const scoreModel = ref<Record<string, number>>({})
const submitting = ref(false)

async function fetchAll() {
  loading.value = true
  try {
    pending.value = await examAttemptApi.listPendingGrading()
  } finally {
    loading.value = false
  }
}

function openGradeModal(attempt: ExamAttempt) {
  gradingAttempt.value = attempt
  scoreModel.value = {}
  for (const a of attempt.answers) {
    if (a.question.type === 'SHORT_ANSWER') scoreModel.value[a.id] = 0
  }
}

async function handleGrade() {
  if (!gradingAttempt.value) return
  submitting.value = true
  try {
    await examAttemptApi.grade(gradingAttempt.value.id, {
      answers: Object.entries(scoreModel.value).map(([answerId, score]) => ({ answerId, score })),
    })
    message.success('批阅完成')
    gradingAttempt.value = null
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-empty v-if="!loading && pending.length === 0" description="暂无待批阅的简答题作答" />
    <n-space vertical :size="12">
      <n-card v-for="attempt in pending" :key="attempt.id" size="small">
        <n-descriptions bordered size="small" :column="3">
          <n-descriptions-item label="试卷">{{ attempt.exam.title }}</n-descriptions-item>
          <n-descriptions-item label="作答人">{{ attempt.account.realName }}（{{ attempt.account.username }}）</n-descriptions-item>
          <n-descriptions-item label="提交时间">{{ new Date(attempt.submittedAt).toLocaleString() }}</n-descriptions-item>
        </n-descriptions>
        <n-space justify="end" style="margin-top: 8px">
          <n-button type="primary" size="small" @click="openGradeModal(attempt)">批阅简答题</n-button>
        </n-space>
      </n-card>
    </n-space>

    <n-modal :show="!!gradingAttempt" @update:show="(v) => !v && (gradingAttempt = null)">
      <n-card v-if="gradingAttempt" title="批阅简答题" style="width: min(600px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-space vertical :size="16">
          <n-card v-for="a in gradingAttempt.answers.filter((x) => x.question.type === 'SHORT_ANSWER')" :key="a.id" size="small" embedded>
            <template #header>{{ a.question.content }}（满分 {{ a.question.score }}）</template>
            <p style="white-space: pre-wrap">{{ a.textAnswer }}</p>
            <n-space align="center">
              <span>给分：</span>
              <n-input-number v-model:value="scoreModel[a.id]" :min="0" :max="a.question.score" />
            </n-space>
          </n-card>
        </n-space>
        <template #footer>
          <n-space justify="end">
            <n-button @click="gradingAttempt = null">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleGrade">提交批阅</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
