import { ref } from 'vue'
import { message, dialog } from '../utils/discrete-api'

export interface ScopedEntity {
  id: string
  version: number
}

export interface CrudApi<T, TCreate, TUpdate> {
  list: () => Promise<T[]>
  create: (body: TCreate) => Promise<T>
  update: (id: string, body: TUpdate) => Promise<T>
  remove: (id: string) => Promise<unknown>
}

export function useCrudResource<T extends ScopedEntity, TCreate, TUpdate>(
  api: CrudApi<T, TCreate, TUpdate>,
  resourceName: string,
  describeRow: (row: T) => string = (row) => row.id,
) {
  const rows = ref<T[]>([]) as { value: T[] }
  const loading = ref(false)
  const formVisible = ref(false)
  const editingRow = ref<T | null>(null) as { value: T | null }
  const submitting = ref(false)

  async function fetchList() {
    loading.value = true
    try {
      rows.value = await api.list()
    } finally {
      loading.value = false
    }
  }

  function openCreateModal() {
    editingRow.value = null
    formVisible.value = true
  }

  function openEditModal(row: T) {
    editingRow.value = row
    formVisible.value = true
  }

  // GenericFormModal 是配置驱动的动态表单，产出的字段集合在编译期无法静态对应到
  // 具体的 TCreate/TUpdate 形状，这里按运行时是否处于编辑态转发给对应的 api 方法，
  // 真正的字段校验交给后端 DTO。
  async function submitForm(payload: Record<string, unknown>) {
    submitting.value = true
    try {
      if (editingRow.value) {
        await api.update(editingRow.value.id, payload as TUpdate)
        message.success(`${resourceName}已更新`)
      } else {
        await api.create(payload as TCreate)
        message.success(`${resourceName}已创建`)
      }
      formVisible.value = false
      await fetchList()
    } finally {
      submitting.value = false
    }
  }

  function confirmDelete(row: T, actionLabel = '删除') {
    dialog.warning({
      title: `${actionLabel}${resourceName}`,
      content: `确认${actionLabel}「${describeRow(row)}」吗？此操作不可撤销。`,
      positiveText: `确认${actionLabel}`,
      negativeText: '取消',
      onPositiveClick: async () => {
        await api.remove(row.id)
        message.success(`${resourceName}已${actionLabel}`)
        await fetchList()
      },
    })
  }

  return {
    rows,
    loading,
    formVisible,
    editingRow,
    submitting,
    fetchList,
    openCreateModal,
    openEditModal,
    submitForm,
    confirmDelete,
  }
}
