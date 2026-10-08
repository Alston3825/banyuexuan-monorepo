<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NButton,
  NSpace,
  NDataTable,
  NModal,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NDrawer,
  NDrawerContent,
  NList,
  NListItem,
  NThing,
  NDivider,
  NDatePicker,
  NRadio,
  NRadioGroup,
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { accountApi } from '../../api/modules/account.api'
import { storeApi } from '../../api/modules/store.api'
import { departmentApi } from '../../api/modules/department.api'
import { teamApi } from '../../api/modules/team.api'
import { positionApi } from '../../api/modules/position.api'
import { roleApi } from '../../api/modules/role.api'
import { regionApi } from '../../api/modules/region.api'
import { employeeProfileApi } from '../../api/modules/hr.api'
import type { EmployeeProfile } from '../../api/types/hr'
import type { Account, DataScopeType } from '../../api/types/account'
import { renderStatusBadge, ACCOUNT_STATUS_MAP, SCOPE_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'
import { useAuthStore } from '../../stores/auth'
import AccountImportDialog from '../../components/account/AccountImportDialog.vue'

const DEFAULT_PASSWORD = 'banyuexuan'
const auth = useAuthStore()
/** 员工工号一旦分配，只有拥有“修改工号”权限的人（默认仅管理员）才能改 */
const canChangeNo = computed(() => auth.hasAccess('hr.employee-profile.change-no'))

const rows = ref<Account[]>([])
const loading = ref(false)

const storeOptions = ref<{ label: string; value: string }[]>([])
const departmentOptions = ref<{ label: string; value: string }[]>([])
const teamOptions = ref<{ label: string; value: string }[]>([])
const positionOptions = ref<{ label: string; value: string }[]>([])
const roleOptions = ref<{ label: string; value: string }[]>([])
const regionOptions = ref<{ label: string; value: string }[]>([])

async function fetchList() {
  loading.value = true
  try {
    rows.value = await accountApi.list()
  } finally {
    loading.value = false
  }
}

async function fetchPickerOptions() {
  // 每一项单独兜底：没有“角色/区域”查看权限的店长打开页面时，门店/部门等下拉也要能正常加载
  const soft = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[])
  const [stores, departments, teams, positions, roles, regions] = await Promise.all([
    soft(storeApi.list()),
    soft(departmentApi.list()),
    soft(teamApi.list()),
    soft(positionApi.list()),
    soft(roleApi.list()),
    soft(regionApi.list()),
  ])
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  regionOptions.value = regions.map((r) => ({ label: r.name, value: r.id }))
  departmentOptions.value = departments.map((d) => ({ label: d.name, value: d.id }))
  teamOptions.value = teams.map((t) => ({ label: t.name, value: t.id }))
  positionOptions.value = positions.map((p) => ({ label: p.name, value: p.id }))
  roleOptions.value = roles.map((r) => ({ label: `${r.name}（${r.code}）`, value: r.id }))
}

// ---------------- 新建/编辑 ----------------
const formVisible = ref(false)
const editingRow = ref<Account | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const model = ref({
  username: '',
  realName: '',
  password: '',
  phone: '',
  storeId: undefined as string | undefined,
  departmentId: undefined as string | undefined,
  teamId: undefined as string | undefined,
  positionId: undefined as string | undefined,
  status: 'ACTIVE' as Account['status'],
  // 账号与员工档案一一对应：新建账号时一起把员工档案建了；编辑时这两项取自员工档案，改了会同步过去
  // （其余更详细的人事信息在“员工档案”模块里维护）。
  employeeNo: '',
  hireDate: Date.now() as number | null,
})

