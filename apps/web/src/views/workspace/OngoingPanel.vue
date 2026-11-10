<script setup lang="ts">
/** 正在进行中：需要持续推进的工作，按节点依次完成并留痕；可随时追加后面要做的节点。 */
import { onMounted, ref } from 'vue'
import { NButton, NCard, NDropdown, NEmpty, NForm, NFormItem, NInput, NModal, NSpace } from 'naive-ui'
import { workbenchApi, type OngoingWork, type WorkStep } from '../../api/modules/workbench.api'
import { message } from '../../utils/discrete-api'

const emit = defineEmits<{ count: [n: number] }>()
const list = ref<OngoingWork[]>([])
const open = ref<Set<string>>(new Set())
const newStep = ref<Record<string, string>>({})
const finishing = ref<{ workId: string; step: WorkStep; result: string } | null>(null)
const form = ref<{ title: string; note: string; steps: string } | null>(null)

async function load() {
  list.value = await workbenchApi.ongoing()
  emit('count', list.value.filter((w) => !w.finished).length)
}
onMounted(load)
const toggleOpen = (id: string) => (open.value.has(id) ? open.value.delete(id) : open.value.add(id), (open.value = new Set(open.value)))
const doneCount = (w: OngoingWork) => w.steps.filter((s) => s.done).length
const fmt = (iso: string | null) => (iso ? `${iso.slice(5, 10).replace('-', '月')}日 ${iso.slice(11, 16)}` : '')

async function create() {
  const f = form.value
  if (!f) return
  if (!f.title.trim()) return void message.warning('请填写事项名称')
  await workbenchApi.createOngoing({ title: f.title, note: f.note, steps: f.steps.split('\n').map((s) => s.trim()).filter(Boolean) })
  form.value = null
  await load()
}
async function addStep(w: OngoingWork) {
  const t = (newStep.value[w.id] ?? '').trim()
  if (!t) return
  await workbenchApi.addStep(w.id, t)
  newStep.value[w.id] = ''
  await load()
}
async function completeStep() {
  const f = finishing.value
  if (!f) return
  await workbenchApi.updateStep(f.workId, f.step.id, { done: true, result: f.result })
  finishing.value = null
  await load()
}
async function undoStep(w: OngoingWork, s: WorkStep) {
  await workbenchApi.updateStep(w.id, s.id, { done: false })
  await load()
}
async function removeStep(w: OngoingWork, s: WorkStep) {
  await workbenchApi.deleteStep(w.id, s.id)
  await load()
}
async function onMenu(w: OngoingWork, key: string) {
  if (key === 'finish' || key === 'reopen') await workbenchApi.updateOngoing(w.id, { finished: key === 'finish' })
  else if (key === 'del') await workbenchApi.deleteOngoing(w.id)
  await load()
}
</script>

