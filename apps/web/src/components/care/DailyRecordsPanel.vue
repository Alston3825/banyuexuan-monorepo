<script setup lang="ts">
/**
 * 母婴档案里的“日常护理记录”标签页：从入住日到今天（已离店到离店日）每天一行，住几天就有几份，
 * 已填/未填一目了然；点某一天进去填（妈妈 + 每个宝宝 + 宝宝 24 小时喂养记录单）。最上面是“填今天”的大按钮。
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NEmpty, NSpin, NTag } from 'naive-ui'
import { careDailyApi } from '../../api/modules/care-archive.api'
import type { DailyDays } from '../../api/types/care-archive'
import DailyRecordDialog from './DailyRecordDialog.vue'

const props = defineProps<{ motherProfileId: string }>()

const data = ref<DailyDays | null>(null)
const loading = ref(false)
const dlg = ref({ show: false, date: '' })

async function load() {
  loading.value = true
  try {
    data.value = await careDailyApi.days(props.motherProfileId)
  } finally {
    loading.value = false
  }
}
const open = (date: string) => (dlg.value = { show: true, date })
const todayRow = computed(() => data.value?.days.find((d) => d.date === data.value?.today))
const missing = computed(() => (data.value?.days ?? []).filter((d) => !d.filled).length)
const label = (date: string) => {
  const [, m, d] = date.split('-')
  const wd = '日一二三四五六'[new Date(date + 'T00:00:00').getDay()]
  return `${Number(m)}月${Number(d)}日 周${wd}`
}

onMounted(load)
</script>

<template>
  <n-spin :show="loading">
    <n-card size="small" style="margin-bottom: 12px">
      <div class="dl-top">
        <div>
          <div class="dl-title">今天（{{ data ? label(data.today) : '' }}）</div>
          <div class="dl-sub">
            入住第 {{ todayRow?.stayDay ?? '-' }} 天<span v-if="data?.roomNo"> · 房号 {{ data.roomNo }}</span> ·
            <span :style="{ color: missing > 0 ? '#b25e00' : '#2a8a3e' }">{{ missing > 0 ? `共 ${missing} 天还没填` : '每天都已填写' }}</span>
          </div>
        </div>
        <n-button v-if="data" type="primary" size="large" @click="open(data.today)">{{ todayRow?.filled ? '查看 / 修改今天' : '填写今天的记录' }}</n-button>
      </div>
    </n-card>

    <div class="dl-list">
      <div v-for="d in data?.days ?? []" :key="d.date" class="dl-row" @click="open(d.date)">
        <div class="dl-date">
          <b>{{ label(d.date) }}</b>
          <span class="dl-day">入住第 {{ d.stayDay }} 天</span>
        </div>
        <n-tag v-if="d.filled" type="success" size="small" round>已填</n-tag>
        <n-tag v-else-if="d.date === data?.today" type="warning" size="small" round>今天待填</n-tag>
        <n-tag v-else type="error" size="small" round>未填</n-tag>
        <span class="dl-go">›</span>
      </div>
      <n-empty v-if="data && data.days.length === 0" description="暂无记录" />
    </div>

    <DailyRecordDialog v-model:show="dlg.show" :mother-profile-id="motherProfileId" :date="dlg.date" @saved="load" />
  </n-spin>
</template>

<style scoped>
.dl-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.dl-title {
  font-size: 16px;
  font-weight: 600;
}
.dl-sub {
  margin-top: 2px;
  color: #666;
  font-size: 13px;
}
.dl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.dl-row:active {
  background: #f5f8fc;
}
.dl-date {
  flex: 1;
}
.dl-day {
  margin-left: 8px;
  color: #888;
  font-size: 12px;
}
.dl-go {
  color: #bbb;
  font-size: 20px;
}
</style>
