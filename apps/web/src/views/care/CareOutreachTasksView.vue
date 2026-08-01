<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NSpace, NCard, NEmpty, NButton, NDescriptions, NDescriptionsItem } from 'naive-ui'
import { careOutreachPlanApi } from '../../api/modules/care.api'
import type { CareOutreachPendingTask } from '../../api/types/care'
import { message } from '../../utils/discrete-api'

const tasks = ref<CareOutreachPendingTask[]>([])
const loading = ref(false)

async function fetchAll() {
  loading.value = true
  try {
    tasks.value = await careOutreachPlanApi.pendingTasks()
  } finally {
    loading.value = false
  }
}

async function handleComplete(task: CareOutreachPendingTask, status: 'COMPLETED' | 'SKIPPED') {
  const completionNote = window.prompt(status === 'COMPLETED' ? '完成备注（可选）' : '跳过原因（可选）') ?? undefined
  await careOutreachPlanApi.completeTask(task.id, status, completionNote)
  message.success(status === 'COMPLETED' ? '已标记完成' : '已跳过')
  await fetchAll()
}

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-empty v-if="!loading && tasks.length === 0" description="暂无待跟进的关怀任务" />
    <n-space vertical :size="12">
      <n-card v-for="task in tasks" :key="task.id" size="small">
        <n-descriptions bordered size="small" :column="3">
          <n-descriptions-item label="客户">{{ task.plan.motherProfile.customer.name }}</n-descriptions-item>
          <n-descriptions-item label="计划编号">{{ task.plan.planNo }}</n-descriptions-item>
          <n-descriptions-item label="应跟进日期">{{ new Date(task.scheduledDate).toLocaleDateString() }}</n-descriptions-item>
          <n-descriptions-item label="节点" :span="3">
            第{{ task.dayOffset }}天 · {{ task.title }}<span v-if="task.content">（{{ task.content }}）</span>
          </n-descriptions-item>
        </n-descriptions>
        <n-space justify="end" style="margin-top: 8px">
          <n-button size="small" type="primary" @click="handleComplete(task, 'COMPLETED')">完成</n-button>
          <n-button size="small" @click="handleComplete(task, 'SKIPPED')">跳过</n-button>
        </n-space>
      </n-card>
    </n-space>
  </div>
</template>
