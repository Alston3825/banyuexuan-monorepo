<script setup lang="ts">
/**
 * 客户渠道：两级都可以自定义。
 *  - 渠道类型（如 自然到店/转介绍/线上广告…，也可以加自己的，如 医院合作）
 *  - 具体渠道（类型下面的明细，如 线上广告 > 小红书）
 * 新建客户时先选类型、再选具体渠道。系统自带的 6 个类型可以改名/停用但不能删；
 * 已经有客户在用的类型/渠道不能删，只能停用。查看人人可以，增改删仅超级管理员。
 */
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NCard, NDataTable, NInput, NModal, NSelect, NSpace, NTabPane, NTabs, NTag, type DataTableColumns } from 'naive-ui'
import { customerChannelApi } from '../../api/modules/customer-channel.api'
import type { CustomerChannel, CustomerChannelType } from '../../api/types/customer'
import { useAuthStore } from '../../stores/auth'
import { dialog, message } from '../../utils/discrete-api'

const auth = useAuthStore()
const canCreate = computed(() => auth.hasAccess('crm.channel.create'))
const canUpdate = computed(() => auth.hasAccess('crm.channel.update'))

const tab = ref<'types' | 'channels'>('types')
const types = ref<CustomerChannelType[]>([])
const channels = ref<CustomerChannel[]>([])
const loading = ref(false)
const filterTypeId = ref<string | null>(null)
const typeOptions = computed(() => types.value.map((t) => ({ label: t.status === 'ACTIVE' ? t.name : `${t.name}（已停用）`, value: t.id })))
const typeName = (id: string) => types.value.find((t) => t.id === id)?.name ?? '-'
const shownChannels = computed(() => (filterTypeId.value ? channels.value.filter((c) => c.typeId === filterTypeId.value) : channels.value))

async function fetchAll() {
  loading.value = true
  try {
    ;[types.value, channels.value] = await Promise.all([customerChannelApi.listTypes(), customerChannelApi.list()])
  } finally {
    loading.value = false
  }
}

const statusTag = (active: boolean) =>
  h(NTag, { size: 'small', round: true, type: active ? 'success' : 'default' }, { default: () => (active ? '启用' : '已停用') })

// ---------------- 新增 / 改名（类型和具体渠道共用一个弹窗） ----------------
type Editing = { kind: 'type'; row: CustomerChannelType } | { kind: 'channel'; row: CustomerChannel } | null
const formVisible = ref(false)
const formKind = ref<'type' | 'channel'>('type')
const editing = ref<Editing>(null)
const form = ref({ typeId: null as string | null, name: '' })
const submitting = ref(false)

