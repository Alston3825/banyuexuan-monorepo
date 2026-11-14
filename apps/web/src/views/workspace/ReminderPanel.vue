<script setup lang="ts">
/** 重要提醒：自己设置的提醒（一次性/每天/工作日/每周/每月），到了日子自动出现在这里；下方汇集系统派给我的事项。 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NDatePicker, NEmpty, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NSpace, NTag, NTimePicker } from 'naive-ui'
import { workbenchApi, type DayReminder, type ReminderDef, type RepeatKind } from '../../api/modules/workbench.api'
import { message } from '../../utils/discrete-api'
import SystemTodos from './SystemTodos.vue'

const emit = defineEmits<{ count: [n: number] }>()
const REPEAT_LABEL: Record<RepeatKind, string> = { NONE: '只提醒一次', DAILY: '每天', WEEKDAYS: '工作日（周一至周五）', WEEKLY: '每周', MONTHLY: '每月' }
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const list = ref<DayReminder[]>([])
const defs = ref<ReminderDef[]>([])
const showDefs = ref(false)
const form = ref<{ id?: string; title: string; note: string; repeat: RepeatKind; date: number | null; time: number | null; weekday: number | null; monthDay: number | null } | null>(null)

const ymd = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const hm = (ts: number) => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const pending = computed(() => list.value.filter((r) => !r.done).length)

async function load() {
  list.value = await workbenchApi.reminders()
  emit('count', pending.value)
}
onMounted(load)

async function toggle(r: DayReminder) {
  const done = !r.done
  r.done = done
  try {
    await workbenchApi.markReminder(r.id, r.date, done)
  } catch {
    r.done = !done
  }
  emit('count', pending.value)
}
function openNew() {
  form.value = { title: '', note: '', repeat: 'NONE', date: Date.now(), time: null, weekday: null, monthDay: null }
}
function openEdit(d: ReminderDef) {
  const [h, m] = (d.timeOfDay ?? '').split(':').map(Number)
  form.value = { id: d.id, title: d.title, note: d.note ?? '', repeat: d.repeat, date: new Date(`${d.startDate}T00:00:00`).getTime(), time: d.timeOfDay ? new Date(2000, 0, 1, h, m).getTime() : null, weekday: d.weekday, monthDay: d.monthDay }
}
async function save() {
  const f = form.value
  if (!f) return
  if (!f.title.trim()) return void message.warning('请填写提醒内容')
  if (!f.date) return void message.warning('请选择日期')
  const body = { title: f.title, note: f.note, repeat: f.repeat, startDate: ymd(f.date), timeOfDay: f.time ? hm(f.time) : null, weekday: f.repeat === 'WEEKLY' ? (f.weekday ?? new Date(f.date).getDay()) : null, monthDay: f.repeat === 'MONTHLY' ? (f.monthDay ?? new Date(f.date).getDate()) : null }
  if (f.id) await workbenchApi.updateReminder(f.id, body)
  else await workbenchApi.createReminder(body)
  form.value = null
  message.success('已保存')
  await load()
  if (showDefs.value) defs.value = await workbenchApi.reminderDefs()
}
async function openDefs() {
  defs.value = await workbenchApi.reminderDefs()
  showDefs.value = true
}
async function removeDef(d: ReminderDef) {
  await workbenchApi.deleteReminder(d.id)
  defs.value = defs.value.filter((x) => x.id !== d.id)
  await load()
}
const defDesc = (d: ReminderDef) => `${REPEAT_LABEL[d.repeat]}${d.repeat === 'WEEKLY' ? ' ' + WEEK[d.weekday ?? new Date(`${d.startDate}T00:00:00`).getDay()] : ''}${d.repeat === 'MONTHLY' ? ` ${d.monthDay ?? Number(d.startDate.slice(8))}号` : ''}${d.repeat === 'NONE' ? ' ' + d.startDate : ''}${d.timeOfDay ? ' ' + d.timeOfDay : ''}`
</script>

<template>
  <div>
    <div class="rm-bar">
      <b>今天要办的提醒</b>
      <n-space><n-button size="small" @click="openDefs">我设置的提醒</n-button><n-button size="small" type="primary" @click="openNew">+ 新增提醒</n-button></n-space>
    </div>
    <n-empty v-if="list.length === 0" description="今天没有自己设置的提醒" style="margin: 24px 0" />
    <div v-for="r in list" :key="r.id + r.date" class="rm-item" :class="{ 'rm-done': r.done }">
      <button class="rm-check" :aria-label="r.done ? '取消完成' : '完成'" @click="toggle(r)"><span v-if="r.done">✓</span></button>
      <div class="rm-text">
        <div class="rm-title">{{ r.title }}</div>
        <div v-if="r.note" class="rm-sub">{{ r.note }}</div>
      </div>
      <n-tag v-if="r.overdue" size="small" type="error" :bordered="false">{{ r.startDate.slice(5) }} 逾期</n-tag>
      <n-tag v-else-if="r.timeOfDay" size="small" :bordered="false">{{ r.timeOfDay }}</n-tag>
    </div>

    <div class="rm-bar" style="margin-top: 22px"><b>系统派给我的事项</b><span class="rm-sub">审批、到期、采购、回访等，点一条直接去处理</span></div>
    <SystemTodos />

    <n-modal :mask-closable="false" :show="!!form" @update:show="(v) => !v && (form = null)">
      <n-card v-if="form" :title="form.id ? '编辑提醒' : '新增提醒'" style="width: min(480px, 96vw)" :bordered="false" closable @close="form = null">
        <n-form label-placement="top">
          <n-form-item label="提醒内容"><n-input v-model:value="form.title" maxlength="200" placeholder="例如：给高新店盘点奶粉库存" /></n-form-item>
          <n-form-item label="备注（可不填）"><n-input v-model:value="form.note" type="textarea" maxlength="500" :autosize="{ minRows: 2 }" /></n-form-item>
          <n-form-item label="重复方式"><n-select v-model:value="form.repeat" :options="(Object.keys(REPEAT_LABEL) as RepeatKind[]).map((k) => ({ label: REPEAT_LABEL[k], value: k }))" /></n-form-item>
          <n-form-item :label="form.repeat === 'NONE' ? '提醒日期' : '从哪天开始'"><n-date-picker v-model:value="form.date" type="date" style="width: 100%" /></n-form-item>
          <n-form-item v-if="form.repeat === 'WEEKLY'" label="每周几"><n-select v-model:value="form.weekday" :options="WEEK.map((w, i) => ({ label: w, value: i }))" placeholder="默认与开始日同一天" clearable /></n-form-item>
          <n-form-item v-if="form.repeat === 'MONTHLY'" label="每月几号"><n-input-number v-model:value="form.monthDay" :min="1" :max="31" placeholder="默认与开始日同一天" style="width: 100%" /></n-form-item>
          <n-form-item label="提醒时间（可不填，不填=全天）"><n-time-picker v-model:value="form.time" format="HH:mm" clearable style="width: 100%" /></n-form-item>
        </n-form>
        <template #footer><n-space justify="end"><n-button @click="form = null">取消</n-button><n-button type="primary" @click="save">保存</n-button></n-space></template>
      </n-card>
    </n-modal>

    <n-modal :mask-closable="false" :show="showDefs" @update:show="(v) => (showDefs = v)">
      <n-card title="我设置的全部提醒" style="width: min(560px, 96vw)" :bordered="false" closable @close="showDefs = false">
        <n-empty v-if="defs.length === 0" description="还没有设置过提醒" />
        <div v-for="d in defs" :key="d.id" class="rm-item">
          <div class="rm-text"><div class="rm-title">{{ d.title }}</div><div class="rm-sub">{{ defDesc(d) }}</div></div>
          <n-button size="small" @click="openEdit(d)">编辑</n-button>
          <n-button size="small" type="error" quaternary @click="removeDef(d)">删除</n-button>
        </div>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.rm-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.rm-item { display: flex; align-items: center; gap: 10px; padding: 12px; margin-bottom: 8px; background: #fbfaf6; border: 1px solid var(--bx-paper-3); border-radius: 10px; }
.rm-check { flex: none; width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--bx-ink); background: #fff; color: #fff; cursor: pointer; padding: 0; }
.rm-done .rm-check { background: var(--bx-ink); border-color: var(--bx-ink); }
.rm-text { flex: 1; min-width: 0; }
.rm-title { font-size: 15px; word-break: break-all; }
.rm-sub { font-size: 12px; color: var(--bx-gray); margin-top: 2px; }
.rm-done .rm-title, .rm-done .rm-sub { text-decoration: line-through; color: var(--bx-gray); }
</style>
