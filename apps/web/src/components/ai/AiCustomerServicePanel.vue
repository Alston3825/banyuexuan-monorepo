<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NEmpty, NSpace, NCard, NInput, NAlert, NTag } from 'naive-ui'
import { aiSuggestionApi, customerServiceAgentApi } from '../../api/modules/ai.api'
import type { AiSuggestion } from '../../api/types/ai'
import { message } from '../../utils/discrete-api'
import { extractErrorMessage } from '../../utils/error-message'

const props = defineProps<{ businessType: 'LEAD' | 'CUSTOMER'; businessId: string; storeId: string }>()

const suggestions = ref<AiSuggestion[]>([])
const loading = ref(false)
const asking = ref(false)
const question = ref('')
// 全局message toast在“组件内异步函数await之后”这类调用场景下偶发不生效（Vue实例上下文在await后
// 的状态与naive-ui discrete API交互的已知边界情况），这里用组件内的响应式状态兜底，保证用户一定能
// 看到失败反馈，不完全依赖message toast。
const askError = ref('')

async function fetchList() {
  loading.value = true
  try {
    suggestions.value = await aiSuggestionApi.list({ scenario: 'CUSTOMER_SERVICE', businessType: props.businessType, businessId: props.businessId })
  } finally {
    loading.value = false
  }
}

async function handleAsk() {
  askError.value = ''
  if (!question.value.trim()) {
    askError.value = '请输入问题'
    return
  }
  asking.value = true
  try {
    const result = await customerServiceAgentApi.ask({ businessType: props.businessType, businessId: props.businessId, storeId: props.storeId, question: question.value })
    if (result.escalate) {
      message.warning('AI建议转人工处理该问题')
    }
    question.value = ''
    await fetchList()
  } catch (error) {
    askError.value = extractErrorMessage(error, 'AI暂时不可用，请稍后重试或转人工处理')
  } finally {
    asking.value = false
  }
}

async function handleAccept(row: AiSuggestion) {
  await aiSuggestionApi.accept(row.id, row.version)
  await fetchList()
}

async function handleDismiss(row: AiSuggestion) {
  await aiSuggestionApi.dismiss(row.id, row.version)
  await fetchList()
}

onMounted(fetchList)
</script>

<template>
  <n-card title="AI 智能客服助手" size="small" style="margin-bottom: 16px">
    <n-alert type="info" :bordered="false" style="margin-bottom: 8px">回答仅供参考，不代表最终报价或承诺；涉及最终报价/法律条款等问题会提示转人工</n-alert>
    <n-space :wrap="false" style="margin-bottom: 12px">
      <n-input v-model:value="question" placeholder="向AI提问，如：这个客户目前跟进到什么阶段？" @keyup.enter="handleAsk" />
      <n-button type="primary" :loading="asking" @click="handleAsk">提问</n-button>
    </n-space>
    <n-alert v-if="askError" type="error" closable style="margin-bottom: 12px" @close="askError = ''">{{ askError }}</n-alert>
    <n-empty v-if="!loading && suggestions.length === 0" description="暂无AI问答记录" />
    <n-space v-else vertical :size="12">
      <n-card v-for="s in suggestions" :key="s.id" size="small" embedded>
        <template #header>
          <n-space align="center" :size="8">
            <n-tag v-if="s.escalate" size="small" type="error">建议转人工</n-tag>
            <n-tag size="small" :type="s.status === 'ACCEPTED' ? 'success' : s.status === 'DISMISSED' ? 'default' : 'warning'">
              {{ s.status === 'ACCEPTED' ? '已采纳' : s.status === 'DISMISSED' ? '已忽略' : '待确认' }}
            </n-tag>
            <span style="font-size: 12px; color: var(--n-text-color-3, #999)">{{ new Date(s.createdAt).toLocaleString() }}</span>
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
