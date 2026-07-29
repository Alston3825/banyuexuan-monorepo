<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NSpace, NButton, NDescriptions, NDescriptionsItem, NModal, NForm, NFormItem, NInput, NSelect } from 'naive-ui'
import { leadApi } from '../../api/modules/lead.api'
import { accountApi } from '../../api/modules/account.api'
import { storeApi } from '../../api/modules/store.api'
import type { Lead } from '../../api/types/lead'
import { renderStatusBadge, LEAD_STATUS_MAP, CUSTOMER_SOURCE_LABEL_MAP } from '../../utils/status-map'
import { message } from '../../utils/discrete-api'
import FollowUpTimeline from '../../components/crm/FollowUpTimeline.vue'
import AiCustomerServicePanel from '../../components/ai/AiCustomerServicePanel.vue'

const route = useRoute()
const router = useRouter()
const leadId = route.params.id as string

const lead = ref<Lead | null>(null)
const accountOptions = ref<{ label: string; value: string }[]>([])
const fallbackStoreId = ref<string>('')

async function fetchLead() {
  lead.value = await leadApi.get(leadId)
}

async function fetchFallbackStore() {
  const stores = await storeApi.list()
  fallbackStoreId.value = stores[0]?.id ?? ''
}

async function fetchAccountOptions() {
  const accounts = await accountApi.list()
  accountOptions.value = accounts.map((a) => ({ label: `${a.realName}（${a.username}）`, value: a.id }))
}

// ---------------- 分配/转派 ----------------
const assignVisible = ref(false)
const assignAccountId = ref<string | undefined>()
const assignSubmitting = ref(false)

function openAssign() {
  assignAccountId.value = lead.value?.assignedToId ?? undefined
  assignVisible.value = true
}

async function handleAssign() {
  if (!lead.value || !assignAccountId.value) {
    message.error('请选择负责人')
    return
  }
  assignSubmitting.value = true
  try {
    lead.value = await leadApi.assign(lead.value.id, assignAccountId.value, lead.value.version)
    message.success('已分配')
    assignVisible.value = false
  } finally {
    assignSubmitting.value = false
  }
}

// ---------------- 标记流失 ----------------
const loseVisible = ref(false)
const loseReason = ref('')
const loseSubmitting = ref(false)

async function handleLose() {
  if (!lead.value || !loseReason.value.trim()) {
    message.error('请填写流失原因')
    return
  }
  loseSubmitting.value = true
  try {
    lead.value = await leadApi.lose(lead.value.id, loseReason.value, lead.value.version)
    message.success('已标记流失')
    loseVisible.value = false
  } finally {
    loseSubmitting.value = false
  }
}

// ---------------- 转化建档 ----------------
const convertSubmitting = ref(false)

async function handleConvert() {
  if (!lead.value) return
  convertSubmitting.value = true
  try {
    const { customer } = await leadApi.convert(lead.value.id, lead.value.version)
    message.success('已转化建档')
    router.push(`/crm/customers/${customer.id}`)
  } finally {
    convertSubmitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchLead(), fetchAccountOptions(), fetchFallbackStore()])
})
</script>

<template>
  <div v-if="lead">
    <n-card :title="lead.name" style="margin-bottom: 16px">
      <template #header-extra>
        <component :is="() => renderStatusBadge(lead!.status, LEAD_STATUS_MAP)" />
      </template>
      <n-descriptions :column="2" label-placement="left">
        <n-descriptions-item label="线索编号">{{ lead.leadNo }}</n-descriptions-item>
        <n-descriptions-item label="手机号">{{ lead.phone }}</n-descriptions-item>
        <n-descriptions-item label="来源">{{ CUSTOMER_SOURCE_LABEL_MAP[lead.source] ?? lead.source }}</n-descriptions-item>
        <n-descriptions-item label="备注">{{ lead.remark ?? '-' }}</n-descriptions-item>
        <n-descriptions-item v-if="lead.status === 'LOST'" label="流失原因">{{ lead.lostReason }}</n-descriptions-item>
      </n-descriptions>

      <n-space style="margin-top: 16px">
        <template v-if="['NEW', 'ASSIGNED', 'FOLLOWING'].includes(lead.status)">
          <n-button @click="openAssign">{{ lead.status === 'NEW' ? '分配' : '转派' }}</n-button>
          <n-button type="error" quaternary @click="loseVisible = true">标记流失</n-button>
        </template>
        <n-button
          v-if="['ASSIGNED', 'FOLLOWING'].includes(lead.status)"
          type="primary"
          :loading="convertSubmitting"
          @click="handleConvert"
        >
          转化建档
        </n-button>
        <n-button v-if="lead.status === 'CONVERTED' && lead.customerId" @click="router.push(`/crm/customers/${lead.customerId}`)">
          查看客户
        </n-button>
      </n-space>
    </n-card>

    <AiCustomerServicePanel business-type="LEAD" :business-id="leadId" :store-id="lead.storeId ?? fallbackStoreId" />

    <FollowUpTimeline business-type="LEAD" :business-id="leadId" />

    <n-modal :show="assignVisible" @update:show="(v) => (assignVisible = v)">
      <n-card title="分配线索" style="width: 380px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="负责人"><n-select v-model:value="assignAccountId" :options="accountOptions" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="assignVisible = false">取消</n-button>
            <n-button type="primary" :loading="assignSubmitting" @click="handleAssign">确认</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="loseVisible" @update:show="(v) => (loseVisible = v)">
      <n-card title="标记流失" style="width: 380px" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="80">
          <n-form-item label="流失原因"><n-input v-model:value="loseReason" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="loseVisible = false">取消</n-button>
            <n-button type="error" :loading="loseSubmitting" @click="handleLose">确认流失</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
