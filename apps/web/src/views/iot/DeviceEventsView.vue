<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NSpace, NDataTable, NCard, NForm, NFormItem, NInput, NSelect, NAlert, NDescriptions, NDescriptionsItem, type DataTableColumns } from 'naive-ui'
import { deviceApi, deviceTypeApi, deviceGatewayApi } from '../../api/modules/iot.api'
import type { Device, DeviceEvent, DeviceShadow, DeviceType } from '../../api/types/iot'
import { DEVICE_CATEGORY_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'

const devices = ref<Device[]>([])
const deviceTypes = ref<DeviceType[]>([])
const events = ref<DeviceEvent[]>([])
const shadow = ref<DeviceShadow | null>(null)
const loadingEvents = ref(false)
const submittingEvent = ref(false)
const submittingCommand = ref(false)
const confirmingCommand = ref(false)

const selectedDeviceId = ref<string | null>(null)
const eventType = ref('')
const payloadText = ref('{}')
const commandText = ref('{}')
const lastEventResult = ref<DeviceEvent | null>(null)

const deviceOptions = computed(() =>
  devices.value.map((d) => ({ label: `${d.code}（${d.name} / ${DEVICE_CATEGORY_LABEL_MAP[deviceCategory(d.deviceTypeId)] ?? deviceCategory(d.deviceTypeId)}）`, value: d.id })),
)

function deviceCategory(deviceTypeId: string): DeviceType['category'] | '' {
  return deviceTypes.value.find((t) => t.id === deviceTypeId)?.category ?? ''
}

function selectedDevice() {
  return devices.value.find((d) => d.id === selectedDeviceId.value) ?? null
}

function fillPreset() {
  const device = selectedDevice()
  if (!device) return
  const category = deviceCategory(device.deviceTypeId)
  if (category === 'CALL_SERVICE') {
    eventType.value = 'CALL_TRIGGER'
    payloadText.value = JSON.stringify({ roomId: device.roomId ?? '(该设备未绑定房间，需先在设备台账中绑定房间)', reason: '需要热水' }, null, 2)
  } else if (category === 'UTILITY_METER') {
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    eventType.value = 'METER_READING'
    payloadText.value = JSON.stringify({ period, expenseType: 'ELECTRICITY', amount: 100000 }, null, 2)
  } else {
    eventType.value = 'RAW_REPORT'
    payloadText.value = JSON.stringify({ note: '该品类本轮只做事件留痕，不会写入业务表' }, null, 2)
  }
}

async function fetchEvents() {
  if (!selectedDeviceId.value) return
  loadingEvents.value = true
  try {
    events.value = await deviceGatewayApi.listEvents({ deviceId: selectedDeviceId.value })
  } finally {
    loadingEvents.value = false
  }
}

async function fetchShadow() {
  if (!selectedDeviceId.value) return
  shadow.value = await deviceGatewayApi.getShadow(selectedDeviceId.value)
}

watch(selectedDeviceId, async (id) => {
  lastEventResult.value = null
  if (!id) return
  fillPreset()
  await Promise.all([fetchEvents(), fetchShadow()])
})

async function handleReportEvent() {
  if (!selectedDeviceId.value) {
    message.error('请先选择设备')
    return
  }
  let payload: Record<string, unknown> = {}
  try {
    payload = payloadText.value.trim() ? JSON.parse(payloadText.value) : {}
  } catch {
    message.error('事件载荷不是合法的 JSON')
    return
  }
  submittingEvent.value = true
  try {
    const result = await deviceGatewayApi.reportEvent({ deviceId: selectedDeviceId.value, eventType: eventType.value || 'RAW_REPORT', payload })
    lastEventResult.value = result
    if (result.processingError) {
      message.warning(`事件已留痕，但转换为业务记录失败：${result.processingError}`)
    } else if (result.businessRefType) {
      message.success(`模拟上报成功，已生成 ${result.businessRefType} 记录`)
    } else {
      message.success('模拟上报成功（该品类本轮不做业务转换，仅留痕）')
    }
    await fetchEvents()
  } finally {
    submittingEvent.value = false
  }
}

async function handleIssueCommand() {
  if (!selectedDeviceId.value) {
    message.error('请先选择设备')
    return
  }
  let desiredState: Record<string, unknown> = {}
  try {
    desiredState = commandText.value.trim() ? JSON.parse(commandText.value) : {}
  } catch {
    message.error('指令内容不是合法的 JSON')
    return
  }
  submittingCommand.value = true
  try {
    shadow.value = await deviceGatewayApi.issueCommand(selectedDeviceId.value, desiredState)
    message.success('指令已下发到设备期望态(desired)，等待设备确认')
  } finally {
    submittingCommand.value = false
  }
}

async function handleConfirmCommand() {
  if (!selectedDeviceId.value) return
  confirmingCommand.value = true
  try {
    shadow.value = await deviceGatewayApi.confirmCommand(selectedDeviceId.value);
    message.success('模拟设备已确认指令，上报态(reported)已同步')
  } finally {
    confirmingCommand.value = false
  }
}

const eventColumns: DataTableColumns<DeviceEvent> = [
  { key: 'eventType', title: '事件类型' },
  { key: 'payload', title: '载荷', render: (row) => JSON.stringify(row.payload) },
  { key: 'occurredAt', title: '上报时间', render: (row) => new Date(row.occurredAt).toLocaleString() },
  { key: 'businessRefType', title: '生成的业务记录', render: (row) => (row.businessRefType ? `${row.businessRefType}#${row.businessRefId?.slice(-6)}` : '-') },
  { key: 'processingError', title: '转换失败原因', render: (row) => row.processingError ?? '-' },
]

onMounted(async () => {
  const [deviceList, deviceTypeList] = await Promise.all([deviceApi.list(), deviceTypeApi.list()])
  devices.value = deviceList
  deviceTypes.value = deviceTypeList
})
</script>

<template>
  <div>
    <n-alert type="info" :bordered="false" style="margin-bottom: 12px">
      本轮不采购真实硬件，用此面板模拟设备上报事件/下发指令，验证"设备网关→业务记录自动生成"链路。呼叫/客房服务事件会写入呼叫记录；能耗计量事件按门店+月份+费用类型覆盖登记水电费；其余品类仅留痕。
    </n-alert>

    <n-card title="选择设备" style="margin-bottom: 12px">
      <n-select v-model:value="selectedDeviceId" :options="deviceOptions" filterable clearable placeholder="选择要模拟的设备" />
    </n-card>

    <n-card title="模拟设备上报事件" style="margin-bottom: 12px">
      <n-form label-placement="left" label-width="90">
        <n-form-item label="事件类型"><n-input v-model:value="eventType" placeholder="如 CALL_TRIGGER / METER_READING" /></n-form-item>
        <n-form-item label="事件载荷(JSON)">
          <n-input v-model:value="payloadText" type="textarea" :autosize="{ minRows: 4, maxRows: 10 }" />
        </n-form-item>
      </n-form>
      <n-space>
        <n-button @click="fillPreset" :disabled="!selectedDeviceId">按品类填充示例</n-button>
        <n-button type="primary" :loading="submittingEvent" :disabled="!selectedDeviceId" @click="handleReportEvent">模拟上报</n-button>
      </n-space>
      <n-descriptions v-if="lastEventResult" bordered size="small" :column="2" style="margin-top: 12px">
        <n-descriptions-item label="生成的业务记录">{{ lastEventResult.businessRefType ? `${lastEventResult.businessRefType}#${lastEventResult.businessRefId}` : '无（仅留痕）' }}</n-descriptions-item>
        <n-descriptions-item label="转换失败原因">{{ lastEventResult.processingError ?? '无' }}</n-descriptions-item>
      </n-descriptions>
    </n-card>

    <n-card title="事件日志" style="margin-bottom: 12px">
      <n-data-table :columns="eventColumns" :data="events" :loading="loadingEvents" :row-key="(r: DeviceEvent) => r.id" :scroll-x="900" />
    </n-card>

    <n-card title="Device Shadow：期望态(desired) / 上报态(reported)">
      <template v-if="shadow">
        <n-descriptions bordered size="small" :column="2" style="margin-bottom: 12px">
          <n-descriptions-item label="期望态版本(desiredVersion)">{{ shadow.desiredVersion }}</n-descriptions-item>
          <n-descriptions-item label="上报态版本(reportedVersion)">{{ shadow.reportedVersion }}</n-descriptions-item>
          <n-descriptions-item label="期望态内容" :span="2">{{ shadow.desiredState ? JSON.stringify(shadow.desiredState) : '-' }}</n-descriptions-item>
          <n-descriptions-item label="上报态内容" :span="2">{{ shadow.reportedState ? JSON.stringify(shadow.reportedState) : '-' }}</n-descriptions-item>
        </n-descriptions>
        <n-form label-placement="left" label-width="90">
          <n-form-item label="下发指令(JSON)">
            <n-input v-model:value="commandText" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" />
          </n-form-item>
        </n-form>
        <n-space>
          <n-button type="primary" :loading="submittingCommand" @click="handleIssueCommand">下发指令</n-button>
          <n-button
            :loading="confirmingCommand"
            :disabled="shadow.desiredVersion === shadow.reportedVersion"
            @click="handleConfirmCommand"
          >
            模拟设备确认执行
          </n-button>
        </n-space>
      </template>
      <template v-else>
        <span style="color: var(--n-text-color-disabled, #999)">请先选择设备</span>
      </template>
    </n-card>
  </div>
</template>
