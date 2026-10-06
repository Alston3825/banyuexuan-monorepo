<script setup lang="ts">
/**
 * 护理计划版本的填写/查看弹窗：
 *  create  入所首次制定（护理长）      review  7 天定期评审（写上阶段执行结果 + 新计划）
 *  round   护理主任查房调整并直接生效  edit    修改编辑中/被驳回的版本      view  只读查看历史版本
 * 手机优先：措施做成卡片行。
 */
import { computed, ref, watch } from 'vue'
import { NButton, NCard, NInput, NModal, NSpace } from 'naive-ui'
import { carePlanVersionApi } from '../../api/modules/care-archive.api'
import { CARE_LEVEL_LABEL, PLAN_SOURCE_LABEL, PLAN_STATUS_LABEL, type CareLevelCode, type PlanMeasure, type PlanVersion } from '../../api/types/care-archive'
import { message } from '../../utils/discrete-api'

type Mode = 'create' | 'review' | 'round' | 'edit' | 'view'
const props = defineProps<{
  show: boolean
  mode: Mode
  motherProfileId: string
  babyProfileId: string | null
  subjectLabel: string
  /** edit/view：那一版；review/round：当前生效版（用来预填） */
  plan: PlanVersion | null
}>()
const emit = defineEmits<{ 'update:show': [value: boolean]; saved: [] }>()

const level = ref<CareLevelCode>('LEVEL3')
const assessmentSummary = ref('')
const focusPoints = ref('')
const progressNote = ref('')
const adjustReason = ref('')
const measures = ref<PlanMeasure[]>([])
const saving = ref(false)

const readonly = computed(() => props.mode === 'view')
const title = computed(
  () =>
    ({
      create: '制定护理计划',
      review: '7 天定期评审：写上阶段结果，调整后新签一版',
      round: '护理主任查房调整（保存后直接生效）',
      edit: '修改护理计划',
      view: '护理计划',
    })[props.mode] + ` — ${props.subjectLabel}`,
)

watch(
  () => props.show,
  (v) => {
    if (!v) return
    const p = props.plan
    level.value = p?.level ?? 'LEVEL3'
    assessmentSummary.value = p?.assessmentSummary ?? ''
    focusPoints.value = p?.focusPoints ?? ''
    progressNote.value = props.mode === 'edit' || props.mode === 'view' ? (p?.progressNote ?? '') : ''
    adjustReason.value = props.mode === 'edit' || props.mode === 'view' ? (p?.adjustReason ?? '') : ''
    measures.value = (p?.measures ?? []).map((m) => ({ ...m }))
    if (!readonly.value && measures.value.length === 0) measures.value = [{ title: '', content: '', frequency: '' }]
  },
  { immediate: true },
)

async function save(submit: boolean) {
  if (props.mode === 'review' && !progressNote.value.trim()) return message.error('请填写“上阶段执行结果”')
  if (props.mode === 'round' && !adjustReason.value.trim()) return message.error('请填写调整原因')
  if (submit && !focusPoints.value.trim() && !assessmentSummary.value.trim()) return message.error('请至少填写评估依据或重点关注')
  saving.value = true
  try {
    const body = {
      level: level.value,
      assessmentSummary: assessmentSummary.value,
      focusPoints: focusPoints.value,
      measures: measures.value.filter((m) => m.title.trim() || m.content.trim()),
      progressNote: progressNote.value,
      adjustReason: adjustReason.value,
    }
    if (props.mode === 'edit' && props.plan) {
      const updated = await carePlanVersionApi.update(props.plan.id, { ...body, version: props.plan.version })
      if (submit) await carePlanVersionApi.submit(updated.id, updated.version)
      message.success(submit ? '已提交护理主任审核' : '已保存')
    } else {
      const created = await carePlanVersionApi.create({
        ...body,
        motherProfileId: props.motherProfileId,
        babyProfileId: props.babyProfileId,
        source: props.mode === 'review' ? 'REGULAR_REVIEW' : props.mode === 'round' ? 'DIRECTOR_ROUND' : 'INITIAL',
        directActivate: props.mode === 'round',
      })
      if (props.mode === 'round') message.success('已调整并生效，上一版已标为“已替换”')
      else if (submit) {
        await carePlanVersionApi.submit(created.id, created.version)
        message.success('已提交护理主任审核')
      } else message.success('已保存为草稿')
    }
    emit('saved')
    emit('update:show', false)
  } finally {
    saving.value = false
  }
}
const close = () => emit('update:show', false)
</script>

