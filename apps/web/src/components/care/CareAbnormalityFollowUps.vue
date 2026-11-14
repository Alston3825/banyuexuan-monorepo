<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NEmpty, NTimeline, NTimelineItem, NModal, NCard, NForm, NFormItem, NInput, NSelect, NDatePicker, NSpace, NTag } from 'naive-ui'
import { careAbnormalityApi } from '../../api/modules/care.api'
import type { CareAbnormalityFollowUp } from '../../api/types/care'
import { FOLLOW_UP_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const props = defineProps<{ abnormalityId: string }>()
const emit = defineEmits<{ followed: [] }>()

const records = ref<CareAbnormalityFollowUp[]>([])
const loading = ref(false)
const formVisible = ref(false)
const submitting = ref(false)
const model = ref<{ type: string; content: string; nextFollowUpAt: number | null }>({
  type: 'PHONE_CALL',
  content: '',
  nextFollowUpAt: null,
})

const typeOptions = Object.entries(FOLLOW_UP_TYPE_LABEL_MAP).map(([value, label]) => ({ label, value }))

async function fetchList() {
  loading.value = true
  try {
    records.value = await careAbnormalityApi.followUps(props.abnormalityId)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  model.value = { type: 'PHONE_CALL', content: '', nextFollowUpAt: null }
  formVisible.value = true
}

async function handleSubmit() {
  if (!model.value.content.trim()) {
    message.error('请填写跟进内容')
    return
  }
  submitting.value = true
  try {
    await careAbnormalityApi.follow(props.abnormalityId, {
      type: model.value.type,
      content: model.value.content,
      nextFollowUpAt: model.value.nextFollowUpAt ? new Date(model.value.nextFollowUpAt).toISOString() : undefined,
    })
    message.success('已添加跟进记录')
    formVisible.value = false
    await fetchList()
    emit('followed')
  } finally {
    submitting.value = false
  }
}

defineExpose({ refresh: fetchList })

onMounted(fetchList)
</script>

<template>
  <n-card title="异常跟进记录" size="small">
    <template #header-extra>
      <n-button size="small" type="primary" @click="openCreate">添加跟进</n-button>
    </template>
    <n-empty v-if="!loading && records.length === 0" description="暂无跟进记录" />
    <n-timeline v-else>
      <n-timeline-item
        v-for="record in records"
        :key="record.id"
        :title="FOLLOW_UP_TYPE_LABEL_MAP[record.type] ?? record.type"
        :time="new Date(record.createdAt).toLocaleString()"
      >
        <div>{{ record.content }}</div>
        <n-tag v-if="record.nextFollowUpAt" size="small" type="warning" style="margin-top: 4px">
          下次跟进：{{ new Date(record.nextFollowUpAt).toLocaleDateString() }}
        </n-tag>
      </n-timeline-item>
    </n-timeline>

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card title="添加护理异常跟进" style="width: min(420px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="类型">
            <n-select v-model:value="model.type" :options="typeOptions" />
          </n-form-item>
          <n-form-item label="内容">
            <n-input v-model:value="model.content" type="textarea" placeholder="请输入跟进内容" />
          </n-form-item>
          <n-form-item label="下次跟进">
            <n-date-picker v-model:value="model.nextFollowUpAt" type="date" style="width: 100%" clearable />
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
  </n-card>
</template>
