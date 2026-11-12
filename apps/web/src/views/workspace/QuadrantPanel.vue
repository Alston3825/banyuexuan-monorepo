<script setup lang="ts">
/** 效率四象限：横轴紧急、纵轴重要；任务可拖到别的象限（手机上用“⋯→移动到”），点圆圈完成后划线。 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NDropdown, NInputGroup, NEmpty, NForm, NFormItem, NInput, NModal, NCard, NSelect, NSpace } from 'naive-ui'
import { workbenchApi, type PersonalTask, type Quadrant } from '../../api/modules/workbench.api'
import { message } from '../../utils/discrete-api'

const emit = defineEmits<{ count: [n: number] }>()
const QS: { key: Quadrant; title: string; hint: string }[] = [
  { key: 'Q1', title: '紧急且重要', hint: '马上做' },
  { key: 'Q2', title: '重要但不紧急', hint: '排计划' },
  { key: 'Q3', title: '紧急但不重要', hint: '快速处理/请人帮忙' },
  { key: 'Q4', title: '不紧急且不重要', hint: '有空再做/可舍弃' },
]
const tasks = ref<PersonalTask[]>([])
const loading = ref(false)
const drafts = ref<Record<string, string>>({ Q1: '', Q2: '', Q3: '', Q4: '' })
const dragId = ref<string | null>(null)
const overQ = ref<Quadrant | null>(null)
const edit = ref<{ id: string; title: string; note: string; quadrant: Quadrant } | null>(null)

const byQ = (q: Quadrant) => tasks.value.filter((t) => t.quadrant === q)
const pending = computed(() => tasks.value.filter((t) => !t.done).length)

async function load() {
  loading.value = true
  try {
    tasks.value = await workbenchApi.tasks()
    emit('count', pending.value)
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function add(q: Quadrant) {
  const title = drafts.value[q].trim()
  if (!title) return
  const t = await workbenchApi.createTask({ title, quadrant: q })
  tasks.value.push(t)
  drafts.value[q] = ''
  emit('count', pending.value)
}
async function toggle(t: PersonalTask) {
  const done = !t.done
  t.done = done
  try {
    await workbenchApi.updateTask(t.id, { done })
  } catch {
    t.done = !done
  }
  emit('count', pending.value)
}
async function move(t: PersonalTask, q: Quadrant) {
  if (t.quadrant === q) return
  const old = t.quadrant
  t.quadrant = q
  try {
    await workbenchApi.updateTask(t.id, { quadrant: q })
  } catch {
    t.quadrant = old
  }
}
async function remove(t: PersonalTask) {
  await workbenchApi.deleteTask(t.id)
  tasks.value = tasks.value.filter((x) => x.id !== t.id)
  emit('count', pending.value)
}
function onDrop(q: Quadrant) {
  const t = tasks.value.find((x) => x.id === dragId.value)
  dragId.value = null
  overQ.value = null
  if (t) void move(t, q)
}
function menu(t: PersonalTask) {
  return [
    { label: '编辑', key: 'edit' },
    ...QS.filter((q) => q.key !== t.quadrant).map((q) => ({ label: `移到「${q.title}」`, key: `to:${q.key}` })),
    { label: '删除', key: 'del' },
  ]
}
function onMenu(t: PersonalTask, key: string) {
  if (key === 'edit') edit.value = { id: t.id, title: t.title, note: t.note ?? '', quadrant: t.quadrant }
  else if (key === 'del') void remove(t)
  else if (key.startsWith('to:')) void move(t, key.slice(3) as Quadrant)
}
async function saveEdit() {
  const e = edit.value
  if (!e) return
  if (!e.title.trim()) return void message.warning('请填写内容')
  const t = tasks.value.find((x) => x.id === e.id)
  await workbenchApi.updateTask(e.id, { title: e.title, note: e.note, quadrant: e.quadrant })
  if (t) {
    t.title = e.title.trim()
    t.note = e.note.trim() || null
    t.quadrant = e.quadrant
  }
  edit.value = null
}
</script>

<template>
  <div class="qd">
    <div class="qd-axis-x"><span>← 紧急</span><span>不紧急 →</span></div>
    <div class="qd-wrap">
      <div class="qd-axis-y"><span>重要</span><span>不重要</span></div>
      <div class="qd-grid">
        <section
          v-for="q in QS"
          :key="q.key"
          class="qd-cell"
          :class="[`qd-${q.key}`, { 'qd-over': overQ === q.key }]"
          @dragover.prevent="overQ = q.key"
          @dragleave="overQ = null"
          @drop.prevent="onDrop(q.key)"
        >
          <header>
            <b>{{ q.title }}</b><em>{{ q.hint }}</em>
          </header>
          <div v-for="t in byQ(q.key)" :key="t.id" class="qd-note" :class="{ 'qd-done': t.done }" draggable="true" @dragstart="dragId = t.id" @dragend="((dragId = null), (overQ = null))">
            <button class="qd-check" :aria-label="t.done ? '取消完成' : '完成'" @click="toggle(t)"><span v-if="t.done">✓</span></button>
            <div class="qd-text" @click="onMenu(t, 'edit')">
              <div class="qd-title">{{ t.title }}</div>
              <div v-if="t.note" class="qd-sub">{{ t.note }}</div>
            </div>
            <n-dropdown trigger="click" :options="menu(t)" @select="(k: string) => onMenu(t, k)"><button class="qd-more" aria-label="更多">⋯</button></n-dropdown>
          </div>
          <n-empty v-if="!loading && byQ(q.key).length === 0" size="small" description="还没有事项" class="qd-empty" />
          <n-input-group class="qd-add">
            <n-input v-model:value="drafts[q.key]" placeholder="写下要做的事" maxlength="200" @keyup.enter="add(q.key)" />
            <n-button type="primary" :disabled="!drafts[q.key].trim()" @click="add(q.key)">添加</n-button>
          </n-input-group>
        </section>
      </div>
    </div>
    <div class="qd-tip">电脑上可以直接拖动事项到别的象限；手机上点事项右边的“⋯”选择“移到…”。完成的事项当天保留（划线），第二天自动消失。</div>

    <n-modal :mask-closable="false" :show="!!edit" @update:show="(v) => !v && (edit = null)">
      <n-card v-if="edit" title="编辑事项" style="width: min(460px, 96vw)" :bordered="false" closable @close="edit = null">
        <n-form label-placement="top">
          <n-form-item label="事项"><n-input v-model:value="edit.title" maxlength="200" /></n-form-item>
          <n-form-item label="备注（可不填）"><n-input v-model:value="edit.note" type="textarea" maxlength="500" :autosize="{ minRows: 2 }" /></n-form-item>
          <n-form-item label="所在象限"><n-select v-model:value="edit.quadrant" :options="QS.map((q) => ({ label: q.title, value: q.key }))" /></n-form-item>
        </n-form>
        <template #footer><n-space justify="end"><n-button @click="edit = null">取消</n-button><n-button type="primary" @click="saveEdit">保存</n-button></n-space></template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.qd-axis-x { display: grid; grid-template-columns: 1fr 1fr; margin-left: 28px; font-size: 12px; color: var(--bx-gray); }
.qd-axis-x span:last-child { text-align: right; }
.qd-wrap { display: flex; gap: 6px; }
.qd-axis-y { width: 22px; display: grid; grid-template-rows: 1fr 1fr; font-size: 12px; color: var(--bx-gray); }
.qd-axis-y span { display: flex; align-items: center; justify-content: center; writing-mode: vertical-rl; letter-spacing: 3px; white-space: nowrap; }
.qd-grid { flex: 1; min-width: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.qd-cell { min-height: 220px; padding: 10px; border-radius: 12px; border: 0; transition: box-shadow 0.15s; }
.qd-cell header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.qd-cell header b { font-size: 16px; font-family: var(--bx-serif); }
.qd-cell header em { font-size: 12px; font-style: normal; color: var(--bx-gray); }
.qd-Q1 { background: var(--bx-coral); } .qd-Q2 { background: var(--bx-oat); } .qd-Q3 { background: var(--bx-lilac); } .qd-Q4 { background: var(--bx-cactus); }
.qd-over { box-shadow: 0 0 0 2px var(--bx-ink) inset; }
.qd-note { display: flex; align-items: flex-start; gap: 8px; padding: 8px; margin-bottom: 6px; background: var(--bx-paper); border-radius: 8px; cursor: grab; }
.qd-check { flex: none; width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--bx-ink); background: #fff; color: #fff; font-size: 14px; line-height: 1; cursor: pointer; padding: 0; }
.qd-done .qd-check { background: var(--bx-ink); border-color: var(--bx-ink); }
.qd-text { flex: 1; min-width: 0; cursor: pointer; }
.qd-title { font-size: 14px; word-break: break-all; }
.qd-sub { font-size: 12px; color: var(--bx-gray); margin-top: 2px; word-break: break-all; }
.qd-done .qd-title, .qd-done .qd-sub { text-decoration: line-through; color: var(--bx-gray); }
.qd-more { flex: none; border: 0; background: transparent; font-size: 20px; line-height: 1; color: var(--bx-gray); cursor: pointer; padding: 2px 8px; min-height: 28px; }
.qd-empty { margin: 8px 0; }
.qd-add { margin-top: 8px; }
.qd-tip { margin-top: 10px; font-size: 12px; color: var(--bx-gray); }
@media (max-width: 767px) {
  .qd-grid { grid-template-columns: 1fr; }
  .qd-cell { min-height: 0; }
  .qd-axis-x, .qd-axis-y { display: none; }
  .qd-note { cursor: default; }
}
</style>
