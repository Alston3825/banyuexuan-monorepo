<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NEmpty, NForm, NFormItem, NInput, NModal, NSelect, NSpace, NTabPane, NTabs, NTag, NSwitch, NInputNumber } from 'naive-ui'
import { integrationApi, type IntegrationSystem, type RoomBinding, type ServiceCodeItem } from '../../api/modules/integration.api'
import { roomApi } from '../../api/modules/room.api'
import { storeApi } from '../../api/modules/store.api'
import { useAuthStore } from '../../stores/auth'
import { message } from '../../utils/discrete-api'

const auth = useAuthStore()
const canSystem = computed(() => auth.hasAccess('integration.system.view'))
const canBind = computed(() => auth.hasAccess('integration.binding.update'))
const tab = ref(canSystem.value ? 'systems' : 'bindings')

// ---------- 接入系统 ----------
const systems = ref<IntegrationSystem[]>([])
const stores = ref<{ id: string; name: string }[]>([])
const sysForm = ref(false)
const sysModel = ref({ code: 'call-locating', name: '伴月轩智能呼叫定位系统', baseUrl: '', systemVersion: '', storeId: null as string | null, remark: '' })
const keyShown = ref<{ title: string; key: string } | null>(null)

async function loadSystems() {
  if (canSystem.value) systems.value = await integrationApi.systems()
}
async function createSystem() {
  if (!sysModel.value.code || !sysModel.value.name) return message.warning('请填系统代号和名称')
  const r = await integrationApi.createSystem({ ...sysModel.value, storeId: sysModel.value.storeId || undefined })
  sysForm.value = false
  keyShown.value = { title: `「${sysModel.value.name}」的 API Key（只显示这一次，请马上复制保存）`, key: r.apiKey }
  await loadSystems()
}
async function toggle(s: IntegrationSystem) {
  await integrationApi.updateSystem(s.id, { enabled: !s.enabled })
  message.success(s.enabled ? '已停用，该系统立刻无法访问' : '已启用')
  await loadSystems()
}
async function resetKey(s: IntegrationSystem) {
  if (!window.confirm(`重置后旧 Key 立刻失效，呼叫系统要换成新 Key。确定重置「${s.name}」的 Key 吗？`)) return
  const r = await integrationApi.resetKey(s.id)
  keyShown.value = { title: `「${s.name}」的新 API Key（只显示这一次）`, key: r.apiKey }
  await loadSystems()
}
async function copyKey() {
  try {
    await navigator.clipboard.writeText(keyShown.value!.key)
    message.success('已复制')
  } catch {
    message.info('请手动选中复制')
  }
}
const storeName = (id: string | null) => (id ? stores.value.find((s) => s.id === id)?.name ?? id : '所有门店')

// ---------- 房间设备绑定 ----------
const rooms = ref<{ id: string; roomNo: string; floor: string; storeId: string }[]>([])
const bindings = ref<RoomBinding[]>([])
const bindStore = ref<string | null>(null)
const bindKeyword = ref('')
const bindForm = ref(false)
const bindModel = ref({ roomId: null as string | null, kind: 'TABLET' as 'TABLET' | 'BEACON', deviceCode: '', remark: '' })
const roomOptions = computed(() => rooms.value.filter((r) => !bindStore.value || r.storeId === bindStore.value).map((r) => ({ label: `${r.floor}楼 ${r.roomNo}`, value: r.id })))
const grouped = computed(() => {
  const kw = bindKeyword.value.trim().toLowerCase()
  const byRoom = new Map<string, RoomBinding[]>()
  for (const b of bindings.value) {
    if (kw && !`${b.room.roomNo} ${b.deviceCode}`.toLowerCase().includes(kw)) continue
    byRoom.set(b.roomId, [...(byRoom.get(b.roomId) ?? []), b])
  }
  return [...byRoom.entries()].map(([roomId, list]) => ({ roomId, room: list[0].room, list }))
})
async function loadBindings() {
  bindings.value = await integrationApi.bindings({ storeId: bindStore.value || undefined })
}
async function addBinding() {
  if (!bindModel.value.roomId || !bindModel.value.deviceCode.trim()) return message.warning('请选房间并填设备编号')
  await integrationApi.addBinding({ roomId: bindModel.value.roomId, kind: bindModel.value.kind, deviceCode: bindModel.value.deviceCode.trim(), remark: bindModel.value.remark || undefined })
  message.success('已绑定')
  bindForm.value = false
  bindModel.value.deviceCode = ''
  await loadBindings()
}
async function unbind(b: RoomBinding) {
  if (!window.confirm(`解除 ${b.room.roomNo} 房的${b.kind === 'TABLET' ? '平板' : '蓝牙信标'} ${b.deviceCode}？`)) return
  await integrationApi.removeBinding(b.id)
  await loadBindings()
}

