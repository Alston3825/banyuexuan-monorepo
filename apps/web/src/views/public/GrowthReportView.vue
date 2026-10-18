<script setup lang="ts">
/** 客户在手机上打开护理师发的链接：不用登录，只读，看宝宝的生长曲线和最新对比，可保存成图片。 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NSpin } from 'naive-ui'
import { publicGrowthApi } from '../../api/modules/care-growth.api'
import type { GrowthReport } from '../../api/types/care-growth'
import { buildGrowthSvg, downloadSvgAsPng } from '../../utils/growth-chart'

const props = defineProps<{ token: string }>()
const report = ref<GrowthReport | null>(null)
const error = ref('')
const loading = ref(true)
const svg = computed(() => (report.value?.ready ? buildGrowthSvg(report.value) : ''))
const hasPoints = computed(() => !!report.value && (['weight', 'length', 'head'] as const).some((m) => report.value!.points[m].length > 0))

onMounted(async () => {
  try {
    report.value = await publicGrowthApi.report(props.token)
  } catch (e) {
    error.value = publicGrowthApi.errorText(e)
  } finally {
    loading.value = false
  }
})
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
          <div class="gr-svg" v-html="svg" />
          <n-button type="primary" block size="large" style="margin-top: 12px" @click="save">保存成图片</n-button>
        </template>
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
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
.gr-err {
  padding: 40px 12px;
  text-align: center;
  color: #888;
  line-height: 1.8;
}
.gr-svg {
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
}
.gr-svg :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
</style>
