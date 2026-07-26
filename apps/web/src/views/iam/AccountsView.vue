<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
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
  type DataTableColumns,
  type FormInst,
} from 'naive-ui'
import { accountApi } from '../../api/modules/account.api'
import { storeApi } from '../../api/modules/store.api'
import { departmentApi } from '../../api/modules/department.api'
import { teamApi } from '../../api/modules/team.api'
import { positionApi } from '../../api/modules/position.api'
import { roleApi } from '../../api/modules/role.api'
import type { Account, DataScopeType } from '../../api/types/account'
import { renderStatusBadge, ACCOUNT_STATUS_MAP, SCOPE_TYPE_LABEL_MAP } from '../../utils/status-map'
import { message, dialog } from '../../utils/discrete-api'

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
  const [stores, departments, teams, positions, roles] = await Promise.all([
    storeApi.list(),
    departmentApi.list(),
    teamApi.list(),
    positionApi.list(),
    roleApi.list(),
  ])
  storeOptions.value = stores.map((s) => ({ label: s.name, value: s.id }))
  regionOptions.value = Array.from(new Map(stores.map((s) => [s.regionId, s.regionId])).keys()).map((id) => ({
    label: id,
    value: id,
  }))
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
  email: '',
  storeId: undefined as string | undefined,
  departmentId: undefined as string | undefined,
  teamId: undefined as string | undefined,
  positionId: undefined as string | undefined,
  status: 'ACTIVE' as Account['status'],
})

function openCreateModal() {
  editingRow.value = null
  model.value = {
    username: '',
    realName: '',
    password: '',
    phone: '',
    email: '',
    storeId: undefined,
    departmentId: undefined,
    teamId: undefined,
    positionId: undefined,
    status: 'ACTIVE',
  }
  formVisible.value = true
}

function openEditModal(row: Account) {
  editingRow.value = row
  model.value = {
    username: row.username,
    realName: row.realName,
    password: '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    storeId: row.storeId ?? undefined,
    departmentId: row.departmentId ?? undefined,
    teamId: row.teamId ?? undefined,
    positionId: row.positionId ?? undefined,
    status: row.status,
  }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await accountApi.update(editingRow.value.id, {
        realName: model.value.realName,
        phone: model.value.phone || undefined,
        email: model.value.email || undefined,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('账号已更新')
    } else {
      await accountApi.create({
        username: model.value.username,
        realName: model.value.realName,
        password: model.value.password,
        phone: model.value.phone || undefined,
        email: model.value.email || undefined,
        storeId: model.value.storeId,
        departmentId: model.value.departmentId,
        teamId: model.value.teamId,
        positionId: model.value.positionId,
      })
      message.success('账号已创建')
    }
    formVisible.value = false
    await fetchList()
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
const assignModel = ref({ roleId: '', scopeType: 'STORE' as DataScopeType, scopeId: undefined as string | undefined })
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

async function openRoleDrawer(row: Account) {
  const fresh = await accountApi.get(row.id)
  roleDrawerAccount.value = fresh
  assignModel.value = { roleId: '', scopeType: 'STORE', scopeId: undefined }
  roleDrawerVisible.value = true
}

async function handleAssignRole() {
  if (!roleDrawerAccount.value || !assignModel.value.roleId) {
    message.error('请选择角色')
    return
  }
  assignSubmitting.value = true
  try {
    await accountApi.assignRole(roleDrawerAccount.value.id, {
      roleId: assignModel.value.roleId,
      scopeType: assignModel.value.scopeType,
      scopeId: ['TENANT', 'SELF'].includes(assignModel.value.scopeType) ? undefined : assignModel.value.scopeId,
    })
    message.success('已分配角色')
    roleDrawerAccount.value = await accountApi.get(roleDrawerAccount.value.id)
    assignModel.value = { roleId: '', scopeType: 'STORE', scopeId: undefined }
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

const columns: DataTableColumns<Account> = [
  { key: 'username', title: '用户名' },
  { key: 'realName', title: '姓名' },
  { key: 'phone', title: '手机号', render: (row) => row.phone ?? '-' },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, ACCOUNT_STATUS_MAP) },
  { key: 'lastLoginAt', title: '最近登录', render: (row) => (row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '从未登录') },
  {
    key: 'actions',
    title: '操作',
    width: 260,
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
          h(NButton, { size: 'small', onClick: () => openResetPassword(row) }, { default: () => '重置密码' }),
          h(NButton, { size: 'small', onClick: () => openRoleDrawer(row) }, { default: () => '角色分配' }),
        ],
      }),
  },
]

onMounted(async () => {
  await Promise.all([fetchList(), fetchPickerOptions()])
})
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <span />
      <n-button type="primary" @click="openCreateModal">新建账号</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Account) => r.id" :scroll-x="900" />

    <!-- 新建/编辑 -->
    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑账号' : '新建账号'" style="width: 520px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="90">
          <n-form-item v-if="!editingRow" label="用户名" path="username" :rule="{ required: true, message: '请输入用户名' }">
            <n-input v-model:value="model.username" />
          </n-form-item>
          <n-form-item label="姓名" path="realName" :rule="{ required: true, message: '请输入姓名' }">
            <n-input v-model:value="model.realName" />
          </n-form-item>
          <n-form-item v-if="!editingRow" label="初始密码" path="password" :rule="{ required: true, message: '请输入初始密码' }">
            <n-input v-model:value="model.password" type="password" show-password-on="click" />
          </n-form-item>
          <n-form-item label="手机号" path="phone">
            <n-input v-model:value="model.phone" />
          </n-form-item>
          <n-form-item label="邮箱" path="email">
            <n-input v-model:value="model.email" />
          </n-form-item>
          <template v-if="!editingRow">
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
          </template>
          <n-form-item v-else label="状态" path="status">
            <n-select
              v-model:value="model.status"
              :options="[
                { label: '正常', value: 'ACTIVE' },
                { label: '已禁用', value: 'DISABLED' },
                { label: '已锁定', value: 'LOCKED' },
              ]"
            />
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

    <!-- 重置密码 -->
    <n-modal :show="resetPwdVisible" @update:show="(v) => (resetPwdVisible = v)">
      <n-card title="重置密码" style="width: 420px" :bordered="false" role="dialog" aria-modal="true">
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
                <span v-if="a.scopeId">（{{ a.scopeId }}）</span>
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
          <n-form-item label="范围">
            <n-select
              v-model:value="assignModel.scopeType"
              :options="[
                { label: '租户级', value: 'TENANT' },
                { label: '区域级', value: 'REGION' },
                { label: '门店级', value: 'STORE' },
                { label: '部门级', value: 'DEPARTMENT' },
                { label: '班组级', value: 'TEAM' },
                { label: '仅本人', value: 'SELF' },
              ]"
            />
          </n-form-item>
          <n-form-item v-if="!['TENANT', 'SELF'].includes(assignModel.scopeType)" label="范围对象">
            <n-select v-model:value="assignModel.scopeId" :options="scopeIdOptions" />
          </n-form-item>
          <n-button type="primary" :loading="assignSubmitting" @click="handleAssignRole">添加分配</n-button>
        </n-form>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
