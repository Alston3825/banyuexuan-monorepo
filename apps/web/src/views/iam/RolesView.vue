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

const permissionTree = computed(() => buildPermissionTree(permissionCatalog.value) as unknown as TreeOption[])
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
  await Promise.all([
    ...added.map((id) => roleApi.grantPermission(roleId, id)),
    ...removed.map((id) => roleApi.revokePermission(roleId, id)),
  ])
  checkedKeys.value = [...newKeySet]
  await fetchList()
  const refreshed = rows.value.find((r) => r.id === roleId)
  if (refreshed) permDrawerRole.value = refreshed
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
      <n-card :title="editingRow ? '编辑角色' : '新建角色'" style="width: 460px" :bordered="false" role="dialog" aria-modal="true">
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
