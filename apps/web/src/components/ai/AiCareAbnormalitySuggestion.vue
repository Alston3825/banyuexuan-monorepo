<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NEmpty, NSpace, NCard, NAlert, NTag } from 'naive-ui'
import { aiSuggestionApi, careAbnormalityAgentApi } from '../../api/modules/ai.api'
import type { AiSuggestion } from '../../api/types/ai'
import { message } from '../../utils/discrete-api'
import { extractErrorMessage } from '../../utils/error-message'

const props = defineProps<{ abnormalityId: string }>()

const suggestions = ref<AiSuggestion[]>([])
const loading = ref(false)
const requesting = ref(false)
// 同 AiCustomerServicePanel：不完全依赖全局message toast，本地兜底展示失败原因
const requestError = ref('')

async function fetchList() {
  loading.value = true
  try {
    suggestions.value = await aiSuggestionApi.list({ businessType: 'CARE_ABNORMALITY', businessId: props.abnormalityId })
  } finally {
    loading.value = false
  }
}

async function handleRequestSuggestion() {
  requestError.value = ''
  requesting.value = true
  try {
    await careAbnormalityAgentApi.suggest(props.abnormalityId)
    message.success('AI建议已生成，仅供参考，请护理师自行判断')
    await fetchList()
  } catch (error) {
    requestError.value = extractErrorMessage(error, 'AI暂时不可用，请稍后重试')
  } finally {
    requesting.value = false
  }
}

async function handleAccept(row: AiSuggestion) {
  await aiSuggestionApi.accept(row.id, row.version)
  message.success('已标记为采纳')
  await fetchList()
}

async function handleDismiss(row: AiSuggestion) {
  await aiSuggestionApi.dismiss(row.id, row.version)
  message.success('已忽略')
  await fetchList()
}

defineExpose({ refresh: fetchList })

onMounted(fetchList)
</script>

<template>
  <n-card title="AI 护理建议" size="small" style="margin-top: 12px">
    <template #header-extra>
      <n-button size="small" :loading="requesting" @click="handleRequestSuggestion">获取AI建议</n-button>
    </template>
    <n-alert type="warning" :bordered="false" style="margin-bottom: 8px">AI仅提供参考建议，不构成医疗诊断，护理师需自行判断后再处理</n-alert>
    <n-alert v-if="requestError" type="error" closable style="margin-bottom: 8px" @close="requestError = ''">{{ requestError }}</n-alert>
    <n-empty v-if="!loading && suggestions.length === 0" description="暂无AI建议" />
    <n-space v-else vertical :size="12">
      <n-card v-for="s in suggestions" :key="s.id" size="small" embedded>
        <template #header>
          <n-space align="center" :size="8">
            <n-tag size="small" :type="s.status === 'ACCEPTED' ? 'success' : s.status === 'DISMISSED' ? 'default' : 'warning'">
              {{ s.status === 'ACCEPTED' ? '已采纳' : s.status === 'DISMISSED' ? '已忽略' : '待确认' }}
            </n-tag>
            <span style="font-size: 12px; color: var(--n-text-color-3, #999)">{{ new Date(s.createdAt).toLocaleString() }} · {{ s.modelProvider }}</span>
          </n-space>
        </template>
        <div style="white-space: pre-wrap">{{ s.outputText }}</div>
        <n-space v-if="s.status === 'PENDING'" style="margin-top: 8px">
          <n-button size="tiny" @click="handleDismiss(s)">忽略</n-button>
          <n-button size="tiny" type="primary" @click="handleAccept(s)">采纳</n-button>
        </n-space>
      </n-card>
    </n-space>
  </n-card>
</template>
