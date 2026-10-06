<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NStatistic, NEmpty, type DataTableColumns } from 'naive-ui'
import { customerAccountApi } from '../../api/modules/finance.api'
import { customerApi } from '../../api/modules/customer.api'
import type { CustomerAccount, CustomerAccountTransaction } from '../../api/types/finance'
import type { Customer } from '../../api/types/customer'
import { renderStatusBadge, CUSTOMER_ACCOUNT_TRANSACTION_TYPE_MAP } from '../../utils/status-map'
import { toMajorUnits, toMinorUnits } from '../../utils/money'
import { message } from '../../utils/discrete-api'

const customers = ref<Customer[]>([])
const customerId = ref<string | null>(null)
const account = ref<CustomerAccount | null>(null)
const transactions = ref<CustomerAccountTransaction[]>([])
const loading = ref(false)

const customerOptions = computed(() => customers.value.map((c) => ({ label: `${c.name}（${c.phone}）`, value: c.id })))

async function fetchAccount() {
  if (!customerId.value) {
    account.value = null
    transactions.value = []
    return
  }
  loading.value = true
  try {
    const [acc, txs] = await Promise.all([customerAccountApi.getByCustomer(customerId.value), customerAccountApi.listTransactions(customerId.value)])
    account.value = acc
    transactions.value = txs
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  customers.value = await customerApi.list()
})
watch(customerId, fetchAccount)

// ---------------- 充值 ----------------
const rechargeVisible = ref(false)
const rechargeSubmitting = ref(false)
const rechargeModel = ref({ principalYuan: null as number | null, giftYuan: null as number | null, remark: '' })

function openRecharge() {
  rechargeModel.value = { principalYuan: null, giftYuan: null, remark: '' }
  rechargeVisible.value = true
}
async function submitRecharge() {
  if (!customerId.value) return
  rechargeSubmitting.value = true
  try {
    account.value = await customerAccountApi.recharge({
      customerId: customerId.value,
      principalAmount: toMinorUnits(rechargeModel.value.principalYuan),
      giftAmount: toMinorUnits(rechargeModel.value.giftYuan),
      remark: rechargeModel.value.remark || undefined,
    })
    message.success('充值成功')
    rechargeVisible.value = false
    await fetchAccount()
  } finally {
    rechargeSubmitting.value = false
  }
}

// ---------------- 消费 ----------------
const consumeVisible = ref(false)
const consumeSubmitting = ref(false)
const consumeModel = ref({ amountYuan: null as number | null, remark: '' })

function openConsume() {
  consumeModel.value = { amountYuan: null, remark: '' }
  consumeVisible.value = true
}
async function submitConsume() {
  if (!customerId.value || !consumeModel.value.amountYuan) {
    message.error('请填写消费金额')
    return
  }
  consumeSubmitting.value = true
  try {
    account.value = await customerAccountApi.consume({
      customerId: customerId.value,
      amount: toMinorUnits(consumeModel.value.amountYuan)!,
      sourceType: 'MANUAL',
      remark: consumeModel.value.remark || undefined,
    })
    message.success('消费登记成功')
    consumeVisible.value = false
    await fetchAccount()
  } finally {
    consumeSubmitting.value = false
  }
}

// ---------------- 退款 ----------------
const refundVisible = ref(false)
const refundSubmitting = ref(false)
const refundModel = ref({ principalYuan: null as number | null, giftYuan: null as number | null, remark: '' })

function openRefund() {
  refundModel.value = { principalYuan: null, giftYuan: null, remark: '' }
  refundVisible.value = true
}
async function submitRefund() {
  if (!customerId.value) return
  refundSubmitting.value = true
  try {
    account.value = await customerAccountApi.refund({
      customerId: customerId.value,
      principalAmount: toMinorUnits(refundModel.value.principalYuan),
      giftAmount: toMinorUnits(refundModel.value.giftYuan),
      remark: refundModel.value.remark || undefined,
    })
    message.success('退款登记成功')
    refundVisible.value = false
    await fetchAccount()
  } finally {
    refundSubmitting.value = false
  }
}

// ---------------- 人工调整 ----------------
const adjustVisible = ref(false)
const adjustSubmitting = ref(false)
const adjustModel = ref({ principalDeltaYuan: null as number | null, giftDeltaYuan: null as number | null, remark: '' })

function openAdjust() {
  adjustModel.value = { principalDeltaYuan: null, giftDeltaYuan: null, remark: '' }
  adjustVisible.value = true
}
async function submitAdjust() {
  if (!customerId.value || !adjustModel.value.remark) {
    message.error('请填写调整原因')
    return
  }
  adjustSubmitting.value = true
  try {
    account.value = await customerAccountApi.adjust({
      customerId: customerId.value,
      principalDelta: toMinorUnits(adjustModel.value.principalDeltaYuan) ?? 0,
      giftDelta: toMinorUnits(adjustModel.value.giftDeltaYuan) ?? 0,
      remark: adjustModel.value.remark,
    })
    message.success('调整成功')
    adjustVisible.value = false
    await fetchAccount()
  } finally {
    adjustSubmitting.value = false
  }
}

