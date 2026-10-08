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
  NDrawer,
  NDrawerContent,
  NTree,
  NTag,
  type DataTableColumns,
  type FormInst,
  type TreeOption,
} from 'naive-ui'
import { roleApi } from '../../api/modules/role.api'
import { permissionApi } from '../../api/modules/permission.api'
import { buildPermissionTree } from '../../utils/permission-tree'
import type { Role } from '../../api/types/role'
import type { PermissionPoint } from '../../api/types/permission'
import { message, dialog } from '../../utils/discrete-api'

const rows = ref<Role[]>([])
const loading = ref(false)

async function fetchList() {
  loading.value = true
  try {
    rows.value = await roleApi.list()
  } finally {
    loading.value = false
  }
}

// ---------------- 新建/编辑 ----------------
const formVisible = ref(false)
const editingRow = ref<Role | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)
const model = ref({ name: '', description: '' })

function openCreateModal() {
  editingRow.value = null
  model.value = { name: '', description: '' }
  formVisible.value = true
}

function openEditModal(row: Role) {
  editingRow.value = row
  model.value = { name: row.name, description: row.description ?? '' }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await roleApi.update(editingRow.value.id, {
        name: model.value.name,
        description: model.value.description,
        version: editingRow.value.version,
      })
      message.success('角色已更新')
    } else {
      await roleApi.create({ name: model.value.name, description: model.value.description })
      message.success('角色已创建')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

function confirmDelete(row: Role) {
  dialog.warning({
    title: '删除角色',
    content: `确认删除「${row.name}」吗？此操作不可撤销。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await roleApi.remove(row.id)
      message.success('角色已删除')
      await fetchList()
    },
  })
}

// ---------------- 权限树抽屉 ----------------
const permDrawerVisible = ref(false)
const permDrawerRole = ref<Role | null>(null)
const permissionCatalog = ref<PermissionPoint[]>([])
const checkedKeys = ref<string[]>([])

// 权限点名字里的英文动作（view/create…）翻成中文，勾选时一眼能看懂
const ACTION_ZH: Record<string, string> = {
  view: '查看', create: '新建', update: '修改', delete: '删除', submit: '提交', cancel: '取消', approve: '审批', reject: '驳回',
  execute: '执行', convert: '生成采购单', collect: '汇总', purchase: '确认采购', receive: '收货确认', archive: '归档', restore: '恢复',
  'change-no': '修改工号', withdraw: '撤回', reassign: '转交', 'add-approver': '加签', cc: '抄送', checkin: '办理入住', checkout: '办理离店',
  reschedule: '改期/换房', void: '作废', adjust: '调整', lose: '标记流失', import: '导入', 'force-delete': '强制删除', grade: '批阅', publish: '发布',
}
function zhName(p: PermissionPoint): string {
  const last = p.code.split('.').pop() ?? ''
  const zh = ACTION_ZH[last]
  return zh && p.name.endsWith(`-${last}`) ? `${p.name.slice(0, -last.length - 1)}-${zh}` : p.name
}
const permissionTree = computed(() => buildPermissionTree(permissionCatalog.value.map((p) => ({ ...p, name: zhName(p) }))) as unknown as TreeOption[])
const isSystemRole = computed(() => permDrawerRole.value?.isSystem === true)

async function openPermissionDrawer(row: Role) {
  if (permissionCatalog.value.length === 0) {
    permissionCatalog.value = await permissionApi.list()
  }
  permDrawerRole.value = row
  checkedKeys.value = row.permissions.map((p) => p.permissionPointId)
  permDrawerVisible.value = true
}

async function handleCheckedKeysChange(newKeys: (string | number)[]) {
  if (!permDrawerRole.value) return
  const newKeySet = new Set(newKeys.map(String))
  const oldKeySet = new Set(checkedKeys.value)
  const added = [...newKeySet].filter((k) => !oldKeySet.has(k))
  const removed = [...oldKeySet].filter((k) => !newKeySet.has(k))
  if (added.length === 0 && removed.length === 0) return

  const roleId = permDrawerRole.value.id
  // 乐观更新：先改勾选状态界面立刻响应，再打接口——n-tree的checked-keys是受控prop，
  // 如果等接口都返回了才更新，勾选一个大模块要cascade并发十几个请求，这段等待期间
  // 界面上checkbox看起来跟点之前一样没变化，很容易被当成"权限点不动/选不上"。
  checkedKeys.value = [...newKeySet]
  try {
    // 一次请求批量保存（以前一个权限点一个请求，勾选大模块几百个请求会超过限流，表现成“保存失败”）
    await roleApi.changePermissions(roleId, added, removed)
  } catch (err) {
    checkedKeys.value = [...oldKeySet] // 接口失败要把勾选状态退回去，不能让界面显示的跟后端实际保存的对不上
    message.error('权限保存失败，请重试')
    throw err
  }
  // 后台悄悄刷新表格缓存的角色列表，但不重新赋值 permDrawerRole——如果把它换成一个新的
  // 对象引用，权限树会因为props整体变化被迫完整重新渲染，在勾选项很多时会有一瞬间空白，
  // 这跟上面"没有乐观更新导致看起来点不动"是同一类问题的另一半成因，两处一起改。
  fetchList()
}

const columns: DataTableColumns<Role> = [
  { key: 'name', title: '名称' },
  { key: 'description', title: '描述', render: (row) => row.description ?? '-' },
  {
    key: 'isSystem',
    title: '类型',
    render: (row) => (row.isSystem ? h(NTag, { type: 'warning', size: 'small' }, { default: () => '系统内置' }) : '自定义'),
  },
  {
    key: 'actions',
    title: '操作',
    width: 240,
    render: (row) =>
      h(NSpace, null, {
        default: () => [
          h(NButton, { size: 'small', disabled: row.isSystem, onClick: () => openEditModal(row) }, { default: () => '编辑' }),
          h(NButton, { size: 'small', onClick: () => openPermissionDrawer(row) }, { default: () => '权限设置' }),
          h(
            NButton,
            { size: 'small', type: 'error', quaternary: true, disabled: row.isSystem, onClick: () => confirmDelete(row) },
            { default: () => '删除' },
          ),
        ],
      }),
  },
]

onMounted(fetchList)
</script>

<template>
  <div>
    <n-space justify="space-between" style="margin-bottom: 12px">
      <span />
      <n-button type="primary" @click="openCreateModal">新建角色</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: Role) => r.id" :scroll-x="820" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑角色' : '新建角色'" style="width: min(460px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="80">
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" />
          </n-form-item>
          <n-form-item label="描述" path="description">
            <n-input v-model:value="model.description" type="textarea" />
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

    <n-drawer v-model:show="permDrawerVisible" :width="420">
      <n-drawer-content :title="`权限设置 - ${permDrawerRole?.name ?? ''}`" :native-scrollbar="false">
        <p v-if="isSystemRole" style="color: #999; margin-bottom: 12px">系统内置角色不可修改权限</p>
        <n-tree
          :data="permissionTree"
          key-field="id"
          label-field="name"
          children-field="children"
          :checkable="!isSystemRole"
          :checked-keys="checkedKeys"
          :selectable="false"
          cascade
          @update:checked-keys="handleCheckedKeysChange"
        />
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