// 编辑时要把工号/入职日期对应的员工档案找出来（没有人事查看权限就取不到，当作没有）
const profileByAccount = ref<Map<string, EmployeeProfile>>(new Map())
async function fetchProfiles() {
  try {
    profileByAccount.value = new Map((await employeeProfileApi.list()).map((p) => [p.accountId, p]))
  } catch {
    profileByAccount.value = new Map()
  }
}
const statusOptions = computed(() => [
  { label: '正常', value: 'ACTIVE' },
  { label: '已禁用', value: 'DISABLED' },
  ...(editingRow.value ? [{ label: '已锁定', value: 'LOCKED' }] : []),
])

function openCreateModal() {
  editingRow.value = null
  model.value = {
    username: '',
    realName: '',
    password: DEFAULT_PASSWORD,
    phone: '',
    storeId: undefined,
    departmentId: undefined,
    teamId: undefined,
    positionId: undefined,
    status: 'ACTIVE',
    employeeNo: '',
    hireDate: Date.now(),
  }
  formVisible.value = true
  employeeProfileApi.nextNo().then((no) => !editingRow.value && !model.value.employeeNo && (model.value.employeeNo = no)).catch(() => {})
}

// 用户名默认跟着手机号走（手动改过用户名后就不再跟）
watch(
  () => model.value.phone,
  (phone, old) => {
    if (editingRow.value) return
    if (!model.value.username || model.value.username === (old ?? '').trim()) model.value.username = phone.trim()
  },
)

// ---------------- 拖入员工信息表批量开通 ----------------
const importVisible = ref(false)
const importFile = ref<File | null>(null)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function takeFile(file?: File | null) {
  dragging.value = false
  if (!file) return
  if (!/\.xlsx$/i.test(file.name)) return void message.error('请选择 .xlsx 格式的 Excel 员工信息表（.xls 请先另存为 .xlsx）')
  importFile.value = file
  formVisible.value = false
  importVisible.value = true
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  takeFile(e.dataTransfer?.files?.[0])
}
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  takeFile(input.files?.[0])
  input.value = ''
}
async function onImported() {
  await Promise.all([fetchList(), fetchProfiles()])
}

function openEditModal(row: Account) {
  editingRow.value = row
  model.value = {
    username: row.username,
    realName: row.realName,
    password: '',
    phone: row.phone ?? '',
    storeId: row.storeId ?? undefined,
    departmentId: row.departmentId ?? undefined,
    teamId: row.teamId ?? undefined,
    positionId: row.positionId ?? undefined,
    status: row.status,
    employeeNo: profileByAccount.value.get(row.id)?.employeeNo ?? '',
    hireDate: profileByAccount.value.get(row.id) ? new Date(profileByAccount.value.get(row.id)!.hireDate).getTime() : null,
  }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      const m = model.value
      if (m.password && m.password.length < 6) {
        message.error('新密码至少 6 位')
        return
      }
      await accountApi.update(editingRow.value.id, {
        realName: m.realName,
        phone: m.phone || undefined,
        storeId: m.storeId ?? null,
        departmentId: m.departmentId ?? null,
        teamId: m.teamId ?? null,
        positionId: m.positionId ?? null,
        status: m.status,
        version: editingRow.value.version,
      })
      if (m.password) await accountApi.resetPassword(editingRow.value.id, m.password)
      // 工号/入职日期同步到员工档案（已有档案：改了才更新；没有档案：两项都填了就新建）
      const profile = profileByAccount.value.get(editingRow.value.id)
      const hireIso = m.hireDate ? new Date(m.hireDate).toISOString() : undefined
      if (profile) {
        const hireChanged = hireIso !== undefined && hireIso.slice(0, 10) !== profile.hireDate.slice(0, 10)
        if ((m.employeeNo && m.employeeNo !== profile.employeeNo) || hireChanged) {
          await employeeProfileApi.update(profile.id, { employeeNo: m.employeeNo || undefined, hireDate: hireChanged ? hireIso : undefined, version: profile.version })
        }
      } else if (m.employeeNo && hireIso) {
        await employeeProfileApi.create({ accountId: editingRow.value.id, employeeNo: m.employeeNo, hireDate: hireIso })
      }
      message.success('账号已更新')
    } else {
      await accountApi.create({
        username: model.value.username,
        realName: model.value.realName,
        password: model.value.password,
        phone: model.value.phone || undefined,
        storeId: model.value.storeId,
        departmentId: model.value.departmentId,
        teamId: model.value.teamId,
        positionId: model.value.positionId,
        status: model.value.status === 'DISABLED' ? 'DISABLED' : undefined,
        employeeNo: model.value.employeeNo || undefined,
        hireDate: model.value.hireDate ? new Date(model.value.hireDate).toISOString() : undefined,
      })
      message.success('账号已创建')
    }
    formVisible.value = false
    await Promise.all([fetchList(), fetchProfiles()])
  } finally {
    submitting.value = false
  }
}

