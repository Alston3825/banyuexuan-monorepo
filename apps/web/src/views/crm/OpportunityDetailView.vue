<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NCard, NSpace, NButton, NDescriptions, NDescriptionsItem, NModal, NForm, NFormItem, NInput } from 'naive-ui'
import { opportunityApi } from '../../api/modules/opportunity.api'
import { customerApi } from '../../api/modules/customer.api'
import type { SalesOpportunity } from '../../api/types/opportunity'
import { renderStatusBadge, OPPORTUNITY_STAGE_MAP } from '../../utils/status-map'
import { toMajorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'
import FollowUpTimeline from '../../components/crm/FollowUpTimeline.vue'

const route = useRoute()
const opportunityId = route.params.id as string

const opportunity = ref<SalesOpportunity | null>(null)
const customerName = ref('')
const advancing = ref(false)

async function fetchAll() {
  const opp = await opportunityApi.get(opportunityId)
  opportunity.value = opp
  const customer = await customerApi.get(opp.customerId)
  customerName.value = customer.name
}

async function handleAdvance(targetStage: 'QUOTED' | 'WON') {
  if (!opportunity.value) return
  advancing.value = true
  try {
    opportunity.value = await opportunityApi.advanceStage(opportunity.value.id, targetStage, opportunity.value.version)
    message.success('阶段已推进')
  } finally {
    advancing.value = false
  }
}

// ---------------- 标记流失 ----------------
const loseVisible = ref(false)
const loseReason = ref('')
const loseSubmitting = ref(false)

async function handleLose() {
  if (!opportunity.value || !loseReason.value.trim()) {
    message.error('请填写流失原因')
    return
  }
  loseSubmitting.value = true
  try {
    opportunity.value = await opportunityApi.lose(opportunity.value.id, loseReason.value, opportunity.value.version)
    message.success('已标记流失')
    loseVisible.value = false
  } finally {
    loseSubmitting.value = false
  }
}

onMounted(fetchAll)
</script>

<template>
  <div v-if="opportunity">
    <n-card :title="opportunity.opportunityNo" style="margin-bottom: 16px">
      <template #header-extra>
        <component :is="() => renderStatusBadge(opportunity!.stage, OPPORTUNITY_STAGE_MAP)" />
      </template>
      <n-descriptions :column="2" label-placement="left">
        <n-descriptions-item label="客户">
          <RouterLink :to="`/crm/customers/${opportunity.customerId}`">{{ customerName }}</RouterLink>
        </n-descriptions-item>
        <n-descriptions-item label="意向金额">{{ toMajorUnits(opportunity.amount) ?? '-' }} 元</n-descriptions-item>
        <n-descriptions-item label="备注">{{ opportunity.remark ?? '-' }}</n-descriptions-item>
        <n-descriptions-item v-if="opportunity.stage === 'LOST'" label="流失原因">{{ opportunity.lostReason }}</n-descriptions-item>
      </n-descriptions>

      <n-space style="margin-top: 16px">
        <n-button v-if="opportunity.stage === 'FOLLOWING'" type="primary" :loading="advancing" @click="handleAdvance('QUOTED')">报价</n-button>
        <n-button v-if="opportunity.stage === 'QUOTED'" type="primary" :loading="advancing" @click="handleAdvance('WON')">签约</n-button>
        <n-button v-if="['FOLLOWING', 'QUOTED'].includes(opportunity.stage)" type="error" quaternary @click="loseVisible = true">标记流失</n-button>
      </n-space>
    </n-card>

    <FollowUpTimeline business-type="OPPORTUNITY" :business-id="opportunityId" />

    <n-modal :mask-closable="false" :show="loseVisible" @update:show="(v) => (loseVisible = v)">
      <n-card title="标记流失" style="width: min(380px, 94vw)" :bordered="false" role="dialog" closable @close="loseVisible = false" aria-modal="true">
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
