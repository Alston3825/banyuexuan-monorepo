<script setup lang="ts">
/**
 * 某一天日常护理记录的“签字与确认”：
 * ① 护理师签字：用自己的账号 + 提前录好的电子签名图，选白班/夜班/替班一键签（一位妈妈一天可以多位护理师各签一条，
 *    一对多服务、早晚班不同人、休假替班都支持）；签字后记录内容又被改动，会提示“需重新签字”；
 * ② 客户确认（客户在手机上通过护理师发的链接确认）：这里显示确认结果、满意度、对护理师的评价和证据信息。
 */
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NRadioButton, NRadioGroup, NRate, NSpace, NTag } from 'naive-ui'
import { careSignApi, SIGN_SHIFT_LABEL, type DaySignStatus, type SignShift } from '../../api/modules/care-sign.api'
import { dialog, message } from '../../utils/discrete-api'
import MySignatureDialog from './MySignatureDialog.vue'

const props = defineProps<{ motherProfileId: string; date: string; canSign: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const status = ref<DaySignStatus | null>(null)
const loading = ref(false)
const shift = ref<SignShift>('DAY')
const signing = ref(false)
const sigDialog = ref(false)

async function load() {
  loading.value = true
  try {
    status.value = await careSignApi.status(props.motherProfileId, props.date)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const mine = computed(() => status.value?.signatures.find((s) => s.mine) ?? null)
const needResign = computed(() => !!mine.value?.stale)
const time = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function sign() {
  signing.value = true
  try {
    status.value = await careSignApi.sign(props.motherProfileId, props.date, shift.value)
    message.success('已签字')
    emit('changed')
  } catch (e) {
    const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? ''
    if (msg.includes('电子签名')) sigDialog.value = true // 还没录电子签名：直接弹出录入框
  } finally {
    signing.value = false
  }
}

function unsign(id: string) {
  dialog.warning({
    title: '撤销这条签字？',
    content: '撤销后可以重新签字。客户已经确认过的日子不能撤销。',
    positiveText: '撤销',
    negativeText: '取消',
    onPositiveClick: async () => {
      await careSignApi.unsign(id)
      await load()
      emit('changed')
    },
  })
}

const FLAG_TEXT: Record<string, string> = {
  STAFF_DEVICE: '在护理师用过的设备上确认',
  MULTI_CUSTOMER_DEVICE: '同一设备替多位客户确认过',
}
const dwell = (ms: number) => `${Math.round(ms / 1000)} 秒`
</script>

<template>
  <div class="ds-box">
    <div class="ds-title">护理师签字</div>
    <div v-if="!canSign" class="ds-tip">先保存当天的记录，再签字。</div>
    <template v-else>
      <div v-if="status && status.signatures.length === 0" class="ds-tip">还没有人签字。值班护理师保存记录后，请在下面选好班次，用自己的签名签字。</div>
      <div v-for="s in status?.signatures ?? []" :key="s.id" class="ds-sig" :class="{ 'ds-stale': s.stale }">
        <img v-if="s.signatureData" :src="s.signatureData" class="ds-img" alt="签名" />
        <div class="ds-meta">
          <b>{{ s.nurseName }}</b>
          <n-tag size="tiny" round>{{ SIGN_SHIFT_LABEL[s.shift] }}</n-tag>
          <span class="ds-time">{{ time(s.signedAt) }}</span>
          <n-tag v-if="s.stale" size="tiny" type="warning" round>签字后记录有改动，需重新签字</n-tag>
        </div>
        <n-button v-if="s.mine" size="tiny" quaternary type="error" @click="unsign(s.id)">撤销</n-button>
      </div>

      <n-space align="center" :wrap="true" style="margin-top: 8px">
        <n-radio-group v-model:value="shift" size="small">
          <n-radio-button v-for="(label, k) in SIGN_SHIFT_LABEL" :key="k" :value="k">{{ label }}</n-radio-button>
        </n-radio-group>
        <n-button type="primary" size="small" :loading="signing" :disabled="!!mine && !needResign" @click="sign">
          {{ needResign ? '记录改过了，重新签字' : mine ? '您已签字' : '我来签字（用我的电子签名）' }}
        </n-button>
        <n-button size="small" quaternary @click="sigDialog = true">我的电子签名</n-button>
      </n-space>
      <div class="ds-tip">只能用自己的账号签自己的字；换班、休假替班的护理师各自登录后分别签即可。</div>
    </template>

    <div class="ds-title" style="margin-top: 16px">客户确认</div>
    <template v-if="status?.confirmation">
      <n-alert v-if="status.confirmation.stale" type="warning" :show-icon="false" style="margin-bottom: 8px">客户确认之后，这一天的记录又被修改过，请让客户重新确认。</n-alert>
      <div class="ds-conf">
        <div>
          <n-tag :type="status.confirmation.stale ? 'warning' : 'success'" size="small" round>{{ status.confirmation.stale ? '确认后有改动' : '客户已确认' }}</n-tag>
          <span class="ds-time">{{ time(status.confirmation.confirmedAt) }} · {{ status.confirmation.method === 'SIGNATURE' ? '手写签名' : '长按确认' }}</span>
        </div>
        <div class="ds-rate">整体满意度 <n-rate readonly :value="status.confirmation.satisfaction" size="small" /></div>
        <div v-for="r in status.confirmation.nurseRatings ?? []" :key="r.signatureId" class="ds-rate">
          {{ r.nurseName }}（{{ SIGN_SHIFT_LABEL[r.shift] }}） <n-rate readonly :value="r.score" size="small" />
        </div>
        <div v-if="status.confirmation.comment" class="ds-comment">客户留言：{{ status.confirmation.comment }}</div>
        <img v-if="status.confirmation.signatureData" :src="status.confirmation.signatureData" class="ds-img" alt="客户签名" />
        <n-space v-if="status.confirmation.riskFlags.length" :size="6" style="margin-top: 6px">
          <n-tag v-for="f in status.confirmation.riskFlags" :key="f" type="error" size="small">⚠ {{ FLAG_TEXT[f] ?? f }}</n-tag>
        </n-space>
        <div class="ds-evi">
          证据：阅读用时 {{ dwell(status.confirmation.dwellMs) }}<span v-if="status.confirmation.holdMs">，长按 {{ (status.confirmation.holdMs / 1000).toFixed(1) }} 秒</span>，IP {{ status.confirmation.ip ?? '-' }}；已通过手机号后四位核验。
        </div>
      </div>
    </template>
    <div v-else class="ds-tip">客户还没确认。在“日常护理记录”页点“发给客户确认”，把链接发给客户，客户在手机上就能查看当天服务报告、签字确认并给护理师打分。</div>

    <MySignatureDialog v-model:show="sigDialog" />
  </div>
</template>

<style scoped>
.ds-box {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #cfcfcf;
  border-radius: 12px;
  background: #fff;
}
.ds-title {
  margin-bottom: 8px;
  padding-left: 8px;
  border-left: 3px solid #d9822b;
  font-weight: 600;
}
.ds-tip {
  margin-top: 6px;
  color: #999;
  font-size: 12px;
}
.ds-sig {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed #e6e6e6;
}
.ds-stale {
  opacity: 0.7;
}
.ds-img {
  height: 34px;
  max-width: 130px;
  object-fit: contain;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 4px;
}
.ds-meta {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ds-time {
  color: #888;
  font-size: 12px;
}
.ds-conf {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.ds-rate {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ds-comment {
  color: #555;
}
.ds-evi {
  margin-top: 4px;
  color: #999;
  font-size: 12px;
}
</style>
