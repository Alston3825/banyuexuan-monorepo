<script setup lang="ts">
/**
 * 母婴档案里的“护理计划”：妈妈一条线、每个宝宝一条线，各自版本制。
 * 护理长制定/评审 → 提交 → 护理主任审核通过后生效；每 7 天评审（到期红色提醒），护理主任查房可直接调整；
 * 旧版本只读保留，在“历史版本”里能看到计划是怎么一步步调整的。
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NCollapse, NCollapseItem, NEmpty, NInput, NModal, NSpace, NSpin, NTag } from 'naive-ui'
import { carePlanVersionApi } from '../../api/modules/care-archive.api'
import { CARE_LEVEL_LABEL, PLAN_SOURCE_LABEL, PLAN_STATUS_LABEL, type PlanVersion } from '../../api/types/care-archive'
import { BABY_GENDER_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'
import PlanDialog from './PlanDialog.vue'

const props = defineProps<{ motherProfileId: string; babies: { id: string; sequenceNo: number; name: string | null; gender: string }[] }>()
const emit = defineEmits<{ changed: [] }>()

const versions = ref<PlanVersion[]>([])
const canApprove = ref(false)
const loading = ref(false)
const dlg = ref<{ show: boolean; mode: 'create' | 'review' | 'round' | 'edit' | 'view'; babyId: string | null; label: string; plan: PlanVersion | null }>({ show: false, mode: 'create', babyId: null, label: '', plan: null })
const decide = ref<{ plan: PlanVersion; kind: 'approve' | 'reject'; comment: string } | null>(null)
const deciding = ref(false)

const subjects = computed(() => [
  { babyId: null as string | null, label: '妈妈' },
  ...props.babies.map((b) => ({ babyId: b.id, label: `宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}（${BABY_GENDER_LABEL_MAP[b.gender] ?? b.gender}）` })),
])
const of = (babyId: string | null) => versions.value.filter((v) => (v.babyProfileId ?? null) === babyId)
const active = (babyId: string | null) => of(babyId).find((v) => v.status === 'ACTIVE') ?? null
const open = (babyId: string | null) => of(babyId).find((v) => ['DRAFT', 'PENDING_REVIEW', 'REJECTED'].includes(v.status)) ?? null
const history = (babyId: string | null) => of(babyId).filter((v) => v.status === 'SUPERSEDED' || v.status === 'ACTIVE')
const dateText = (iso: string | null) => (iso ? iso.slice(0, 10) : '-')
const overdue = (p: PlanVersion) => !!p.nextReviewDue && p.nextReviewDue.slice(0, 10) <= new Date().toISOString().slice(0, 10)

async function load() {
  loading.value = true
  try {
    const [v, std] = await Promise.all([carePlanVersionApi.list(props.motherProfileId), carePlanVersionApi.standards()])
    versions.value = v
    canApprove.value = std.canApprove
  } finally {
    loading.value = false
  }
}
const openDlg = (mode: 'create' | 'review' | 'round' | 'edit' | 'view', s: { babyId: string | null; label: string }, plan: PlanVersion | null) => (dlg.value = { show: true, mode, babyId: s.babyId, label: s.label, plan })
const onSaved = async () => {
  await load()
  emit('changed')
}

async function submitDraft(p: PlanVersion) {
  await carePlanVersionApi.submit(p.id, p.version)
  message.success('已提交护理主任审核')
  await onSaved()
}
async function doDecide() {
  const d = decide.value
  if (!d) return
  if (d.kind === 'reject' && !d.comment.trim()) return message.error('驳回请写明原因')
  deciding.value = true
  try {
    if (d.kind === 'approve') await carePlanVersionApi.approve(d.plan.id, d.plan.version, d.comment)
    else await carePlanVersionApi.reject(d.plan.id, d.plan.version, d.comment)
    message.success(d.kind === 'approve' ? '已审核通过，计划生效' : '已驳回，等待修改')
    decide.value = null
    await onSaved()
  } finally {
    deciding.value = false
  }
}

onMounted(load)
defineExpose({ reload: load })
</script>

<template>
  <n-spin :show="loading">
    <n-space vertical :size="14">
      <n-card v-for="s in subjects" :key="s.babyId ?? 'm'" size="small" :title="`${s.label}的护理计划`">
        <template #header-extra>
          <n-tag v-if="active(s.babyId)" type="success" size="small" round>{{ CARE_LEVEL_LABEL[active(s.babyId)!.level] }}</n-tag>
          <n-tag v-else-if="open(s.babyId)" type="warning" size="small" round>{{ PLAN_STATUS_LABEL[open(s.babyId)!.status] }}</n-tag>
          <n-tag v-else size="small" round>尚未制定</n-tag>
        </template>

        <!-- 待办：未处理版本 -->
        <div v-if="open(s.babyId)" class="cp-open">
          <b>第 {{ open(s.babyId)!.versionNo }} 版：{{ PLAN_STATUS_LABEL[open(s.babyId)!.status] }}</b>
          <span v-if="open(s.babyId)!.status === 'REJECTED'" class="cp-rej">　驳回原因：{{ open(s.babyId)!.reviewComment }}</span>
          <n-space :size="6" style="margin-top: 6px" :wrap="true">
            <n-button size="small" @click="openDlg('view', s, open(s.babyId))">查看</n-button>
            <template v-if="open(s.babyId)!.status !== 'PENDING_REVIEW'">
              <n-button size="small" @click="openDlg('edit', s, open(s.babyId))">继续编辑</n-button>
              <n-button size="small" type="primary" @click="submitDraft(open(s.babyId)!)">提交护理主任审核</n-button>
            </template>
            <template v-else-if="canApprove">
              <n-button size="small" type="primary" @click="decide = { plan: open(s.babyId)!, kind: 'approve', comment: '' }">审核通过</n-button>
              <n-button size="small" type="error" ghost @click="decide = { plan: open(s.babyId)!, kind: 'reject', comment: '' }">驳回</n-button>
            </template>
            <span v-else class="cp-sub">等待护理主任审核…</span>
          </n-space>
        </div>

        <!-- 当前生效版 -->
        <template v-if="active(s.babyId)">
          <div class="cp-meta">
            第 {{ active(s.babyId)!.versionNo }} 版 · 生效 {{ dateText(active(s.babyId)!.effectiveAt) }} · 制定 {{ active(s.babyId)!.createdByName || '-' }} · 审核 {{ active(s.babyId)!.reviewerName || '-' }}
            ·
            <span :class="{ 'cp-over': overdue(active(s.babyId)!) }">下次评审 {{ dateText(active(s.babyId)!.nextReviewDue) }}{{ overdue(active(s.babyId)!) ? '（已到期，请评审）' : '' }}</span>
          </div>
          <div v-if="active(s.babyId)!.focusPoints" class="cp-focus"><b>重点关注：</b>{{ active(s.babyId)!.focusPoints }}</div>
          <div v-if="active(s.babyId)!.assessmentSummary" class="cp-sub"><b>评估依据：</b>{{ active(s.babyId)!.assessmentSummary }}</div>
          <div v-if="(active(s.babyId)!.measures ?? []).length" class="cp-measures">
            <span v-for="(m, i) in active(s.babyId)!.measures" :key="i" class="cp-pill">{{ m.title }}{{ m.frequency ? '·' + m.frequency : '' }}</span>
          </div>
          <n-space v-if="!open(s.babyId)" :size="6" style="margin-top: 8px" :wrap="true">
            <n-button size="small" type="primary" @click="openDlg('review', s, active(s.babyId))">7 天定期评审</n-button>
            <n-button v-if="canApprove" size="small" type="warning" @click="openDlg('round', s, active(s.babyId))">查房调整（护理主任）</n-button>
          </n-space>
        </template>
        <n-space v-else-if="!open(s.babyId)" style="margin-top: 4px">
          <n-button type="primary" size="small" @click="openDlg('create', s, null)">＋ 制定护理计划</n-button>
          <span class="cp-sub">根据入所评估制定，护理等级暂分一级（重点）/二级/三级（常规）。</span>
        </n-space>

        <n-collapse v-if="history(s.babyId).length > 1" style="margin-top: 10px">
          <n-collapse-item title="历史版本（只读）" name="h">
            <div v-for="v in history(s.babyId)" :key="v.id" class="cp-his" @click="openDlg('view', s, v)">
              <n-tag size="tiny" :type="v.status === 'ACTIVE' ? 'success' : 'default'">第 {{ v.versionNo }} 版 · {{ PLAN_STATUS_LABEL[v.status] }}</n-tag>
              {{ CARE_LEVEL_LABEL[v.level] }} · {{ PLAN_SOURCE_LABEL[v.source] }} · {{ dateText(v.effectiveAt) }}
              <div v-if="v.progressNote || v.adjustReason" class="cp-sub">{{ v.progressNote || v.adjustReason }}</div>
            </div>
          </n-collapse-item>
        </n-collapse>
      </n-card>
      <n-empty v-if="false" />
    </n-space>

    <PlanDialog v-model:show="dlg.show" :mode="dlg.mode" :mother-profile-id="motherProfileId" :baby-profile-id="dlg.babyId" :subject-label="dlg.label" :plan="dlg.plan" @saved="onSaved" />

    <n-modal :mask-closable="false" :show="!!decide" @update:show="(v) => !v && (decide = null)">
      <n-card v-if="decide" :title="decide.kind === 'approve' ? '审核通过' : '驳回'" style="width: min(440px, 94vw)" :bordered="false" role="dialog" closable @close="decide = null" aria-modal="true">
        <p style="margin: 0 0 8px">第 {{ decide.plan.versionNo }} 版（{{ CARE_LEVEL_LABEL[decide.plan.level] }}）{{ decide.kind === 'approve' ? '通过后立即生效，上一版自动变为“已替换”。' : '驳回后护理长修改再提交。' }}</p>
        <n-input v-model:value="decide.comment" type="textarea" :autosize="{ minRows: 2 }" :placeholder="decide.kind === 'approve' ? '审核意见（可不填）' : '驳回原因（必填）'" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="decide = null">取消</n-button>
            <n-button :type="decide.kind === 'approve' ? 'primary' : 'error'" :loading="deciding" @click="doDecide">{{ decide.kind === 'approve' ? '确认通过' : '确认驳回' }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </n-spin>
</template>

<style scoped>
.cp-open {
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid #c96f4f;
  border-radius: 8px;
  background: #f4ecdf;
}
.cp-rej {
  color: #b4533a;
  font-size: 13px;
}
.cp-meta {
  color: #6f6a62;
  font-size: 13px;
  line-height: 1.7;
}
.cp-over {
  color: #b4533a;
  font-weight: 600;
}
.cp-focus {
  margin-top: 6px;
  font-size: 14px;
  line-height: 1.7;
}
.cp-sub {
  margin-top: 4px;
  color: #6f6a62;
  font-size: 13px;
  line-height: 1.6;
}
.cp-measures {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cp-pill {
  padding: 2px 8px;
  border-radius: 12px;
  background: #eef2f5;
  color: #5b83aa;
  font-size: 13px;
}
.cp-his {
  padding: 8px 0;
  border-bottom: 1px dashed #eeebe3;
  font-size: 13px;
  cursor: pointer;
}
</style>