// ---------------- 重置密码 ----------------
const resetPwdVisible = ref(false)
const resetPwdTarget = ref<Account | null>(null)
const resetPwdModel = ref({ newPassword: '', confirm: '' })
const resetPwdSubmitting = ref(false)

function openResetPassword(row: Account) {
  resetPwdTarget.value = row
  resetPwdModel.value = { newPassword: '', confirm: '' }
  resetPwdVisible.value = true
}

async function handleResetPassword() {
  if (!resetPwdTarget.value) return
  if (!resetPwdModel.value.newPassword || resetPwdModel.value.newPassword.length < 6) {
    message.error('新密码至少 6 位')
    return
  }
  if (resetPwdModel.value.newPassword !== resetPwdModel.value.confirm) {
    message.error('两次输入的密码不一致')
    return
  }
  resetPwdSubmitting.value = true
  try {
    await accountApi.resetPassword(resetPwdTarget.value.id, resetPwdModel.value.newPassword)
    message.success('密码已重置')
    resetPwdVisible.value = false
  } finally {
    resetPwdSubmitting.value = false
  }
}

// ---------------- 角色分配 ----------------
const roleDrawerVisible = ref(false)
const roleDrawerAccount = ref<Account | null>(null)
const assignModel = ref({ roleId: '', scopeType: 'STORE' as DataScopeType, scopeIds: [] as string[] })
const assignSubmitting = ref(false)

const scopeIdOptions = computed(() => {
  switch (assignModel.value.scopeType) {
    case 'REGION':
      return regionOptions.value
    case 'STORE':
      return storeOptions.value
    case 'DEPARTMENT':
      return departmentOptions.value
    case 'TEAM':
      return teamOptions.value
    default:
      return []
  }
})

// 范围对象的名字（以前直接显示一串编号）
function scopeName(a: { scopeType: DataScopeType; scopeId: string | null }): string {
  if (!a.scopeId) return ''
  const pool = a.scopeType === 'STORE' ? storeOptions.value : a.scopeType === 'REGION' ? regionOptions.value : a.scopeType === 'DEPARTMENT' ? departmentOptions.value : teamOptions.value
  return pool.find((o) => o.value === a.scopeId)?.label ?? '（已删除或无权查看）'
}

async function openRoleDrawer(row: Account) {
  const fresh = await accountApi.get(row.id)
  roleDrawerAccount.value = fresh
  // 默认：门店级 + 这位员工所在的门店，少点一下也不容易选错
  assignModel.value = { roleId: '', scopeType: 'STORE', scopeIds: fresh.storeId ? [fresh.storeId] : [] }
  roleDrawerVisible.value = true
}
// 换了“范围”类型，原来选的对象就不适用了
function onScopeTypeChange() {
  assignModel.value.scopeIds = assignModel.value.scopeType === 'STORE' && roleDrawerAccount.value?.storeId ? [roleDrawerAccount.value.storeId] : []
}
// 这位员工已经有的“同角色 + 同范围”，选了也不会重复添加，提前在界面上提示
const alreadyHas = computed(() => {
  const m = assignModel.value
  if (!m.roleId) return []
  return (roleDrawerAccount.value?.roleAssignments ?? [])
    .filter((a) => a.roleId === m.roleId && a.scopeType === m.scopeType && (!a.scopeId || m.scopeIds.includes(a.scopeId)))
    .map((a) => scopeName(a) || SCOPE_TYPE_LABEL_MAP[a.scopeType])
})

