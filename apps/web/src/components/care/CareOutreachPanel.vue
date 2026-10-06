<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NSpace, NCard, NModal, NForm, NFormItem, NSelect, NDatePicker, NEmpty, NDescriptions, NDescriptionsItem } from 'naive-ui'
import { careOutreachPlanApi, careOutreachTemplateApi } from '../../api/modules/care.api'
import type { CareOutreachPlan, CareOutreachTemplate } from '../../api/types/care'
import { renderStatusBadge, CARE_OUTREACH_PLAN_STATUS_MAP, CARE_OUTREACH_TASK_STATUS_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const props = defineProps<{ motherProfileId: string }>()

const plans = ref<CareOutreachPlan[]>([])
const templates = ref<CareOutreachTemplate[]>([])
const loading = ref(false)

const createVisible = ref(false)
const submitting = ref(false)
const templateId = ref<string | null>(null)
const checkedOutAt = ref<number | null>(Date.now())

async function fetchAll() {
  loading.value = true
  try {
    const [planList, templateList] = await Promise.all([careOutreachPlanApi.list(props.motherProfileId), careOutreachTemplateApi.list()])
    plans.value = planList
    templates.value = templateList.filter((t) => t.status === 'ACTIVE')
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  templateId.value = templates.value[0]?.id ?? null
  checkedOutAt.value = Date.now()
  createVisible.value = true
}

async function handleCreate() {
  if (!templateId.value || !checkedOutAt.value) {
    message.error('请选择关怀模板与离店日期')
    return
  }
  submitting.value = true
  try {
    await careOutreachPlanApi.create({
      motherProfileId: props.motherProfileId,
      templateId: templateId.value,
      checkedOutAt: new Date(checkedOutAt.value).toISOString().slice(0, 10),
    })
    message.success('关怀计划已生成')
    createVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

async function handleTerminate(plan: CareOutreachPlan) {
  const reason = window.prompt('请输入终止原因')
  if (!reason) return
  await careOutreachPlanApi.terminate(plan.id, reason, plan.version)
  message.success('关怀计划已终止')
  await fetchAll()
}

async function handleCompleteTask(taskId: string, status: 'COMPLETED' | 'SKIPPED') {
  const completionNote = window.prompt(status === 'COMPLETED' ? '完成备注（可选）' : '跳过原因（可选）') ?? undefined
  await careOutreachPlanApi.completeTask(taskId, status, completionNote)
  message.success(status === 'COMPLETED' ? '已标记完成' : '已跳过')
  await fetchAll()
}

onMounted(fetchAll)
</script>

<template>
  <n-card title="离店后关怀">
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button size="small" type="primary" :disabled="templates.length === 0" @click="openCreateModal">生成关怀计划</n-button>
    </n-space>
    <n-empty v-if="!loading && plans.length === 0" description="暂无关怀计划" />
    <n-space vertical :size="12">
      <n-card v-for="plan in plans" :key="plan.id" size="small" embedded>
        <n-descriptions bordered size="small" :column="3">
          <n-descriptions-item label="计划编号">{{ plan.planNo }}</n-descriptions-item>
          <n-descriptions-item label="离店日期">{{ new Date(plan.checkedOutAt).toLocaleDateString() }}</n-descriptions-item>
          <n-descriptions-item label="状态"><component :is="() => renderStatusBadge(plan.status, CARE_OUTREACH_PLAN_STATUS_MAP)" /></n-descriptions-item>
        </n-descriptions>
        <n-space vertical :size="8" style="margin-top: 8px">
          <n-card v-for="task in plan.tasks" :key="task.id" size="small">
            <n-space justify="space-between" align="center">
              <span>第{{ task.dayOffset }}天 · {{ task.title }}<span v-if="task.content">（{{ task.content }}）</span></span>
              <n-space align="center">
                <component :is="() => renderStatusBadge(task.status, CARE_OUTREACH_TASK_STATUS_MAP)" />
                <template v-if="task.status === 'PENDING'">
                  <n-button size="tiny" type="primary" @click="handleCompleteTask(task.id, 'COMPLETED')">完成</n-button>
                  <n-button size="tiny" @click="handleCompleteTask(task.id, 'SKIPPED')">跳过</n-button>
                </template>
                <span v-else-if="task.completionNote" style="color: var(--n-text-color-3, #999); font-size: 12px">{{ task.completionNote }}</span>
              </n-space>
            </n-space>
          </n-card>
        </n-space>
        <n-space justify="end" style="margin-top: 8px" v-if="plan.status === 'ACTIVE'">
          <n-button size="tiny" @click="handleTerminate(plan)">终止计划</n-button>
        </n-space>
      </n-card>
    </n-space>

    <n-modal :show="createVisible" @update:show="(v) => (createVisible = v)">
      <n-card title="生成关怀计划" style="width: min(480px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="关怀模板">
            <n-select v-model:value="templateId" :options="templates.map((t) => ({ label: t.name, value: t.id }))" />
          </n-form-item>
          <n-form-item label="离店日期"><n-date-picker v-model:value="checkedOutAt" type="date" style="width: 100%" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="createVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleCreate">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </n-card>
</template>