<template>
  <div>
    <div class="og-bar"><b>需要持续推进的工作</b><n-button size="small" type="primary" @click="form = { title: '', note: '', steps: '' }">+ 新增事项</n-button></div>
    <n-empty v-if="list.length === 0" description="还没有正在进行的事项，点右上角新增" style="margin: 30px 0" />
    <div v-for="w in list" :key="w.id" class="og-card" :class="{ 'og-fin': w.finished }">
      <div class="og-head" @click="toggleOpen(w.id)">
        <span class="og-arrow">{{ open.has(w.id) ? '▾' : '▸' }}</span>
        <div class="og-main">
          <div class="og-title">{{ w.title }}</div>
          <div class="og-sub">{{ w.finished ? '已全部完成' : `已完成 ${doneCount(w)} / ${w.steps.length} 步` }}<template v-if="w.note"> · {{ w.note }}</template></div>
          <div v-if="w.steps.length" class="og-bar2"><i :style="{ width: (doneCount(w) / w.steps.length) * 100 + '%' }" /></div>
        </div>
        <n-dropdown trigger="click" :options="[{ label: w.finished ? '重新打开' : '标记全部完成', key: w.finished ? 'reopen' : 'finish' }, { label: '删除', key: 'del' }]" @select="(k: string) => onMenu(w, k)"><button class="og-more" @click.stop>⋯</button></n-dropdown>
      </div>
      <div v-if="open.has(w.id)" class="og-body">
        <div v-for="s in w.steps" :key="s.id" class="og-step" :class="{ 'og-sdone': s.done }">
          <i class="og-dot" />
          <div class="og-stext">
            <div>{{ s.title }}</div>
            <div v-if="s.done" class="og-sub">{{ fmt(s.doneAt) }} 完成<template v-if="s.result"> · {{ s.result }}</template></div>
          </div>
          <n-button v-if="!s.done" size="small" type="primary" secondary @click="finishing = { workId: w.id, step: s, result: '' }">完成</n-button>
          <n-button v-else size="tiny" quaternary @click="undoStep(w, s)">撤销</n-button>
          <n-button v-if="!s.done" size="tiny" quaternary type="error" @click="removeStep(w, s)">删</n-button>
        </div>
        <div class="og-add"><n-input v-model:value="newStep[w.id]" size="small" placeholder="+ 添加后面要做的事项，回车保存" @keyup.enter="addStep(w)" /></div>
      </div>
    </div>

    <n-modal :mask-closable="false" :show="!!form" @update:show="(v) => !v && (form = null)">
      <n-card v-if="form" title="新增持续事项" style="width: min(480px, 96vw)" :bordered="false" closable @close="form = null">
        <n-form label-placement="top">
          <n-form-item label="事项名称"><n-input v-model:value="form.title" maxlength="200" placeholder="例如：高新店 12 月采购计划" /></n-form-item>
          <n-form-item label="备注（可不填）"><n-input v-model:value="form.note" maxlength="500" /></n-form-item>
          <n-form-item label="先列出要做的步骤（一行一步，可不填，以后再加）"><n-input v-model:value="form.steps" type="textarea" :autosize="{ minRows: 3 }" placeholder="收集各部门需求&#10;比价&#10;提交采购申请" /></n-form-item>
        </n-form>
        <template #footer><n-space justify="end"><n-button @click="form = null">取消</n-button><n-button type="primary" @click="create">保存</n-button></n-space></template>
      </n-card>
    </n-modal>
    <n-modal :mask-closable="false" :show="!!finishing" @update:show="(v) => !v && (finishing = null)">
      <n-card v-if="finishing" :title="`完成：${finishing.step.title}`" style="width: min(440px, 96vw)" :bordered="false" closable @close="finishing = null">
        <n-input v-model:value="finishing.result" type="textarea" :autosize="{ minRows: 2 }" maxlength="500" placeholder="今天做到哪了、有什么结果（可不填）" />
        <template #footer><n-space justify="end"><n-button @click="finishing = null">取消</n-button><n-button type="primary" @click="completeStep">确认完成</n-button></n-space></template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.og-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.og-card { margin-bottom: 10px; background: #fffdf8; border: 1px solid #efe7da; border-radius: 12px; overflow: hidden; }
.og-head { display: flex; align-items: center; gap: 10px; padding: 12px; cursor: pointer; }
.og-arrow { color: #8a7f70; width: 14px; }
.og-main { flex: 1; min-width: 0; }
.og-title { font-weight: 600; font-size: 15px; word-break: break-all; }
.og-sub { font-size: 12px; color: #8a7f70; margin-top: 2px; }
.og-bar2 { height: 6px; background: #eee6d8; border-radius: 3px; margin-top: 8px; overflow: hidden; }
.og-bar2 i { display: block; height: 100%; background: #18a058; }
.og-more { border: 0; background: transparent; font-size: 20px; color: #8a7f70; cursor: pointer; padding: 2px 10px; min-height: 32px; }
.og-fin { opacity: 0.7; }
.og-body { padding: 4px 12px 12px 36px; border-top: 1px dashed #efe7da; }
.og-step { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
.og-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #b9ad9b; }
.og-sdone .og-dot { background: #18a058; border-color: #18a058; }
.og-stext { flex: 1; min-width: 0; word-break: break-all; }
.og-sdone .og-stext > div:first-child { color: #888; text-decoration: line-through; }
.og-add { margin-top: 6px; }
</style>