async function handleAssignRole() {
  if (!roleDrawerAccount.value || !assignModel.value.roleId) {
    message.error('请选择角色')
    return
  }
  const needsObj = !['TENANT', 'SELF'].includes(assignModel.value.scopeType)
  if (needsObj && assignModel.value.scopeIds.length === 0) {
    message.error('请选择范围对象（比如具体是哪几家门店，可以多选），不选的话这个角色不会生效')
    return
  }
  assignSubmitting.value = true
  try {
    const res = await accountApi.assignRole(roleDrawerAccount.value.id, {
      roleId: assignModel.value.roleId,
      scopeType: assignModel.value.scopeType,
      scopeIds: needsObj ? assignModel.value.scopeIds : undefined,
    })
    const r = res as unknown as { createdCount?: number; skippedCount?: number }
    message.success(`已分配角色${r.createdCount && r.createdCount > 1 ? `（${r.createdCount} 个范围）` : ''}${r.skippedCount ? `，另有 ${r.skippedCount} 个范围本来就有，已跳过` : ''}。员工重新登录后生效`)
    roleDrawerAccount.value = await accountApi.get(roleDrawerAccount.value.id)
    assignModel.value = { roleId: '', scopeType: 'STORE', scopeIds: roleDrawerAccount.value.storeId ? [roleDrawerAccount.value.storeId] : [] }
  } finally {
    assignSubmitting.value = false
  }
}

function confirmRevokeAssignment(assignmentId: string) {
  dialog.warning({
    title: '撤销角色分配',
    content: '确认撤销该角色分配吗？',
    positiveText: '确认撤销',
    negativeText: '取消',
    onPositiveClick: async () => {
      if (!roleDrawerAccount.value) return
      await accountApi.revokeRoleAssignment(roleDrawerAccount.value.id, assignmentId)
      message.success('已撤销')
      roleDrawerAccount.value = await accountApi.get(roleDrawerAccount.value.id)
    },
  })
}

