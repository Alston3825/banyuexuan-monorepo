<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NCard, NGrid, NGridItem, NStatistic, NSpace, NDatePicker, NSelect, NButton, NDataTable, type DataTableColumns } from 'naive-ui'
import { customerServicePackageApi, serviceAppointmentApi } from '../../api/modules/service.api'
import { storeApi } from '../../api/modules/store.api'
import type { CustomerServicePackageReport, ServiceAppointmentReport } from '../../api/types/service'
import type { Store } from '../../api/types/store'

const appointmentReport = ref<ServiceAppointmentReport | null>(null)
const packageReport = ref<CustomerServicePackageReport | null>(null)
const stores = ref<Store[]>([])
const loading = ref(false)

const storeOptions = computed(() => stores.value.map((s) => ({ label: s.name, value: s.id })))
const storeId = ref<string | null>(null)
const dateRange = ref<[number, number] | null>(null)

async function fetchReport() {
  loading.value = true
  try {
    const params = {
      storeId: storeId.value ?? undefined,
      startDate: dateRange.value ? new Date(dateRange.value[0]).toISOString().slice(0, 10) : undefined,
      endDate: dateRange.value ? new Date(dateRange.value[1]).toISOString().slice(0, 10) : undefined,
    }
    const [appointments, packages] = await Promise.all([serviceAppointmentApi.report(params), customerServicePackageApi.report(params)])
    appointmentReport.value = appointments
    packageReport.value = packages
  } finally {
    loading.value = false
  }
}

const byProductColumns: DataTableColumns<{ productId: string; name: string; completedCount: number }> = [
  { key: 'name', title: '项目' },
  { key: 'completedCount', title: '完成数' },
]

const byTherapistColumns: DataTableColumns<{ therapistId: string; name: string; completedCount: number }> = [
  { key: 'name', title: '技师' },
  { key: 'completedCount', title: '完成数' },
]

const byPackageColumns: DataTableColumns<{ packageId: string; name: string; soldCount: number; amount: number }> = [
  { key: 'name', title: '服务包' },
  { key: 'soldCount', title: '售出份数' },
  { key: 'amount', title: '成交金额(分)' },
]

onMounted(async () => {
  stores.value = await storeApi.list()
  await fetchReport()
})
</script>

<template>
  <div>
    <n-space style="margin-bottom: 16px" :wrap="false">
      <n-select v-model:value="storeId" :options="storeOptions" clearable placeholder="全部门店" style="width: 180px" />
      <n-date-picker v-model:value="dateRange" type="daterange" clearable style="width: 280px" placeholder="预约按预约时间/服务包按购买时间过滤" />
      <n-button type="primary" :loading="loading" @click="fetchReport">查询</n-button>
    </n-space>

    <n-card title="预约执行情况" style="margin-bottom: 16px">
      <n-grid v-if="appointmentReport" :cols="5" :x-gap="12" style="margin-bottom: 16px">
        <n-grid-item><n-statistic label="预约总数" :value="appointmentReport.totalAppointments" /></n-grid-item>
        <n-grid-item><n-statistic label="已预约" :value="appointmentReport.bookedCount" /></n-grid-item>
        <n-grid-item><n-statistic label="已完成" :value="appointmentReport.completedCount" /></n-grid-item>
        <n-grid-item><n-statistic label="爽约" :value="appointmentReport.noShowCount" /></n-grid-item>
        <n-grid-item><n-statistic label="平均评分" :value="appointmentReport.avgRating ?? '-'" /></n-grid-item>
      </n-grid>
      <n-grid v-if="appointmentReport" :cols="2" :x-gap="16">
        <n-grid-item>
          <n-card title="按项目完成数" size="small">
            <n-data-table :columns="byProductColumns" :data="appointmentReport.byProduct" :row-key="(r) => r.productId" />
          </n-card>
        </n-grid-item>
        <n-grid-item>
          <n-card title="技师业绩（完成数）" size="small">
            <n-data-table :columns="byTherapistColumns" :data="appointmentReport.byTherapist" :row-key="(r) => r.therapistId" />
          </n-card>
        </n-grid-item>
      </n-grid>
    </n-card>

    <n-card title="服务包销售汇总">
      <n-grid v-if="packageReport" :cols="5" :x-gap="12" style="margin-bottom: 16px">
        <n-grid-item><n-statistic label="售出份数" :value="packageReport.totalSold" /></n-grid-item>
        <n-grid-item><n-statistic label="成交总金额(分)" :value="packageReport.totalAmount" /></n-grid-item>
        <n-grid-item><n-statistic label="可用" :value="packageReport.activeCount" /></n-grid-item>
        <n-grid-item><n-statistic label="已耗尽" :value="packageReport.exhaustedCount" /></n-grid-item>
        <n-grid-item><n-statistic label="剩余次数总计" :value="packageReport.remainingSessionsTotal" /></n-grid-item>
      </n-grid>
      <n-data-table v-if="packageReport" :columns="byPackageColumns" :data="packageReport.byPackage" :row-key="(r) => r.packageId" />
    </n-card>
  </div>
</template>
