<script setup lang="ts">
import { h, onMounted, ref, type VNode } from 'vue'
import { useRoute } from 'vue-router'
import { NCard, NSpace, NButton, NDescriptions, NDescriptionsItem, NDataTable, NModal, NForm, NFormItem, NSelect, NInputNumber, NInput, NTag, type DataTableColumns } from 'naive-ui'
import { dinerProfileApi, mealItemApi, mealRecordApi } from '../../api/modules/meal.api'
import type { DinerProfile, MealItem, MealRecord } from '../../api/types/meal'
import { renderStatusBadge, DINER_PROFILE_STATUS_MAP, MEAL_RECORD_STATUS_MAP, MEAL_SLOT_LABEL_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

const route = useRoute()
const dinerProfileId = route.params.id as string

const profile = ref<DinerProfile | null>(null)
const records = ref<MealRecord[]>([])
const allMealItems = ref<MealItem[]>([])
const loading = ref(false)

const mealItemOptions = ref<{ label: string; value: string }[]>([])

async function fetchAll() {
  loading.value = true
  try {
    const [p, recordList, items] = await Promise.all([
      dinerProfileApi.get(dinerProfileId),
      mealRecordApi.list({ dinerProfileId }),
      mealItemApi.list(),
    ])
    profile.value = p
    records.value = recordList
    allMealItems.value = items
    mealItemOptions.value = items.map((i) => ({ label: i.name, value: i.id }))
  } finally {
    loading.value = false
  }
}

async function handleEnd() {
  if (!profile.value) return
  dialog.warning({
    title: '结束用膳',
    content: '确认结束该用膳人的用膳周期？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await dinerProfileApi.end(profile.value!.id)
      message.success('已结束')
      await fetchAll()
    },
  })
}

// ---------------- 自选餐 ----------------
const selectVisible = ref(false)
const selectTarget = ref<MealRecord | null>(null)
const selectMealItemId = ref<string | null>(null)
const selectSubmitting = ref(false)

function openSelect(row: MealRecord) {
  selectTarget.value = row
  selectMealItemId.value = row.selectedMealItemId ?? row.defaultMealItemId
  selectVisible.value = true
}

async function handleSelect() {
  if (!selectTarget.value || !selectMealItemId.value) return
  selectSubmitting.value = true
  try {
    await mealRecordApi.select(selectTarget.value.id, selectMealItemId.value)
    message.success('自选餐已提交')
    selectVisible.value = false
    await fetchAll()
  } finally {
    selectSubmitting.value = false
  }
}

async function handleServe(row: MealRecord) {
  await mealRecordApi.serve(row.id)
  message.success('已供餐')
  await fetchAll()
}

// ---------------- 评价 ----------------
const feedbackVisible = ref(false)
const feedbackTarget = ref<MealRecord | null>(null)
const feedbackRating = ref(5)
const feedbackComment = ref('')
const feedbackSubmitting = ref(false)

function openFeedback(row: MealRecord) {
  feedbackTarget.value = row
  feedbackRating.value = row.rating ?? 5
  feedbackComment.value = row.comment ?? ''
  feedbackVisible.value = true
}

async function handleFeedback() {
  if (!feedbackTarget.value) return
  feedbackSubmitting.value = true
  try {
    await mealRecordApi.feedback(feedbackTarget.value.id, feedbackRating.value, feedbackComment.value || undefined)
    message.success('评价已提交')
    feedbackVisible.value = false
    await fetchAll()
  } finally {
    feedbackSubmitting.value = false
  }
}

const recordColumns: DataTableColumns<MealRecord> = [
  { key: 'scheduledDate', title: '日期', render: (row) => new Date(row.scheduledDate).toLocaleDateString() },
  { key: 'slot', title: '餐次', render: (row) => MEAL_SLOT_LABEL_MAP[row.slot] },
  { key: 'mealItem', title: '菜品', render: (row) => (row.isCustomSelected && row.selectedMealItem ? `${row.selectedMealItem.name}（自选）` : row.defaultMealItem.name) },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, MEAL_RECORD_STATUS_MAP) },
  { key: 'rating', title: '评价', render: (row) => (row.rating ? `${row.rating} 分` : '-') },
  {
    key: 'actions',
    title: '操作',
    width: 220,
    render: (row) => {
      const buttons: VNode[] = []
      if (row.status === 'PLANNED') {
        buttons.push(h(NButton, { size: 'small', onClick: () => openSelect(row) }, { default: () => '自选餐' }))
        buttons.push(h(NButton, { size: 'small', type: 'primary', onClick: () => handleServe(row) }, { default: () => '供餐' }))
      }
      if (row.status === 'SERVED') {
        buttons.push(h(NButton, { size: 'small', onClick: () => openFeedback(row) }, { default: () => (row.rating ? '修改评价' : '评价') }))
      }
      return h(NSpace, {}, { default: () => buttons })
    },
  },
]

onMounted(fetchAll)
</script>

<template>
  <div v-if="profile">
    <n-card title="用膳人信息" style="margin-bottom: 16px">
      <template #header-extra>
        <n-button v-if="profile.status === 'ACTIVE'" size="small" type="error" @click="handleEnd">结束用膳</n-button>
      </template>
      <n-descriptions :column="2" label-placement="left">
        <n-descriptions-item label="膳食计划">{{ profile.mealPlanTemplate.name }}</n-descriptions-item>
        <n-descriptions-item label="状态">{{ DINER_PROFILE_STATUS_MAP[profile.status]?.label }}</n-descriptions-item>
        <n-descriptions-item label="开始日期">{{ new Date(profile.startDate).toLocaleDateString() }}</n-descriptions-item>
        <n-descriptions-item label="结束日期">{{ new Date(profile.endDate).toLocaleDateString() }}</n-descriptions-item>
        <n-descriptions-item label="饮食禁忌" :span="2">
          <n-space size="small">
            <n-tag v-for="r in profile.restrictions" :key="r.id" size="small">{{ r.restriction.name }}</n-tag>
            <span v-if="profile.restrictions.length === 0">-</span>
          </n-space>
        </n-descriptions-item>
      </n-descriptions>
    </n-card>

    <n-card title="排餐记录">
      <n-data-table :columns="recordColumns" :data="records" :loading="loading" :row-key="(r: MealRecord) => r.id" :scroll-x="800" />
    </n-card>

    <n-modal :show="selectVisible" @update:show="(v) => (selectVisible = v)">
      <n-card title="自选餐" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="菜品"><n-select v-model:value="selectMealItemId" :options="mealItemOptions" filterable /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="selectVisible = false">取消</n-button>
            <n-button type="primary" :loading="selectSubmitting" @click="handleSelect">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="feedbackVisible" @update:show="(v) => (feedbackVisible = v)">
      <n-card title="用餐评价" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="评分"><n-input-number v-model:value="feedbackRating" :min="1" :max="5" style="width: 100%" /></n-form-item>
          <n-form-item label="评语"><n-input v-model:value="feedbackComment" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="feedbackVisible = false">取消</n-button>
            <n-button type="primary" :loading="feedbackSubmitting" @click="handleFeedback">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