// ---------------- 删除 ----------------
// 账号名下但凡挂着真实业务数据（员工档案/客户/线索/报销单等），后端会拒绝并返回
// 具体是哪些数据挡住了删除，提示改用"编辑→状态改为已禁用"；这里不用额外兜底文案，
// 走 client.ts 全局 409 拦截器把后端的提示原样弹出来就够了。
function confirmDelete(row: Account) {
  dialog.warning({
    title: '删除账号',
    content: `确认删除账号"${row.realName}（${row.username}）"吗？此操作不可恢复。若该账号名下已有业务数据，将无法删除，请改用"禁用"。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await accountApi.remove(row.id)
      message.success('账号已删除')
      await fetchList()
    },
  })
}

const columns: DataTableColumns<Account> = [
  { key: 'username', title: '用户名' },
  { key: 'realName', title: '姓名' },
  { key: 'phone', title: '手机号', render: (row) => row.phone ?? '-' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, ACCOUNT_STATUS_MAP) },
  { key: 'lastLoginAt', title: '最近登录', render: (row) => (row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '从未登录') },
  {
    key: 'actions',
    title: '操作',
    width: 320,
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
          h(NButton, { size: 'small', onClick: () => openResetPassword(row) }, { default: () => '重置密码' }),
          h(NButton, { size: 'small', onClick: () => openRoleDrawer(row) }, { default: () => '角色分配' }),
          h(NButton, { size: 'small', type: 'error', quaternary: true, onClick: () => confirmDelete(row) }, { default: () => '删除' }),
        ],
      }),
  },
]

onMounted(async () => {
  await Promise.all([fetchList(), fetchPickerOptions(), fetchProfiles()])
})
</script>

<template>
  <div>
    <input ref="fileInput" type="file" accept=".xlsx" style="display: none" @change="onPick" />
    <div class="acc-drop acc-drop-page" :class="{ 'acc-drop-on': dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop="onDrop" @click="fileInput?.click()">
      📄 把填好的《员工信息表》Excel 拖到这里（或点击选择），自动读取并批量开通账号；用户名 = 手机号，初始密码 {{ DEFAULT_PASSWORD }}
    </div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <span />
      <n-button type="primary" @click="openCreateModal">新建账号</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Account) => r.id" :scroll-x="900" />

    <!-- 新建/编辑 -->
    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑账号' : '新建账号'" style="width: min(520px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <div v-if="!editingRow" class="acc-drop" :class="{ 'acc-drop-on': dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop="onDrop" @click="fileInput?.click()">
          📄 有员工信息表？把 Excel 拖到这里（或点击选择），批量开通账号
        </div>
        <n-form ref="formRef" :model="model" label-placement="left" label-width="90">
          <n-form-item label="手机号" path="phone" :rule="editingRow ? undefined : [{ required: true, message: '请输入手机号' }, { pattern: /^1[3-9]\d{9}$/, message: '请输入 11 位手机号', trigger: ['blur', 'input'] }]">
            <n-input v-model:value="model.phone" placeholder="员工的主要识别信息，不能重复" maxlength="11" />
          </n-form-item>
          <n-form-item label="用户名" path="username" :rule="editingRow ? undefined : { required: true, message: '请输入用户名' }">
            <n-input v-model:value="model.username" :disabled="!!editingRow" placeholder="默认就是手机号，登录用，建好后不能改" />
          </n-form-item>
          <n-form-item label="姓名" path="realName" :rule="{ required: true, message: '请输入姓名' }">
            <n-input v-model:value="model.realName" />
          </n-form-item>
          <n-form-item :label="editingRow ? '新密码' : '初始密码'" path="password" :rule="editingRow ? undefined : { required: true, message: '请输入初始密码' }">
            <n-input v-model:value="model.password" type="password" show-password-on="click" :placeholder="editingRow ? '不修改密码请留空' : '至少 6 位'" />
            <template v-if="!editingRow" #feedback>默认 {{ DEFAULT_PASSWORD }}，可以改</template>
          </n-form-item>
          <n-form-item label="门店" path="storeId">
            <n-select v-model:value="model.storeId" :options="storeOptions" clearable />
          </n-form-item>
          <n-form-item label="部门" path="departmentId">
            <n-select v-model:value="model.departmentId" :options="departmentOptions" clearable />
          </n-form-item>
          <n-form-item label="班组" path="teamId">
            <n-select v-model:value="model.teamId" :options="teamOptions" clearable />
          </n-form-item>
          <n-form-item label="职位" path="positionId">
            <n-select v-model:value="model.positionId" :options="positionOptions" clearable />
          </n-form-item>
          <!-- 账号与员工档案一一对应：新建账号顺带把员工档案建了；编辑时这两项取自员工档案，改了同步过去。
               更详细的人事信息（合同、社保、身份证、工资卡等）在“员工档案”模块里维护。 -->
          <n-form-item label="员工工号" path="employeeNo" :rule="editingRow ? undefined : { required: true, message: '请输入员工工号' }">
            <n-input v-model:value="model.employeeNo" :disabled="!!editingRow && !canChangeNo" placeholder="系统已建议下一个工号，可以改" />
            <template v-if="editingRow && !canChangeNo" #feedback>工号一旦分配，只有管理员才能修改</template>
          </n-form-item>
          <n-form-item label="入职日期" path="hireDate" :rule="editingRow ? undefined : { required: true, type: 'number', message: '请选择入职日期' }">
            <n-date-picker v-model:value="model.hireDate" type="date" style="width: 100%" :clearable="!!editingRow" />
          </n-form-item>
          <n-form-item label="状态" path="status">
            <n-select v-model:value="model.status" :options="statusOptions" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <account-import-dialog v-model:show="importVisible" :file="importFile" :store-options="storeOptions" :role-options="roleOptions" @done="onImported" />

    <!-- 重置密码 -->
    <n-modal :show="resetPwdVisible" @update:show="(v) => (resetPwdVisible = v)">
      <n-card title="重置密码" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="90">
          <n-form-item label="新密码">
            <n-input v-model:value="resetPwdModel.newPassword" type="password" show-password-on="click" />
          </n-form-item>
          <n-form-item label="确认密码">
            <n-input v-model:value="resetPwdModel.confirm" type="password" show-password-on="click" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="resetPwdVisible = false">取消</n-button>
            <n-button type="primary" :loading="resetPwdSubmitting" @click="handleResetPassword">确认重置</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 角色分配抽屉 -->
    <n-drawer v-model:show="roleDrawerVisible" :width="420">
      <n-drawer-content :title="`角色分配 - ${roleDrawerAccount?.realName ?? ''}`" :native-scrollbar="false">
        <n-list v-if="roleDrawerAccount?.roleAssignments?.length" bordered>
          <n-list-item v-for="a in roleDrawerAccount.roleAssignments" :key="a.id">
            <n-thing :title="a.role?.name ?? a.roleId">
              <template #description>
                {{ SCOPE_TYPE_LABEL_MAP[a.scopeType] }}
                <b v-if="a.scopeId">：{{ scopeName(a) }}</b>
              </template>
            </n-thing>
            <template #suffix>
              <n-button size="small" type="error" quaternary @click="confirmRevokeAssignment(a.id)">撤销</n-button>
            </template>
          </n-list-item>
        </n-list>
        <p v-else style="color: #999">暂无角色分配</p>

        <n-divider>新增分配</n-divider>
        <n-form label-placement="left" label-width="80">
          <n-form-item label="角色">
            <n-select v-model:value="assignModel.roleId" :options="roleOptions" />
          </n-form-item>
          <!-- 现在只有门店这一层需要区分（区域/部门/班组/仅本人用不上，已从这里隐藏；以前分配过的仍会正常显示和生效） -->
          <n-form-item label="管哪些门店">
            <n-radio-group v-model:value="assignModel.scopeType" @update:value="onScopeTypeChange">
              <n-space vertical :size="4">
                <n-radio value="STORE">指定门店（可多选，推荐：员工只能看到所选门店的数据）</n-radio>
                <n-radio value="TENANT">全部门店（含以后新开的店，一般只给管理员/总部人员）</n-radio>
              </n-space>
            </n-radio-group>
          </n-form-item>
          <n-form-item v-if="!['TENANT', 'SELF'].includes(assignModel.scopeType)" label="选择门店">
            <n-select v-model:value="assignModel.scopeIds" :options="scopeIdOptions" multiple filterable clearable placeholder="点选门店，可以多选" />
          </n-form-item>
          <p v-if="alreadyHas.length" style="color: #d9822b; font-size: 12px; margin: -6px 0 8px 80px">这位员工已经有这个角色的：{{ alreadyHas.join('、') }}（重复的会自动跳过）</p>
          <p style="color: #999; font-size: 12px; margin: 0 0 8px 80px">分配后，员工需要重新登录（最多 30 分钟内自动刷新）才会生效。</p>
          <n-button type="primary" :loading="assignSubmitting" @click="handleAssignRole">添加分配</n-button>
        </n-form>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.acc-drop {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1.5px dashed #d9b38c;
  border-radius: 8px;
  background: #fffaf3;
  color: #8a5a22;
  font-size: 13px;
  text-align: center;
  cursor: pointer;
}
.acc-drop-page {
  line-height: 1.6;
}
.acc-drop-on {
  background: #ffe9cc;
  border-color: #d9822b;
}
</style>
