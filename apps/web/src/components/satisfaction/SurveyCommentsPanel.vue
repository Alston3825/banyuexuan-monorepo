<script setup lang="ts">
/** 客户手写的意见建议 / 表扬汇总：原话列表 + AI 一键归类分析（只看已确认的调查）。 */
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NDatePicker, NEmpty, NInput, NSelect, NSpace, NSpin } from 'naive-ui'
import { satisfactionApi } from '../../api/modules/satisfaction.api'
import type { SurveyComment } from '../../api/types/satisfaction'
import { message } from '../../utils/discrete-api'

defineProps<{ formOptions: { label: string; value: number }[] }>()

const formNo = ref<number | null>(null)
const range = ref<[number, number] | null>(null)
const keyword = ref('')
const rows = ref<SurveyComment[]>([])
const loading = ref(false)
const summary = ref<{ content: string; suggestionCount: number; praiseCount: number } | null>(null)
const summarizing = ref(false)

const ymd = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const filter = computed(() => ({ formNo: formNo.value ?? undefined, from: range.value ? ymd(range.value[0]) : undefined, to: range.value ? ymd(range.value[1]) : undefined, keyword: keyword.value.trim() || undefined }))

async function load() {
  loading.value = true
  try {
    rows.value = await satisfactionApi.comments(filter.value)
  } finally {
    loading.value = false
  }
}
let t: ReturnType<typeof setTimeout> | null = null
watch([formNo, range, keyword], () => {
  summary.value = null
  if (t) clearTimeout(t)
  t = setTimeout(load, 300)
})
onMounted(load)

async function summarize() {
  summarizing.value = true
  try {
    summary.value = await satisfactionApi.summarize({ formNo: filter.value.formNo, from: filter.value.from, to: filter.value.to })
  } catch {
    message.error('AI 汇总失败，请稍后再试')
  } finally {
    summarizing.value = false
  }
}
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '-')
const dayNo = (n: number) => (n === 1 ? 5 : n === 2 ? 15 : 25)
</script>

<template>
  <div>
    <n-space style="margin-bottom: 12px" align="center" :wrap="true">
      <n-select v-model:value="formNo" :options="formOptions" clearable placeholder="全部调查表" style="width: min(200px, 94vw)" />
      <n-date-picker v-model:value="range" type="daterange" clearable style="width: min(300px, 94vw)" />
      <n-input v-model:value="keyword" clearable placeholder="🔍 搜索意见内容 / 客户 / 管家" style="width: min(260px, 94vw)" />
      <n-button type="primary" :loading="summarizing" :disabled="rows.length === 0" @click="summarize">AI 汇总分析（{{ rows.length }} 条）</n-button>
    </n-space>

    <div v-if="summary" class="cm-sum">
      <div class="cm-sum-h">AI 汇总分析 <small>（基于 {{ summary.suggestionCount }} 条意见建议、{{ summary.praiseCount }} 条表扬；仅供参考，请对照原话）</small></div>
      <div class="cm-sum-body">{{ summary.content }}</div>
    </div>

    <n-spin :show="loading">
      <n-empty v-if="!loading && rows.length === 0" description="没有客户手写的意见或表扬（只统计已确认的调查）" style="margin: 30px 0" />
      <div v-for="r in rows" :key="r.id" class="cm-card">
        <div class="cm-meta">{{ day(r.surveyDate) }} · 第 {{ dayNo(r.formNo) }} 天表 · {{ r.customerName || '未填姓名' }}<span v-if="r.roomNo"> · {{ r.roomNo }} 房</span><span v-if="r.stewardName"> · 管家 {{ r.stewardName }}</span></div>
        <div v-if="r.suggestion" class="cm-row"><b class="cm-tag cm-sug">意见建议</b>{{ r.suggestion }}</div>
        <div v-if="r.praise" class="cm-row"><b class="cm-tag cm-pra">表扬</b>{{ r.praise }}</div>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.cm-card {
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.cm-meta {
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}
.cm-row {
  white-space: pre-wrap;
  margin: 3px 0;
}
.cm-tag {
  display: inline-block;
  font-size: 12px;
  color: #fff;
  border-radius: 4px;
  padding: 0 6px;
  margin-right: 6px;
}
.cm-sug {
  background: #f0a020;
}
.cm-pra {
  background: #18a058;
}
.cm-sum {
  border: 1px solid #2080f0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 14px;
}
.cm-sum-h {
  font-weight: 700;
  margin-bottom: 6px;
}
.cm-sum-h small {
  font-weight: 400;
  color: #888;
}
.cm-sum-body {
  white-space: pre-wrap;
  line-height: 1.7;
}
</style>
