<script setup lang="ts">
/**
 * 母婴档案里的“用药委托书”标签页：按宝宝分组，列出每一份委托书（有效/已替换/已停药）。
 * 住店期间宝宝病情变化需要调整用药时，点“变更”新签一份——上一份自动变“已替换”，
 * 每一份的药品、家属签字原件照片都完整保留，能看到整个变化过程。
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NEmpty, NInput, NModal, NSpace, NSpin, NTag } from 'naive-ui'
import { careDocumentApi, careMedicationApi } from '../../api/modules/care-archive.api'
import { MED_ROUTE_LABEL, MED_STATUS_LABEL, MED_TIME_LABEL, type MedicationAuth, type MedicationItem } from '../../api/types/care-archive'
import { BABY_GENDER_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'
import CareDocImages from './CareDocImages.vue'
import MedicationDialog from './MedicationDialog.vue'

const props = defineProps<{ motherProfileId: string; babies: { id: string; sequenceNo: number; name: string | null; gender: string }[] }>()

const auths = ref<MedicationAuth[]>([])
const loading = ref(false)
const babyOptions = computed(() => props.babies.map((b) => ({ value: b.id, label: label(b) })))
const label = (b: { sequenceNo: number; name: string | null; gender: string }) => `宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}（${BABY_GENDER_LABEL_MAP[b.gender] ?? b.gender}）`

const dlg = ref<{ show: boolean; mode: 'create' | 'view' | 'edit' | 'change'; auth: MedicationAuth | null; babyId: string | null }>({ show: false, mode: 'create', auth: null, babyId: null })
const stopping = ref<{ auth: MedicationAuth; note: string } | null>(null)
const stopSubmitting = ref(false)
const attachInput = ref<HTMLInputElement | null>(null)
const attachTarget = ref<MedicationAuth | null>(null)

async function load() {
  loading.value = true
  try {
    auths.value = await careMedicationApi.list({ motherProfileId: props.motherProfileId })
  } finally {
    loading.value = false
  }
}
const open = (mode: 'create' | 'view' | 'edit' | 'change', auth: MedicationAuth | null, babyId: string | null = null) => (dlg.value = { show: true, mode, auth, babyId })
const byBaby = (id: string) => auths.value.filter((a) => a.babyProfileId === id)
const activeCount = (id: string) => byBaby(id).filter((a) => a.status === 'ACTIVE').length

const itemText = (it: MedicationItem) =>
  `${it.drugName}${it.route ? '·' + MED_ROUTE_LABEL[it.route] : ''}${it.times?.length ? '·' + it.times.map((t) => MED_TIME_LABEL[t]).join('') : ''}${it.dose ? '·' + it.dose : ''}`
const dateText = (iso: string | null) => (iso ? iso.slice(0, 10) : '-')
const statusType = (s: string) => (s === 'ACTIVE' ? 'success' : s === 'STOPPED' ? 'error' : 'default')

async function doStop() {
  const s = stopping.value
  if (!s) return
  if (!s.note.trim()) return message.error('请填写停药原因/说明')
  stopSubmitting.value = true
  try {
    await careMedicationApi.stop(s.auth.id, { version: s.auth.version, note: s.note.trim() })
    message.success('已标记为停药')
    stopping.value = null
    await load()
  } finally {
    stopSubmitting.value = false
  }
}

/** 给没有签字原件的委托书补传照片（只留档，不识别） */
function startAttach(a: MedicationAuth) {
  attachTarget.value = a
  attachInput.value?.click()
}
async function onAttach(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const a = attachTarget.value
  if (files.length === 0 || !a) return
  const doc = await careDocumentApi.upload(files, { docType: 'MEDICATION_AUTH', motherProfileId: props.motherProfileId, babyProfileId: a.babyProfileId, autoExtract: false })
  await careMedicationApi.update(a.id, { version: a.version, header: {}, items: [], documentId: doc.id })
  message.success('签字原件已上传')
  await load()
}

onMounted(load)
</script>

