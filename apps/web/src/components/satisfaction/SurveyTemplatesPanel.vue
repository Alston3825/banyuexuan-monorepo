<script setup lang="ts">
/**
 * 满意度模板管理：改正在用的模板里的某一条、新建模板、上传 Word/Excel/PDF/图片自动生成模板。
 * 上传生成的模板是“停用”草稿，改好条款后点“启用”才能用来录入调查。
 */
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NCard, NDataTable, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NSpace, NTag, type DataTableColumns } from 'naive-ui'
import { satisfactionTemplateApi } from '../../api/modules/satisfaction.api'
import type { SurveyTemplate, SurveyTemplateInput } from '../../api/types/satisfaction'
import { useAuthStore } from '../../stores/auth'
import { dialog, message } from '../../utils/discrete-api'

const emit = defineEmits<{ (e: 'changed'): void }>()
const auth = useAuthStore()
const canCreate = computed(() => auth.hasAccess('satisfaction.template.create'))
const canUpdate = computed(() => auth.hasAccess('satisfaction.template.update'))
const canDelete = computed(() => auth.hasAccess('satisfaction.template.delete'))

const rows = ref<SurveyTemplate[]>([])
const loading = ref(false)
const keyword = ref('')
const statusFilter = ref<string | null>(null)

const mql = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mql.matches)
const onMql = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mql.addEventListener('change', onMql)
onBeforeUnmount(() => mql.removeEventListener('change', onMql))

const shown = computed(() => {
  const k = keyword.value.trim()
  return rows.value.filter((t) => (!statusFilter.value || t.status === statusFilter.value) && (!k || t.name.includes(k) || t.groups.some((g) => g.title.includes(k) || g.items.some((i) => i.label.includes(k)))))
})
async function load() {
  loading.value = true
  try {
    rows.value = await satisfactionTemplateApi.list()
  } finally {
    loading.value = false
  }
}
onMounted(load)
defineExpose({ reload: load })

const SOURCE: Record<string, string> = { BUILTIN: '系统内置', MANUAL: '手工新建', UPLOAD: '文件生成' }
const dayText = (t: SurveyTemplate) => (t.day ? `入住第 ${t.day} 天` : '不自动提醒')

// ---------------- 编辑器 ----------------
interface EditGroup {
  key?: string
  title: string
  items: { key?: string; label: string }[]
}
const editShow = ref(false)
const editing = ref<SurveyTemplate | null>(null)
const saving = ref(false)
const fromUpload = ref(false)
const form = ref({ name: '', day: null as number | null, goodWord: '好', badWord: '不好', suggestionLabel: '您的其它意见和建议', praiseLabel: '值得您表扬的人、事、物', groups: [] as EditGroup[], status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' })

function openNew() {
  editing.value = null
  fromUpload.value = false
  form.value = { name: '', day: null, goodWord: '好', badWord: '不好', suggestionLabel: '您的其它意见和建议', praiseLabel: '值得您表扬的人、事、物', groups: [{ title: '评分项', items: [{ label: '' }] }], status: 'ACTIVE' }
  editShow.value = true
}
function openEdit(t: SurveyTemplate, upload = false) {
  editing.value = t
  fromUpload.value = upload
  form.value = { name: t.name, day: t.day, goodWord: t.goodWord, badWord: t.badWord, suggestionLabel: t.suggestionLabel, praiseLabel: t.praiseLabel, groups: t.groups.map((g) => ({ key: g.key, title: g.title, items: g.items.map((i) => ({ key: i.key, label: i.label })) })), status: t.status }
  editShow.value = true
}
const addItem = (g: EditGroup) => g.items.push({ label: '' })
const addGroup = () => form.value.groups.push({ title: '', items: [{ label: '' }] })
const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}
function removeItem(g: EditGroup, i: number) {
  g.items.splice(i, 1)
}
const itemTotal = computed(() => form.value.groups.reduce((a, g) => a + g.items.filter((i) => i.label.trim()).length, 0))

async function save(asStatus?: 'ACTIVE' | 'INACTIVE') {
  const f = form.value
  if (!f.name.trim()) return void message.error('请填写模板名称')
  if (itemTotal.value === 0) return void message.error('至少要有一道评分题目')
  const body: SurveyTemplateInput = {
    name: f.name.trim(),
    day: f.day,
    goodWord: f.goodWord,
    badWord: f.badWord,
    suggestionLabel: f.suggestionLabel,
    praiseLabel: f.praiseLabel,
    groups: f.groups.map((g) => ({ key: g.key, title: g.title, items: g.items.filter((i) => i.label.trim()).map((i) => ({ key: i.key, label: i.label.trim() })) })).filter((g) => g.items.length),
    status: asStatus ?? f.status,
  }
  saving.value = true
  try {
    if (editing.value) await satisfactionTemplateApi.update(editing.value.id, { ...body, version: editing.value.version })
    else await satisfactionTemplateApi.create(body)
    message.success(asStatus === 'ACTIVE' ? '已保存并启用' : '已保存')
    editShow.value = false
    await load()
    emit('changed')
  } finally {
    saving.value = false
  }
}

// ---------------- 上传文件生成 ----------------
const importing = ref(false)
async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importing.value = true
  const hide = message.loading('正在读取文件、生成模板，约半分钟…', { duration: 0 })
  try {
    const t = await satisfactionTemplateApi.importFile(file)
    hide.destroy()
    message.success(`已生成模板「${t.name}」，请核对条款`)
    await load()
    openEdit(t, true)
  } catch {
    hide.destroy()
  } finally {
    importing.value = false
  }
}