const columns: DataTableColumns<CustomerAccountTransaction> = [
  { key: 'createdAt', title: '时间', render: (row) => new Date(row.createdAt).toLocaleString() },
  { key: 'type', title: '类型', render: (row) => renderStatusBadge(row.type, CUSTOMER_ACCOUNT_TRANSACTION_TYPE_MAP) },
  { key: 'principalDelta', title: '本金变动(元)', render: (row) => (toMajorUnits(row.principalDelta) ?? 0).toFixed(2) },
  { key: 'giftDelta', title: '赠送变动(元)', render: (row) => (toMajorUnits(row.giftDelta) ?? 0).toFixed(2) },
  { key: 'principalAfter', title: '变动后本金(元)', render: (row) => (toMajorUnits(row.principalAfter) ?? 0).toFixed(2) },
  { key: 'giftAfter', title: '变动后赠送(元)', render: (row) => (toMajorUnits(row.giftAfter) ?? 0).toFixed(2) },
  { key: 'remark', title: '备注', render: (row) => row.remark ?? '-' },
]
</script>

<template>
  <div>
    <n-space align="center" style="margin-bottom: 16px">
      <n-select v-model:value="customerId" :options="customerOptions" filterable placeholder="选择客户查看会员账户" style="width: min(320px, 94vw)" />
    </n-space>

    <n-empty v-if="!customerId" description="请先选择一位客户" />

    <template v-else>
      <n-space style="margin-bottom: 16px" :size="32">
        <n-statistic label="本金余额(元)" :value="(toMajorUnits(account?.principalBalance ?? 0) ?? 0).toFixed(2)" />
        <n-statistic label="赠送余额(元)" :value="(toMajorUnits(account?.giftBalance ?? 0) ?? 0).toFixed(2)" />
      </n-space>
      <n-space style="margin-bottom: 16px">
        <n-button type="primary" @click="openRecharge">充值</n-button>
        <n-button @click="openConsume">登记消费</n-button>
        <n-button @click="openRefund">退款</n-button>
        <n-button @click="openAdjust">人工调整</n-button>
      </n-space>
      <n-data-table :columns="columns" :data="transactions" :loading="loading" :row-key="(r: CustomerAccountTransaction) => r.id" :scroll-x="1000" />
    </template>

    <n-modal :show="rechargeVisible" @update:show="(v) => (rechargeVisible = v)">
      <n-card title="充值" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="本金(元)"><n-input-number v-model:value="rechargeModel.principalYuan" :min="0" style="width: 100%" /></n-form-item>
          <n-form-item label="赠送(元)"><n-input-number v-model:value="rechargeModel.giftYuan" :min="0" style="width: 100%" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="rechargeModel.remark" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="rechargeVisible = false">取消</n-button>
            <n-button type="primary" :loading="rechargeSubmitting" @click="submitRecharge">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="consumeVisible" @update:show="(v) => (consumeVisible = v)">
      <n-card title="登记消费" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="100">
          <n-form-item label="消费金额(元)"><n-input-number v-model:value="consumeModel.amountYuan" :min="0.01" style="width: 100%" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="consumeModel.remark" type="textarea" placeholder="消费用途说明" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="consumeVisible = false">取消</n-button>
            <n-button type="primary" :loading="consumeSubmitting" @click="submitConsume">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="refundVisible" @update:show="(v) => (refundVisible = v)">
      <n-card title="退款" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="120">
          <n-form-item label="退回本金(元)"><n-input-number v-model:value="refundModel.principalYuan" :min="0" style="width: 100%" /></n-form-item>
          <n-form-item label="退回赠送(元)"><n-input-number v-model:value="refundModel.giftYuan" :min="0" style="width: 100%" /></n-form-item>
          <n-form-item label="备注"><n-input v-model:value="refundModel.remark" type="textarea" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="refundVisible = false">取消</n-button>
            <n-button type="primary" :loading="refundSubmitting" @click="submitRefund">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <n-modal :show="adjustVisible" @update:show="(v) => (adjustVisible = v)">
      <n-card title="人工调整（纠错）" style="width: min(420px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
        <n-form label-placement="left" label-width="120">
          <n-form-item label="本金调整(元)"><n-input-number v-model:value="adjustModel.principalDeltaYuan" style="width: 100%" placeholder="可正可负" /></n-form-item>
          <n-form-item label="赠送调整(元)"><n-input-number v-model:value="adjustModel.giftDeltaYuan" style="width: 100%" placeholder="可正可负" /></n-form-item>
          <n-form-item label="调整原因" path="remark" :rule="{ required: true, message: '请填写调整原因' }">
            <n-input v-model:value="adjustModel.remark" type="textarea" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="adjustVisible = false">取消</n-button>
            <n-button type="primary" :loading="adjustSubmitting" @click="submitAdjust">提交</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
