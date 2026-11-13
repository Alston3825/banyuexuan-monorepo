<script setup lang="ts">
/** 客户在手机上打开护理师发的链接：不用登录，只读，看宝宝的生长曲线和最新对比，可保存成图片。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NButton, NRadioButton, NRadioGroup, NSpin } from 'naive-ui'
import { publicGrowthApi } from '../../api/modules/care-growth.api'
import type { GrowthReport, GrowthStandard } from '../../api/types/care-growth'
import { buildGrowthSvg, downloadSvgAsPng } from '../../utils/growth-chart'

const props = defineProps<{ token: string }>()
const report = ref<GrowthReport | null>(null)
const error = ref('')
const loading = ref(true)
const standard = ref<GrowthStandard>('CN')
const months = ref(3)
const tip = ref<{ x: number; y: number; text: string } | null>(null)
function onChartMove(e: MouseEvent) {
  const el = (e.target as Element | null)?.closest?.('[data-tip]')
  if (!el) return void (tip.value = null)
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
  tip.value = { x: e.clientX - box.left, y: e.clientY - box.top, text: el.getAttribute('data-tip') ?? '' }
}
const svg = computed(() => (report.value?.ready ? buildGrowthSvg(report.value, { months: months.value }) : ''))
const hasPoints = computed(() => !!report.value && (['weight', 'length', 'head'] as const).some((m) => report.value!.points[m].length > 0))

async function load(silent = false) {
  try {
    report.value = await publicGrowthApi.report(props.token, standard.value)
    error.value = ''
  } catch (e) {
    if (!silent || !report.value) error.value = publicGrowthApi.errorText(e)
  } finally {
    loading.value = false
  }
}
watch(standard, () => load())
// 客户一直开着页面时，护理师新记了数据，每分钟自动更新
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  load()
  timer = setInterval(() => !document.hidden && load(true), 60000)
})
onBeforeUnmount(() => clearInterval(timer))
async function save() {
  if (!svg.value) return
  const nm = report.value?.baby.name ?? '宝宝'
  await downloadSvgAsPng(svg.value, `${nm}-生长曲线.png`)
}
</script>

<template>
  <div class="gr-page">
    <n-spin :show="loading">
      <div v-if="error" class="gr-err">{{ error }}</div>
      <template v-else-if="report">
        <h2 class="gr-title">{{ report.baby.name ? report.baby.name + ' ' : '' }}生长曲线</h2>
        <div v-if="!report.ready" class="gr-err">月子中心还没有登记完整的宝宝信息（{{ report.notReady.join('、') }}），暂时无法生成曲线。</div>
        <div v-else-if="!hasPoints" class="gr-err">还没有测量数据，护理师测量后这里会自动显示曲线。</div>
        <template v-else>
          <div class="gr-sw">
            <n-radio-group v-model:value="standard">
              <n-radio-button value="CN" label="国家卫健委标准" />
              <n-radio-button value="WHO" label="WHO 标准" />
            </n-radio-group>
            <n-radio-group v-model:value="months">
              <n-radio-button :value="1" label="1个月" />
              <n-radio-button :value="2" label="2个月" />
              <n-radio-button :value="3" label="3个月" />
            </n-radio-group>
          </div>
          <div class="gr-svg" style="position: relative" @mousemove="onChartMove" @mouseleave="tip = null" @click="onChartMove">
            <div v-html="svg" />
            <div v-if="tip" class="gr-tip" :style="{ left: tip.x + 12 + 'px', top: tip.y - 36 + 'px' }">{{ tip.text }}</div>
          </div>
          <n-button type="primary" block size="large" style="margin-top: 12px" @click="save">保存成图片</n-button>
        </template>
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
.gr-tip {
  position: absolute;
  z-index: 5;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(30, 30, 30, 0.9);
  color: #fff;
  font-size: 13px;
  line-height: 1.4;
  pointer-events: none;
  white-space: nowrap;
}
.gr-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 16px;
}
.gr-title {
  margin: 4px 0 12px;
  text-align: center;
  font-size: 18px;
}
.gr-sw {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 10px;
}
.gr-err {
  padding: 40px 12px;
  text-align: center;
  color: var(--c-888888);
  line-height: 1.8;
}
.gr-svg {
  border: 1px solid var(--c-eeeeee);
  border-radius: 8px;
  overflow: hidden;
}
.gr-svg :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
</style>