<template>
  <n-modal :show="show" :mask-closable="false" @update:show="(v) => emit('update:show', v)">
    <n-card :title="title" style="width: min(860px, 100vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="close">
      <div v-if="plan && mode === 'view'" class="pd-meta">
        第 {{ plan.versionNo }} 版 · {{ PLAN_STATUS_LABEL[plan.status] }} · {{ PLAN_SOURCE_LABEL[plan.source] }} · 制定人 {{ plan.createdByName || '-' }}
        <template v-if="plan.reviewerName"> · 审核人 {{ plan.reviewerName }}（{{ plan.reviewComment || '无意见' }}）</template>
      </div>
      <div v-if="(mode === 'review' || mode === 'round') && plan" class="pd-meta">基于当前生效的第 {{ plan.versionNo }} 版调整，下面已带入原内容，改完保存即可。</div>

      <h4 class="pd-h">护理等级</h4>
      <n-space v-if="!readonly" :size="8">
        <n-button v-for="(label, k) in CARE_LEVEL_LABEL" :key="k" :type="level === k ? 'primary' : 'default'" :secondary="level !== k" @click="level = k as CareLevelCode">{{ label }}</n-button>
      </n-space>
      <div v-else class="pd-text">{{ CARE_LEVEL_LABEL[level] }}</div>

      <template v-if="mode === 'review' || (readonly && progressNote)">
        <h4 class="pd-h">上阶段执行结果{{ mode === 'review' ? '（必填）' : '' }}</h4>
        <n-input v-if="!readonly" v-model:value="progressNote" type="textarea" :autosize="{ minRows: 2 }" placeholder="这一周护理计划执行得怎么样、宝宝/妈妈有什么变化" />
        <div v-else class="pd-text">{{ progressNote }}</div>
      </template>
      <template v-if="mode === 'round' || (readonly && adjustReason)">
        <h4 class="pd-h">调整原因{{ mode === 'round' ? '（必填）' : '' }}</h4>
        <n-input v-if="!readonly" v-model:value="adjustReason" type="textarea" :autosize="{ minRows: 2 }" placeholder="查房发现了什么、为什么调整" />
        <div v-else class="pd-text">{{ adjustReason }}</div>
      </template>

      <h4 class="pd-h">评估依据 / 当前主要问题</h4>
      <n-input v-if="!readonly" v-model:value="assessmentSummary" type="textarea" :autosize="{ minRows: 2 }" placeholder="入所评估发现的问题，如 剖宫产第4天、妊高、宝宝喂养/皮肤问题" />
      <div v-else class="pd-text">{{ assessmentSummary || '-' }}</div>

      <h4 class="pd-h">重点关注（护理看板“医嘱”显示这里）</h4>
      <n-input v-if="!readonly" v-model:value="focusPoints" type="textarea" :autosize="{ minRows: 2 }" placeholder="需要重点盯的身体情况" />
      <div v-else class="pd-text">{{ focusPoints || '-' }}</div>

      <h4 class="pd-h">具体护理措施</h4>
      <div v-for="(m, i) in measures" :key="i" class="pd-m">
        <template v-if="readonly">
          <b>{{ m.title }}</b>：{{ m.content }}<span v-if="m.frequency" class="pd-freq">（{{ m.frequency }}）</span>
        </template>
        <template v-else>
          <div class="pd-line">
            <n-input v-model:value="m.title" size="small" placeholder="项目，如 血压监测" />
            <n-input v-model:value="m.frequency" size="small" placeholder="频次，如 每天1次" style="max-width: 150px" />
            <n-button size="tiny" type="error" quaternary @click="measures.splice(i, 1)">删除</n-button>
          </div>
          <n-input v-model:value="m.content" size="small" type="textarea" :autosize="{ minRows: 1 }" placeholder="怎么做、注意什么" style="margin-top: 6px" />
        </template>
      </div>
      <div v-if="readonly && measures.length === 0" class="pd-text">-</div>
      <n-button v-if="!readonly" dashed block @click="measures.push({ title: '', content: '', frequency: '' })">＋ 添加一条措施</n-button>

      <template #footer>
        <n-space justify="end">
          <n-button @click="close">{{ readonly ? '关闭' : '取消' }}</n-button>
          <template v-if="!readonly">
            <n-button v-if="mode !== 'round'" :loading="saving" @click="save(false)">保存草稿</n-button>
            <n-button type="primary" :loading="saving" @click="save(mode !== 'round')">{{ mode === 'round' ? '保存并直接生效' : '保存并提交审核' }}</n-button>
          </template>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.pd-meta {
  margin-bottom: 8px;
  color: #666;
  font-size: 13px;
}
.pd-h {
  margin: 14px 0 6px;
  padding-left: 8px;
  border-left: 3px solid #d9822b;
  font-size: 14px;
  color: #2a64b0;
}
.pd-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
}
.pd-m {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fcfcfc;
}
.pd-line {
  display: flex;
  gap: 8px;
  align-items: center;
}
.pd-freq {
  color: #888;
}
:deep(.n-card__content) {
  max-height: 72vh;
  overflow: auto;
}
</style>
