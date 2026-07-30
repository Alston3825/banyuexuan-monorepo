<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NSwitch, NAlert, type DataTableColumns, type FormInst } from 'naive-ui'
import { deviceTypeApi } from '../../api/modules/iot.api'
import type { DeviceType } from '../../api/types/iot'
import { renderStatusBadge, COMMON_STATUS_MAP, DEVICE_CATEGORY_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const rows = ref<DeviceType[]>([])
const loading = ref(false)

const formVisible = ref(false)
const editingRow = ref<DeviceType | null>(null)
const submitting = ref(false)
const formRef = ref<FormInst | null>(null)

const categoryOptions = Object.entries(DEVICE_CATEGORY_LABEL_MAP).map(([value, label]) => ({ label, value }))

const model = ref({
  category: 'CALL_SERVICE' as DeviceType['category'],
  name: '',
  protocol: '',
  requiresCommandConfirmation: false,
  status: 'ACTIVE' as DeviceType['status'],
})

async function fetchAll() {
  loading.value = true
  try {
    rows.value = await deviceTypeApi.list()
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingRow.value = null
  model.value = { category: 'CALL_SERVICE', name: '', protocol: '', requiresCommandConfirmation: false, status: 'ACTIVE' }
  formVisible.value = true
}

function openEditModal(row: DeviceType) {
  editingRow.value = row
  model.value = { category: row.category, name: row.name, protocol: row.protocol, requiresCommandConfirmation: row.requiresCommandConfirmation, status: row.status }
  formVisible.value = true
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (editingRow.value) {
      await deviceTypeApi.update(editingRow.value.id, {
        category: model.value.category,
        name: model.value.name,
        protocol: model.value.protocol,
        requiresCommandConfirmation: model.value.requiresCommandConfirmation,
        status: model.value.status,
        version: editingRow.value.version,
      })
      message.success('设备类型已更新')
    } else {
      await deviceTypeApi.create({
        category: model.value.category,
        name: model.value.name,
        protocol: model.value.protocol,
        requiresCommandConfirmation: model.value.requiresCommandConfirmation,
      })
      message.success('设备类型已创建')
    }
    formVisible.value = false
    await fetchAll()
  } finally {
    submitting.value = false
  }
}

const columns: DataTableColumns<DeviceType> = [
  { key: 'name', title: '名称' },
  { key: 'category', title: '品类', render: (row) => DEVICE_CATEGORY_LABEL_MAP[row.category] ?? row.category },
  { key: 'protocol', title: '接入协议' },
  { key: 'requiresCommandConfirmation', title: '指令需二次确认', render: (row) => (row.requiresCommandConfirmation ? '是' : '否') },
  { key: 'status', title: '状态', render: (row) => renderStatusBadge(row.status, COMMON_STATUS_MAP) },
  {
    key: 'actions',
    title: '操作',
    width: 100,
    render: (row) => h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
  },
]

onMounted(fetchAll)
</script>

<template>
  <div>
    <n-alert type="info" :bordered="false" style="margin-bottom: 12px">
      设备类型是总部制定的协议/品类规范，用于登记设备台账时选择；门禁/监控等敏感设备可勾选"指令需二次确认"。V1不采购真实硬件，仅搭建架构与模拟验证。
    </n-alert>
    <n-space justify="end" style="margin-bottom: 12px">
      <n-button type="primary" @click="openCreateModal">新建设备类型</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :row-key="(r: DeviceType) => r.id" :scroll-x="900" />

    <n-modal :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? '编辑设备类型' : '新建设备类型'" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
        <n-form ref="formRef" :model="model" label-placement="left" label-width="120">
          <n-form-item label="品类" path="category" :rule="{ required: true }">
            <n-select v-model:value="model.category" :options="categoryOptions" />
          </n-form-item>
          <n-form-item label="名称" path="name" :rule="{ required: true, message: '请输入名称' }">
            <n-input v-model:value="model.name" placeholder="如 呼叫器-标准型" />
          </n-form-item>
          <n-form-item label="接入协议" path="protocol" :rule="{ required: true, message: '请输入接入协议' }">
            <n-input v-model:value="model.protocol" placeholder="如 MQTT / RTSP/MQTT / 串口转HTTP" />
          </n-form-item>
          <n-form-item label="指令需二次确认">
            <n-switch v-model:value="model.requiresCommandConfirmation" />
          </n-form-item>
          <n-form-item v-if="editingRow" label="状态">
            <n-select
              v-model:value="model.status"
              :options="[
                { label: '启用', value: 'ACTIVE' },
                { label: '停用', value: 'INACTIVE' },
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
  </div>
</template>
