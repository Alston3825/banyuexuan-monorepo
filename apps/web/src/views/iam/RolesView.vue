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
  loadDefaultsDiff(row.id)
}

// 与“默认权限清单”的差异（只有系统预设的岗位角色才有默认清单，如店长/部门负责人/护理长…）
const defaultsDiff = ref<{ hasDefault: boolean; defaultCount: number; add: { name: string }[]; remove: { name: string }[] } | null>(null)
const restoring = ref(false)
async function loadDefaultsDiff(roleId: string) {
  defaultsDiff.value = null
  try {
    const d = await roleApi.defaultsPreview(roleId)
    if (permDrawerRole.value?.id === roleId) defaultsDiff.value = d
  } catch {
    defaultsDiff.value = null
  }
}
function confirmRestoreDefaults() {
  const role = permDrawerRole.value
  const d = defaultsDiff.value
  if (!role || !d) return
  const names = (xs: { name: string }[]) => xs.slice(0, 6).map((x) => x.name).join('、') + (xs.length > 6 ? `…等 ${xs.length} 项` : '')
  dialog.warning({
    title: `把「${role.name}」恢复为默认权限？`,
    content:
      `默认清单共 ${d.defaultCount} 项权限。恢复后：新增 ${d.add.length} 项${d.add.length ? `（${names(d.add)}）` : ''}；撤销 ${d.remove.length} 项${d.remove.length ? `（${names(d.remove)}）` : ''}。` +
      '已分配该角色的员工，重新登录后生效。',
    positiveText: '确认恢复',
    negativeText: '取消',
    onPositiveClick: async () => {
      restoring.value = true
      try {
        const res = await roleApi.restoreDefaults(role.id)
        message.success(`已恢复默认权限（新增 ${res.granted}，撤销 ${res.revoked}）`)
        const fresh = await roleApi.get(role.id)
        permDrawerRole.value = fresh
        checkedKeys.value = fresh.permissions.map((p) => p.permissionPointId)
        loadDefaultsDiff(role.id)
        fetchList()
      } finally {
        restoring.value = false
      }
    },
  })
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
  // 保存请求排队一个接一个发（快速连点时不会同时发好几个，网络差时也不会互相抢）；
  // 网络没通（没拿到任何回应）时自动重试，这个接口重复提交是安全的。
  saveQueue = saveQueue.then(async () => {
    try {
      await saveWithRetry(roleId, added, removed)
    } catch {
      // 没拿到回应不代表没保存成功（请求可能已到服务器、只是回应丢了）：以服务器上的实际权限为准重新显示，
      // 这样界面显示的永远跟后端一致
      try {
        const fresh = await roleApi.get(roleId)
        checkedKeys.value = fresh.permissions.map((p) => p.permissionPointId)
        const ok = added.every((k) => checkedKeys.value.includes(k)) && removed.every((k) => !checkedKeys.value.includes(k))
        if (ok) message.success('权限已保存（网络有点慢，已核对服务器上的结果）')
        else message.error('权限没有保存成功，已恢复为服务器上的实际权限，请重新勾选一次')
      } catch {
        message.error('网络不稳定，没能确认是否保存成功，请刷新页面后查看')
      }
    }
  })
  await saveQueue
}

let saveQueue: Promise<void> = Promise.resolve()
async function saveWithRetry(roleId: string, added: string[], removed: string[]) {
  for (let attempt = 0; ; attempt++) {
    try {
      // 一次请求批量保存（以前一个权限点一个请求，勾选大模块几百个请求会超过限流，表现成“保存失败”）
      return await roleApi.changePermissions(roleId, added, removed)
    } catch (err) {
      const noResponse = !(err as { response?: unknown }).response
      if (!noResponse || attempt >= 2) throw err
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
  }
}
// 关闭抽屉后再刷新表格里的角色列表（以前每勾一下就整张列表重新下载一次）
watch(permDrawerVisible, (v) => {
  if (!v) fetchList()
})

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

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑角色' : '新建角色'" style="width: min(460px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
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
        <p v-if="isSystemRole" style="color: #86817a; margin-bottom: 12px">系统内置角色不可修改权限</p>
        <div v-if="defaultsDiff?.hasDefault" style="margin-bottom: 12px; padding: 8px 10px; background: #eef2f5; border-radius: 6px; font-size: 13px">
          <template v-if="defaultsDiff.add.length === 0 && defaultsDiff.remove.length === 0">已是推荐的默认权限（共 {{ defaultsDiff.defaultCount }} 项）。</template>
          <template v-else>
            与推荐的默认权限不同：缺 {{ defaultsDiff.add.length }} 项，多 {{ defaultsDiff.remove.length }} 项。
            <n-button size="tiny" type="warning" :loading="restoring" style="margin-left: 8px" @click="confirmRestoreDefaults">恢复默认权限</n-button>
          </template>
        </div>
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