// ---------- 服务项 ----------
const codes = ref<ServiceCodeItem[]>([])
const codeForm = ref(false)
const codeModel = ref({ serviceCode: '', name: '', category: 'CALL', sortNo: 99, active: true })
async function loadCodes() {
  if (canSystem.value) codes.value = await integrationApi.serviceCodes()
}
function editCode(c?: ServiceCodeItem) {
  codeModel.value = c ? { serviceCode: c.serviceCode, name: c.name, category: c.category, sortNo: c.sortNo, active: c.status === 'ACTIVE' } : { serviceCode: '', name: '', category: 'CALL', sortNo: 99, active: true }
  codeForm.value = true
}
async function saveCode() {
  const m = codeModel.value
  await integrationApi.upsertServiceCode({ serviceCode: m.serviceCode, name: m.name, category: m.category, sortNo: m.sortNo, status: m.active ? 'ACTIVE' : 'INACTIVE' })
  codeForm.value = false
  await loadCodes()
}

onMounted(async () => {
  stores.value = (await storeApi.list().catch(() => [])) as { id: string; name: string }[]
  rooms.value = (await roomApi.list().catch(() => [])) as typeof rooms.value
  await Promise.all([loadSystems(), loadBindings(), loadCodes()])
})
</script>

<template>
  <div>
    <n-alert type="info" :bordered="false" style="margin-bottom: 12px">
      这里管理“伴月轩智能呼叫定位系统”等外部系统的对接：给它发 API Key（它只能读取门店/房间/员工/入住信息，并写回呼叫记录），并登记每间房的平板和蓝牙信标。ID 规则与接口见 docs/集成规范-呼叫定位系统.md。
    </n-alert>
    <n-tabs v-model:value="tab" type="line" animated>
      <n-tab-pane v-if="canSystem" name="systems" tab="接入系统">
        <n-space justify="end" style="margin-bottom: 12px"><n-button type="primary" @click="sysForm = true">登记新系统并生成 Key</n-button></n-space>
        <n-empty v-if="!systems.length" description="还没有接入任何系统" />
        <n-space vertical :size="12">
          <n-card v-for="s in systems" :key="s.id" size="small">
            <template #header>{{ s.name }} <n-tag size="small">{{ s.code }}</n-tag> <n-tag size="small" :type="s.enabled ? 'success' : 'default'">{{ s.enabled ? '已启用' : '已停用' }}</n-tag></template>
            <div>可访问：{{ storeName(s.storeId) }}　版本：{{ s.systemVersion || '—' }}　Key：{{ s.apiKeyPrefix }}…</div>
            <div>地址：{{ s.baseUrl || '—' }}　最近访问：{{ s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : '从未' }}</div>
            <template #footer>
              <n-space>
                <n-button size="small" @click="toggle(s)">{{ s.enabled ? '停用' : '启用' }}</n-button>
                <n-button size="small" type="warning" @click="resetKey(s)">重置 Key</n-button>
              </n-space>
            </template>
          </n-card>
        </n-space>
      </n-tab-pane>

      <n-tab-pane name="bindings" tab="房间设备绑定">
        <n-space style="margin-bottom: 12px" :wrap="true">
          <n-select v-model:value="bindStore" :options="stores.map((s) => ({ label: s.name, value: s.id }))" clearable placeholder="全部门店" style="width: 160px" @update:value="loadBindings" />
          <n-input v-model:value="bindKeyword" placeholder="搜房号或设备编号" clearable style="width: 200px" />
          <n-button v-if="canBind" type="primary" @click="bindForm = true">绑定设备</n-button>
        </n-space>
        <n-empty v-if="!grouped.length" description="还没有绑定任何设备" />
        <div class="grid">
          <n-card v-for="g in grouped" :key="g.roomId" size="small" :title="`${g.room.floor}楼 ${g.room.roomNo}`">
            <div v-for="b in g.list" :key="b.id" class="row">
              <n-tag size="small" :type="b.kind === 'TABLET' ? 'info' : 'warning'">{{ b.kind === 'TABLET' ? '平板' : '信标' }}</n-tag>
              <span class="code">{{ b.deviceCode }}</span>
              <n-button v-if="canBind" size="tiny" quaternary type="error" @click="unbind(b)">解绑</n-button>
            </div>
          </n-card>
        </div>
      </n-tab-pane>

      <n-tab-pane v-if="canSystem" name="codes" tab="服务项字典">
        <n-space justify="end" style="margin-bottom: 12px"><n-button type="primary" @click="editCode()">新增服务项</n-button></n-space>
        <div class="grid">
          <n-card v-for="c in codes" :key="c.id" size="small" :title="c.name">
            <div>代号：<b>{{ c.serviceCode }}</b>　分类：{{ c.category }}　<n-tag size="small" :type="c.status === 'ACTIVE' ? 'success' : 'default'">{{ c.status === 'ACTIVE' ? '启用' : '停用' }}</n-tag></div>
            <template #footer><n-button size="small" @click="editCode(c)">编辑</n-button></template>
          </n-card>
        </div>
      </n-tab-pane>
    </n-tabs>

    <n-modal :mask-closable="false" :show="sysForm" @update:show="(v) => (sysForm = v)">
      <n-card title="登记接入系统" style="width: min(520px, 96vw)" :bordered="false" role="dialog" closable @close="sysForm = false" aria-modal="true">
        <n-form label-placement="top">
          <n-form-item label="系统代号（小写字母/数字/-，登记后不可改）"><n-input v-model:value="sysModel.code" /></n-form-item>
          <n-form-item label="系统名称"><n-input v-model:value="sysModel.name" /></n-form-item>
          <n-form-item label="只允许访问的门店（不选=所有门店）"><n-select v-model:value="sysModel.storeId" :options="stores.map((s) => ({ label: s.name, value: s.id }))" clearable /></n-form-item>
          <n-form-item label="系统地址（选填）"><n-input v-model:value="sysModel.baseUrl" placeholder="http://192.168.1.10:8000" /></n-form-item>
          <n-form-item label="版本（选填）"><n-input v-model:value="sysModel.systemVersion" /></n-form-item>
        </n-form>
        <template #footer><n-space justify="end"><n-button @click="sysForm = false">取消</n-button><n-button type="primary" @click="createSystem">生成 Key</n-button></n-space></template>
      </n-card>
    </n-modal>

    <n-modal :mask-closable="false" :show="!!keyShown" @update:show="(v) => { if (!v) keyShown = null }">
      <n-card :title="keyShown?.title" style="width: min(560px, 96vw)" :bordered="false" role="dialog" closable @close="keyShown = null" aria-modal="true">
        <n-input :value="keyShown?.key" readonly type="textarea" :autosize="{ minRows: 2 }" />
        <template #footer><n-space justify="end"><n-button type="primary" @click="copyKey">复制</n-button><n-button @click="keyShown = null">我已保存</n-button></n-space></template>
      </n-card>
    </n-modal>

    <n-modal :mask-closable="false" :show="bindForm" @update:show="(v) => (bindForm = v)">
      <n-card title="绑定设备到房间" style="width: min(480px, 96vw)" :bordered="false" role="dialog" closable @close="bindForm = false" aria-modal="true">
        <n-form label-placement="top">
          <n-form-item label="房间"><n-select v-model:value="bindModel.roomId" :options="roomOptions" filterable placeholder="输入房号搜索" /></n-form-item>
          <n-form-item label="设备类型"><n-select v-model:value="bindModel.kind" :options="[{ label: '房间平板（每间房 1 台）', value: 'TABLET' }, { label: '蓝牙信标（每间房可多个）', value: 'BEACON' }]" /></n-form-item>
          <n-form-item :label="bindModel.kind === 'BEACON' ? '信标编号（格式：大号-小号，如 1601-1）' : '设备编号（与呼叫系统里一致）'"><n-input v-model:value="bindModel.deviceCode" :placeholder="bindModel.kind === 'BEACON' ? '例如 1601-1' : ''" /></n-form-item>
        </n-form>
        <template #footer><n-space justify="end"><n-button @click="bindForm = false">取消</n-button><n-button type="primary" @click="addBinding">绑定</n-button></n-space></template>
      </n-card>
    </n-modal>

    <n-modal :mask-closable="false" :show="codeForm" @update:show="(v) => (codeForm = v)">
      <n-card title="服务项" style="width: min(480px, 96vw)" :bordered="false" role="dialog" closable @close="codeForm = false" aria-modal="true">
        <n-form label-placement="top">
          <n-form-item label="服务代号（大写字母/数字/下划线）"><n-input v-model:value="codeModel.serviceCode" /></n-form-item>
          <n-form-item label="名称"><n-input v-model:value="codeModel.name" /></n-form-item>
          <n-form-item label="排序"><n-input-number v-model:value="codeModel.sortNo" /></n-form-item>
          <n-form-item label="启用"><n-switch v-model:value="codeModel.active" /></n-form-item>
        </n-form>
        <template #footer><n-space justify="end"><n-button @click="codeForm = false">取消</n-button><n-button type="primary" @click="saveCode">保存</n-button></n-space></template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.code { flex: 1; word-break: break-all; }
</style>