// ---------------- 行操作 ----------------
async function toggle(t: SurveyTemplate) {
  await satisfactionTemplateApi.update(t.id, { status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', version: t.version })
  message.success(t.status === 'ACTIVE' ? '已停用' : '已启用')
  await load()
  emit('changed')
}
async function duplicate(t: SurveyTemplate) {
  const c = await satisfactionTemplateApi.duplicate(t.id)
  message.success('已复制为停用的副本，可以直接改条款')
  await load()
  openEdit(c)
}
function askDelete(t: SurveyTemplate) {
  dialog.warning({
    title: '删除这个模板？',
    content: t.surveyCount > 0 ? `「${t.name}」已有 ${t.surveyCount} 份调查用过，不能删除，请改用“停用”。` : `「${t.name}」会被永久删除。`,
    positiveText: t.surveyCount > 0 ? '知道了' : '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      if (t.surveyCount > 0) return
      await satisfactionTemplateApi.remove(t.id)
      message.success('已删除')
      await load()
      emit('changed')
    },
  })
}

const columns: DataTableColumns<SurveyTemplate> = [
  { key: 'name', title: '模板', minWidth: 200, render: (r) => h('div', [h('b', r.name), h('div', { style: 'font-size:12px;color:var(--c-888888)' }, `${r.itemCount} 道题 · ${SOURCE[r.source] ?? r.source}`)]) },
  { key: 'day', title: '执行时间', width: 120, render: dayText },
  { key: 'surveyCount', title: '已录入', width: 80, render: (r) => `${r.surveyCount} 份` },
  { key: 'status', title: '状态', width: 80, render: (r) => h(NTag, { size: 'small', bordered: false, type: r.status === 'ACTIVE' ? 'success' : 'default' }, { default: () => (r.status === 'ACTIVE' ? '使用中' : '已停用') }) },
  {
    key: 'actions',
    title: '操作',
    width: 250,
    fixed: 'right',
    render: (r) =>
      h(NSpace, { size: 6, wrap: true }, {
        default: () => [
          ...(canUpdate.value ? [h(NButton, { size: 'small', type: 'primary', onClick: () => openEdit(r) }, { default: () => '编辑' }), h(NButton, { size: 'small', onClick: () => toggle(r) }, { default: () => (r.status === 'ACTIVE' ? '停用' : '启用') })] : []),
          ...(canCreate.value ? [h(NButton, { size: 'small', onClick: () => duplicate(r) }, { default: () => '复制' })] : []),
          ...(canDelete.value ? [h(NButton, { size: 'small', type: 'error', secondary: true, onClick: () => askDelete(r) }, { default: () => '删除' })] : []),
        ],
      }),
  },
]
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px" :wrap="true">
      <n-space :wrap="true" align="center">
        <n-input v-model:value="keyword" clearable placeholder="🔍 搜索模板名称 / 题目内容" style="width: min(280px, 94vw)" />
        <n-select v-model:value="statusFilter" :options="[{ label: '使用中', value: 'ACTIVE' }, { label: '已停用', value: 'INACTIVE' }]" clearable placeholder="全部状态" style="width: min(140px, 94vw)" />
      </n-space>
      <n-space v-if="canCreate" :wrap="true">
        <label>
          <input type="file" accept=".docx,.xlsx,.pdf,.txt,.csv,image/*,.heic,.heif" hidden :disabled="importing" @change="onImport" />
          <n-button tag="span" :loading="importing">📄 上传文件生成模板</n-button>
        </label>
        <n-button type="primary" @click="openNew">＋ 新建模板</n-button>
      </n-space>
    </n-space>
    <div class="tp-tip">支持上传 Word(.docx)、Excel(.xlsx)、PDF、照片或文本，AI 读出题目后生成一份“停用”的模板，你改好条款再点“启用”。每个模板可设“入住第几天”，系统会在那天提醒客服去做。</div>

    <template v-if="isMobile">
      <div v-if="!loading && shown.length === 0" class="tp-empty">没有符合条件的模板</div>
      <div v-for="t in shown" :key="t.id" class="tp-card">
        <div class="tp-top"><b>{{ t.name }}</b><n-tag size="small" :bordered="false" :type="t.status === 'ACTIVE' ? 'success' : 'default'">{{ t.status === 'ACTIVE' ? '使用中' : '已停用' }}</n-tag></div>
        <div class="tp-sub">{{ t.itemCount }} 道题 · {{ dayText(t) }} · 已录入 {{ t.surveyCount }} 份 · {{ SOURCE[t.source] }}</div>
        <n-space style="margin-top: 8px" :size="8">
          <template v-if="canUpdate"><n-button size="small" type="primary" @click="openEdit(t)">编辑</n-button><n-button size="small" @click="toggle(t)">{{ t.status === 'ACTIVE' ? '停用' : '启用' }}</n-button></template>
          <n-button v-if="canCreate" size="small" @click="duplicate(t)">复制</n-button>
          <n-button v-if="canDelete" size="small" type="error" secondary @click="askDelete(t)">删除</n-button>
        </n-space>
      </div>
    </template>
    <n-data-table v-else :columns="columns" :data="shown" :loading="loading" :row-key="(r: SurveyTemplate) => r.id" :scroll-x="760" />

    <n-modal :mask-closable="false" :show="editShow" @update:show="(v: boolean) => (editShow = v)">
      <n-card :title="editing ? '编辑模板' : '新建模板'" style="width: min(860px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true" closable @close="editShow = false">
        <div v-if="fromUpload" class="tp-banner">这是 AI 从文件里读出来的内容，请逐条核对（错字、漏题、分组不对都可以直接改），确认无误后点“保存并启用”。</div>
        <div v-if="editing && editing.surveyCount > 0" class="tp-warn">这个模板已有 {{ editing.surveyCount }} 份调查在用。改文字不影响已录入的分数；<b>删掉某道题</b>后，这道题的历史分数就不再出现在统计里（数据还在），建议用“停用”代替删除整个模板。</div>
        <n-form label-placement="top">
          <div class="tp-grid">
            <n-form-item label="模板名称" required><n-input v-model:value="form.name" maxlength="60" placeholder="如：客户满意度调查表（一）" /></n-form-item>
            <n-form-item label="入住第几天做（留空=不自动提醒）"><n-input-number v-model:value="form.day" :min="1" :max="365" :precision="0" clearable placeholder="如 5" style="width: 100%" /></n-form-item>
            <n-form-item label="评分尺“好”的一端"><n-input v-model:value="form.goodWord" maxlength="10" /></n-form-item>
            <n-form-item label="评分尺“差”的一端"><n-input v-model:value="form.badWord" maxlength="10" /></n-form-item>
            <n-form-item label="意见建议栏名称"><n-input v-model:value="form.suggestionLabel" maxlength="60" /></n-form-item>
            <n-form-item label="表扬栏名称"><n-input v-model:value="form.praiseLabel" maxlength="60" /></n-form-item>
          </div>
          <div class="tp-h">评分题目（共 {{ itemTotal }} 道，客户在 0~12 分上打勾）</div>
          <div v-for="(g, gi) in form.groups" :key="gi" class="tp-group">
            <div class="tp-grow">
              <n-input v-model:value="g.title" placeholder="分组标题，如 环境感知" maxlength="40" />
              <n-button size="small" quaternary :disabled="gi === 0" @click="move(form.groups, gi, -1)">↑</n-button>
              <n-button size="small" quaternary :disabled="gi === form.groups.length - 1" @click="move(form.groups, gi, 1)">↓</n-button>
              <n-button size="small" quaternary type="error" @click="form.groups.splice(gi, 1)">删分组</n-button>
            </div>
            <div v-for="(it, ii) in g.items" :key="ii" class="tp-grow tp-item">
              <span class="tp-no">{{ ii + 1 }}</span>
              <n-input v-model:value="it.label" placeholder="题目文字" maxlength="120" />
              <n-button size="small" quaternary :disabled="ii === 0" @click="move(g.items, ii, -1)">↑</n-button>
              <n-button size="small" quaternary :disabled="ii === g.items.length - 1" @click="move(g.items, ii, 1)">↓</n-button>
              <n-button size="small" quaternary type="error" @click="removeItem(g, ii)">删</n-button>
            </div>
            <n-button size="small" dashed @click="addItem(g)">＋ 添加题目</n-button>
          </div>
          <n-button dashed style="width: 100%" @click="addGroup">＋ 添加分组</n-button>
        </n-form>
        <template #footer>
          <n-space justify="end" :wrap="true">
            <n-button @click="editShow = false">取消</n-button>
            <n-button :loading="saving" @click="save()">保存</n-button>
            <n-button v-if="!editing || editing.status === 'INACTIVE'" type="primary" :loading="saving" @click="save('ACTIVE')">保存并启用</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.tp-tip {
  font-size: 12px;
  color: var(--c-888888);
  margin-bottom: 10px;
}
.tp-card {
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.tp-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
}
.tp-sub {
  font-size: 13px;
  color: var(--c-888888);
  margin-top: 2px;
}
.tp-empty {
  color: var(--c-999999);
  text-align: center;
  padding: 30px 0;
}
.tp-banner {
  background: rgba(110, 151, 191, 0.1);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
  font-size: 13px;
}
.tp-warn {
  background: rgba(201, 111, 79, 0.12);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
  font-size: 13px;
}
.tp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0 14px;
}
.tp-h {
  font-weight: 600;
  margin: 4px 0 8px;
}
.tp-group {
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 10px;
}
.tp-grow {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}
.tp-item {
  margin-left: 6px;
}
.tp-no {
  color: var(--c-999999);
  min-width: 18px;
  text-align: right;
  font-size: 13px;
}
</style>
