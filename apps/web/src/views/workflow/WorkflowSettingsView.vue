<script setup lang="ts">
/**
 * 审批流程设置：每类单据（申购单、请假、报销…）谁来审批、几级审批、会签还是或签、每一级的处理时限，
 * 以及启用/停用。修改流程会保存成新版本，已经在审批中的单据继续按原流程走完。
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NEmpty, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NSpace, NSpin, NSwitch, NTag } from 'naive-ui'
import { workflowDefinitionApi } from '../../api/modules/workflow-definition.api'
import { roleApi } from '../../api/modules/role.api'
import { customerApi } from '../../api/modules/customer.api'
import type { SaveDefinitionDto, SettingsDefinition } from '../../api/types/workflow'
import { message } from '../../utils/discrete-api'

const list = ref<SettingsDefinition[]>([])
const loading = ref(false)
const roles = ref<{ label: string; value: string }[]>([])
const staff = ref<{ label: string; value: string }[]>([])

async function load() {
  loading.value = true
  try {
    list.value = await workflowDefinitionApi.settings()
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  await load()
  roles.value = (await roleApi.list()).map((r) => ({ label: r.name, value: r.id }))
  staff.value = (await customerApi.staffOptions()).map((a) => ({ label: `${a.realName}（${a.username}）`, value: a.id }))
})

const summary = (d: SettingsDefinition) => d.nodes.map((n) => `${n.name}（${n.approverLabel}${n.timeoutHours ? `，限时 ${n.timeoutHours} 小时` : ''}）`).join('  →  ')

async function toggle(d: SettingsDefinition, enabled: boolean) {
  await workflowDefinitionApi.save(d.code, { enabled })
  message.success(enabled ? '已启用' : '已停用：这类单据暂时不能提交审批')
  await load()
}

// ---------------- 编辑 ----------------
interface NodeForm {
  name: string
  approverRoleIds: string[]
  approverAccountIds: string[]
  approvalMode: 'ALL' | 'ANY'
  timeoutHours: number | null
}
const editing = ref<SettingsDefinition | null>(null)
const form = ref<{ name: string; nodes: NodeForm[] }>({ name: '', nodes: [] })
const saving = ref(false)

function openEdit(d: SettingsDefinition) {
  editing.value = d
  form.value = {
    name: d.name,
    nodes: d.nodes.map((n) => ({ name: n.name, approverRoleIds: n.approverRoleIds?.length ? [...n.approverRoleIds] : n.approverRoleId ? [n.approverRoleId] : [], approverAccountIds: n.approverAccountIds?.length ? [...n.approverAccountIds] : n.approverAccountId ? [n.approverAccountId] : [], approvalMode: n.approvalMode, timeoutHours: n.timeoutHours })),
  }
}
const addNode = () => form.value.nodes.push({ name: `第 ${form.value.nodes.length + 1} 级审批`, approverRoleIds: [], approverAccountIds: [], approvalMode: 'ALL', timeoutHours: 24 })
const removeNode = (i: number) => form.value.nodes.splice(i, 1)
function move(i: number, d: -1 | 1) {
  const j = i + d
  if (j < 0 || j >= form.value.nodes.length) return
  const arr = form.value.nodes
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}
const flowText = computed(() => form.value.nodes.map((n, i) => `${i + 1}. ${n.name || '（未命名）'}`).join('  →  '))

async function save() {
  if (!editing.value) return
  const nodes: NonNullable<SaveDefinitionDto['nodes']> = []
  for (const [i, n] of form.value.nodes.entries()) {
    if (!n.name.trim()) return void message.error(`第 ${i + 1} 个节点请填写名称`)
    if (n.approverRoleIds.length === 0 && n.approverAccountIds.length === 0) return void message.error(`第 ${i + 1} 个节点请选择审批角色或审批人（可多选）`)
    if (n.approvalMode === 'ANY' && n.approverRoleIds.length + n.approverAccountIds.length < 2) message.warning(`第 ${i + 1} 个节点选了“或签”但只选了 1 个角色/审批人；如果这个角色里有多位员工，任意一位通过即可，否则等于单人审批`)
    nodes.push({
      name: n.name.trim(),
      approverType: n.approverRoleIds.length > 0 ? 'ROLE' : 'ACCOUNT',
      approverRoleIds: n.approverRoleIds,
      approverAccountIds: n.approverAccountIds,
      approvalMode: n.approvalMode,
      timeoutHours: n.timeoutHours ?? null,
    })
  }
  if (nodes.length === 0) return void message.error('至少要有一个审批节点')
  saving.value = true
  try {
    await workflowDefinitionApi.save(editing.value.code, { name: form.value.name.trim() || undefined, nodes })
    message.success('审批流程已保存（新提交的单据按新流程审批）')
    editing.value = null
    await load()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-spin :show="loading">
    <p class="ws-tip">在这里设置每类单据由谁审批、几级审批、每一级的处理时限。超过时限，审批人的“我的待办”里会标红提醒。修改后只影响之后新提交的单据，已经在审批中的单据按原流程走完。</p>
    <n-empty v-if="!loading && list.length === 0" description="暂无审批流程" />
    <n-card v-for="d in list" :key="d.code" size="small" class="ws-card">
      <div class="ws-top">
        <b>{{ d.name }}</b>
        <n-tag size="small" :bordered="false">v{{ d.version }}</n-tag>
        <n-tag v-if="d.inReview" size="small" type="warning" :bordered="false">{{ d.inReview }} 张审批中</n-tag>
        <span class="ws-sw"><n-switch :value="d.enabled" size="small" @update:value="(v: boolean) => toggle(d, v)" /> {{ d.enabled ? '启用中' : '已停用' }}</span>
        <n-button size="small" type="primary" secondary @click="openEdit(d)">修改流程</n-button>
      </div>
      <div class="ws-flow">{{ summary(d) }}</div>
    </n-card>

    <n-modal :mask-closable="false" :show="!!editing" @update:show="(v) => !v && (editing = null)">
      <n-card v-if="editing" :title="`修改审批流程：${editing.name}`" style="width: min(760px, 96vw); max-height: 92vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="top" size="small">
          <n-form-item label="流程名称"><n-input v-model:value="form.name" /></n-form-item>
        </n-form>
        <div class="ws-flowline">流程：{{ flowText }}</div>
        <div v-for="(n, i) in form.nodes" :key="i" class="ws-node">
          <div class="ws-node-h">
            <b>第 {{ i + 1 }} 级</b>
            <n-space :size="4">
              <n-button size="tiny" :disabled="i === 0" @click="move(i, -1)">上移</n-button>
              <n-button size="tiny" :disabled="i === form.nodes.length - 1" @click="move(i, 1)">下移</n-button>
              <n-button size="tiny" type="error" quaternary :disabled="form.nodes.length === 1" @click="removeNode(i)">删除</n-button>
            </n-space>
          </div>
          <div class="ws-grid">
            <n-form-item label="节点名称"><n-input v-model:value="n.name" maxlength="30" /></n-form-item>
            <n-form-item label="审批角色（可多选）">
              <n-select v-model:value="n.approverRoleIds" :options="roles" multiple filterable clearable placeholder="选择角色：该角色的在职员工（优先本门店）都是审批人" />
            </n-form-item>
            <n-form-item label="指定审批人（可多选）">
              <n-select v-model:value="n.approverAccountIds" :options="staff" multiple filterable clearable placeholder="直接选员工，可选 2～3 位或更多" />
            </n-form-item>
            <n-form-item label="多人时怎么审（角色成员和指定员工合在一起算）">
              <n-select v-model:value="n.approvalMode" :options="[{ label: '会签：全部通过才算通过', value: 'ALL' }, { label: '或签：任意一人通过即可', value: 'ANY' }]" />
            </n-form-item>
            <n-form-item label="处理时限（小时，留空=不限时）"><n-input-number v-model:value="n.timeoutHours" :min="1" :max="720" clearable style="width: 100%" placeholder="如 24" /></n-form-item>
          </div>
        </div>
        <n-button dashed block @click="addNode">+ 增加一级审批</n-button>
        <template #footer>
          <n-space justify="end">
            <n-button @click="editing = null">取消</n-button>
            <n-button type="primary" :loading="saving" @click="save">保存流程</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </n-spin>
</template>

<style scoped>
.ws-tip {
  margin: 0 0 12px;
  color: #666;
  font-size: 13px;
  line-height: 1.7;
}
.ws-card {
  margin-bottom: 10px;
}
.ws-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ws-sw {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #666;
}
.ws-flow {
  margin-top: 8px;
  font-size: 13px;
  color: #333;
}
.ws-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}
.ws-flowline {
  margin: 4px 0 10px;
  padding: 6px 10px;
  background: #faf6f0;
  border-radius: 6px;
  font-size: 12px;
}
.ws-node {
  margin-bottom: 10px;
  padding: 8px 12px 0;
  border: 1px solid #eee;
  border-radius: 8px;
}
.ws-node-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.ws-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 12px;
}
@media (max-width: 767px) {
  .ws-grid {
    grid-template-columns: 1fr;
  }
  .ws-sw {
    margin-left: 0;
  }
}
</style>