<template>
  <n-spin :show="loading">
    <input ref="attachInput" type="file" multiple accept="image/*,application/pdf,.heic,.heif" style="display: none" @change="onAttach" />
    <n-empty v-if="babies.length === 0" description="还没有宝宝档案，请先在“概览”里新增宝宝，再给宝宝建用药委托书" />

    <n-space vertical :size="14">
      <n-card v-for="b in babies" :key="b.id" size="small" :title="label(b)">
        <template #header-extra>
          <n-space :size="6" align="center">
            <n-tag :type="activeCount(b.id) > 0 ? 'success' : 'default'" size="small" round>{{ activeCount(b.id) > 0 ? `有效委托 ${activeCount(b.id)} 份` : '当前无有效委托' }}</n-tag>
            <n-button type="primary" size="small" @click="open('create', null, b.id)">＋ 新建委托书</n-button>
          </n-space>
        </template>

        <n-empty v-if="byBaby(b.id).length === 0" description="还没有用药委托书。宝宝需要服药/外用药时，请家长签好委托书，再拍照录入。" />
        <div v-for="a in byBaby(b.id)" :key="a.id" class="mp-card" :class="{ 'mp-old': a.status !== 'ACTIVE' }">
          <div class="mp-top">
            <n-tag :type="statusType(a.status)" size="small" round>{{ MED_STATUS_LABEL[a.status] }}</n-tag>
            <b>{{ dateText(a.authDate) }} 委托</b>
            <span v-if="a.previousAuthId" class="mp-chg">变更自上一份</span>
            <span class="mp-by">家属：{{ a.signerName || '-' }} · 护理师：{{ a.nurseName || '-' }}</span>
          </div>
          <div class="mp-items">
            <span v-for="it in a.items" :key="it.id" class="mp-pill">{{ itemText(it) }}</span>
          </div>
          <div v-if="a.changeNote" class="mp-note">变更说明：{{ a.changeNote }}</div>
          <div v-if="a.status === 'STOPPED'" class="mp-note mp-stop">已停药（{{ dateText(a.stoppedAt) }}）：{{ a.stopNote }}</div>
          <div v-if="a.document && a.document.files.length > 0" class="mp-photos"><CareDocImages :document-id="a.document.id" :files="a.document.files" :width="96" /></div>
          <div v-else class="mp-warn">⚠ 还没有上传家属签字的纸质原件</div>
          <n-space :size="6" :wrap="true" style="margin-top: 8px">
            <n-button size="small" @click="open('view', a)">查看</n-button>
            <template v-if="a.status === 'ACTIVE'">
              <n-button size="small" @click="open('edit', a)">修改</n-button>
              <n-button size="small" type="warning" @click="open('change', a)">变更（新签一份）</n-button>
              <n-button size="small" type="error" ghost @click="stopping = { auth: a, note: '' }">停药</n-button>
            </template>
            <n-button v-if="!a.document" size="small" @click="startAttach(a)">📷 补传签字原件</n-button>
          </n-space>
        </div>
      </n-card>
    </n-space>

    <MedicationDialog
      v-model:show="dlg.show"
      :mother-profile-id="motherProfileId"
      :babies="babyOptions"
      :mode="dlg.mode"
      :auth="dlg.auth"
      :default-baby-id="dlg.babyId"
      @saved="load"
    />

    <n-modal :mask-closable="false" :show="!!stopping" @update:show="(v) => !v && (stopping = null)">
      <n-card v-if="stopping" title="停药" style="width: min(440px, 94vw)" :bordered="false" role="dialog" closable @close="stopping = null" aria-modal="true">
        <p style="margin: 0 0 8px">这份委托书（{{ stopping.auth.items.map((i) => i.drugName).join('、') }}）将标记为“已停药”，历史保留。</p>
        <n-input v-model:value="stopping.note" type="textarea" :autosize="{ minRows: 2 }" placeholder="停药原因/说明（必填），如：病愈，医生同意停药" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="stopping = null">取消</n-button>
            <n-button type="error" :loading="stopSubmitting" @click="doStop">确认停药</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </n-spin>
</template>

<style scoped>
.mp-card {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fff;
}
.mp-old {
  background: #f8f8f8;
  opacity: 0.9;
}
.mp-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.mp-by {
  margin-left: auto;
  color: #888;
  font-size: 12px;
}
.mp-chg {
  color: #d9822b;
  font-size: 12px;
}
.mp-items {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.mp-pill {
  padding: 2px 8px;
  border-radius: 12px;
  background: #eef5fc;
  color: #2a64b0;
  font-size: 13px;
}
.mp-note {
  margin-top: 6px;
  color: #666;
  font-size: 13px;
}
.mp-stop {
  color: #c0392b;
}
.mp-photos {
  margin-top: 8px;
}
.mp-photos :deep(.n-space) {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap;
  gap: 6px !important;
}
.mp-warn {
  margin-top: 8px;
  color: #b25e00;
  font-size: 12px;
}
</style>