function openCreate(kind: 'type' | 'channel') {
  formKind.value = kind
  editing.value = null
  form.value = { typeId: kind === 'channel' ? filterTypeId.value : null, name: '' }
  formVisible.value = true
}
function openRename(e: NonNullable<Editing>) {
  formKind.value = e.kind
  editing.value = e
  form.value = { typeId: e.kind === 'channel' ? e.row.typeId : null, name: e.row.name }
  formVisible.value = true
}
async function submit() {
  const name = form.value.name.trim()
  if (!name || (formKind.value === 'channel' && !form.value.typeId)) {
    message.error(formKind.value === 'channel' ? '请选择渠道类型并填写渠道名称' : '请填写渠道类型名称')
    return
  }
  submitting.value = true
  try {
    const e = editing.value
    if (formKind.value === 'type') {
      if (e?.kind === 'type') await customerChannelApi.updateType(e.row.id, { name, version: e.row.version })
      else await customerChannelApi.createType({ name })
    } else if (e?.kind === 'channel') {
      await customerChannelApi.update(e.row.id, { name, version: e.row.version })
    } else {
      await customerChannelApi.create({ typeId: form.value.typeId!, name })
    }
    message.success(e ? '已保存' : '已新增')
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

function toggleStatus(e: NonNullable<Editing>) {
  const stopping = e.row.status === 'ACTIVE'
  const label = e.kind === 'type' ? '渠道类型' : '渠道'
  dialog.warning({
    title: stopping ? `停用${label}` : `启用${label}`,
    content: stopping ? `停用后新建客户时不能再选“${e.row.name}”，已经选了它的 ${e.row.customerCount} 位客户不受影响。确认停用吗？` : `确认重新启用“${e.row.name}”吗？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      const status = stopping ? 'INACTIVE' : 'ACTIVE'
      if (e.kind === 'type') await customerChannelApi.updateType(e.row.id, { status, version: e.row.version })
      else await customerChannelApi.update(e.row.id, { status, version: e.row.version })
      message.success(stopping ? '已停用' : '已启用')
      await fetchAll()
    },
  })
}

function remove(e: NonNullable<Editing>) {
  const label = e.kind === 'type' ? '渠道类型' : '具体渠道'
  dialog.error({
    title: `删除${label}`,
    content: `确认删除“${e.row.name}”吗？删除后不能恢复。（已经有客户在用的不允许删除，请改用“停用”。）`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      if (e.kind === 'type') await customerChannelApi.removeType(e.row.id)
      else await customerChannelApi.remove(e.row.id)
      message.success('已删除')
      await fetchAll()
    },
  })
}

function actionButtons(e: NonNullable<Editing>, canDelete: boolean) {
  return h(NSpace, null, {
    default: () => [
      h(NButton, { size: 'small', onClick: () => openRename(e) }, { default: () => '改名' }),
      h(NButton, { size: 'small', type: e.row.status === 'ACTIVE' ? 'warning' : 'primary', onClick: () => toggleStatus(e) }, { default: () => (e.row.status === 'ACTIVE' ? '停用' : '启用') }),
      canDelete ? h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => remove(e) }, { default: () => '删除' }) : null,
    ],
  })
}

const typeColumns: DataTableColumns<CustomerChannelType> = [
  {
    key: 'name',
    title: '渠道类型',
    render: (row) => (row.legacySource ? h('span', null, [row.name, h(NTag, { size: 'tiny', style: 'margin-left:6px', type: 'info' }, { default: () => '系统自带' })]) : row.name),
  },
  { key: 'channelCount', title: '具体渠道数', width: 110 },
  { key: 'customerCount', title: '使用的客户数', width: 120 },
  { key: 'status', title: '状态', width: 90, render: (row) => statusTag(row.status === 'ACTIVE') },
  {
    key: 'actions',
    title: '操作',
    width: 230,
    render: (row) => (canUpdate.value ? actionButtons({ kind: 'type', row }, !row.legacySource) : '-'),
  },
]

const channelColumns: DataTableColumns<CustomerChannel> = [
  { key: 'typeId', title: '渠道类型', width: 150, render: (row) => typeName(row.typeId) },
  { key: 'name', title: '具体渠道' },
  { key: 'customerCount', title: '使用的客户数', width: 120 },
  { key: 'status', title: '状态', width: 90, render: (row) => statusTag(row.status === 'ACTIVE') },
  {
    key: 'actions',
    title: '操作',
    width: 230,
    render: (row) => (canUpdate.value ? actionButtons({ kind: 'channel', row }, true) : '-'),
  },
]

const modalTitle = computed(() => `${editing.value ? '修改' : '新增'}${formKind.value === 'type' ? '渠道类型' : '具体渠道'}`)

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-tabs v-model:value="tab" type="line" animated>
      <n-tab-pane name="types" tab="渠道类型">
        <n-space justify="space-between" style="margin-bottom: 12px" :wrap="true">
          <span style="color: #86817a; font-size: 13px">新建客户时第一步选的“渠道类型”。可以改名、停用，也可以加自己的类型。</span>
          <n-button v-if="canCreate" type="primary" @click="openCreate('type')">新增渠道类型</n-button>
        </n-space>
        <n-data-table :columns="typeColumns" :data="types" :loading="loading" :row-key="(r: CustomerChannelType) => r.id" :scroll-x="640" />
      </n-tab-pane>
      <n-tab-pane name="channels" tab="具体渠道">
        <n-space justify="space-between" style="margin-bottom: 12px" :wrap="true">
          <n-select v-model:value="filterTypeId" :options="typeOptions" clearable placeholder="全部渠道类型" style="width: min(220px, 94vw)" />
          <n-button v-if="canCreate" type="primary" @click="openCreate('channel')">新增具体渠道</n-button>
        </n-space>
        <n-data-table :columns="channelColumns" :data="shownChannels" :loading="loading" :row-key="(r: CustomerChannel) => r.id" :scroll-x="640">
          <template #empty>还没有具体渠道，点右上角“新增具体渠道”添加（如 线上广告 → 小红书）</template>
        </n-data-table>
      </n-tab-pane>
    </n-tabs>

    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="modalTitle" style="width: min(420px, 94vw)" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-space vertical :size="12">
          <n-select v-if="formKind === 'channel'" v-model:value="form.typeId" :options="typeOptions" :disabled="editing?.kind === 'channel'" placeholder="渠道类型" />
          <n-input
            v-model:value="form.name"
            :placeholder="formKind === 'type' ? '渠道类型名称，如 医院合作、美团点评' : '具体渠道名称，如 小红书、某某医院合作'"
            maxlength="50"
            @keyup.enter="submit"
          />
        </n-space>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="submit">确定</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
