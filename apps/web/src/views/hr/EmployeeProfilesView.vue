<script setup lang="ts">
/**
 * 员工档案：姓名/部门/职务/手机来自“账号”（在账号管理里改），这里维护 HR 档案——
 * 入职/合同/社保/身份证/工资卡/紧急联系人等（对应公司《员工信息表》）。工龄按入职日期自动算。
 */
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  NButton, NSpace, NDataTable, NModal, NCard, NForm, NFormItem, NInput, NSelect, NDatePicker, NSwitch, NTag, NDescriptions, NDescriptionsItem, NEmpty, type DataTableColumns,
} from 'naive-ui'
import { employeeProfileApi } from '../../api/modules/hr.api'
import { accountApi } from '../../api/modules/account.api'
import { departmentApi } from '../../api/modules/department.api'
import type { EmployeeProfile, EmployeeProfileExpiryAlert, EmployeeContractType, SocialInsuranceStatus } from '../../api/types/hr'
import type { Account } from '../../api/types/account'
import {
  renderStatusBadge, EMPLOYEE_PROFILE_STATUS_MAP, EMPLOYMENT_TYPE_LABEL_MAP, CONTRACT_TYPE_LABEL_MAP, SOCIAL_INSURANCE_LABEL_MAP, EMPLOYEE_GENDER_LABEL_MAP,
} from '../../utils/status-map'
import { message } from '../../utils/discrete-api'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const canChangeNo = computed(() => auth.hasAccess('hr.employee-profile.change-no'))
const canArchive = computed(() => auth.hasAccess('hr.employee-profile.archive'))
const canRestore = computed(() => auth.hasAccess('hr.employee-profile.restore'))

const ALERT_TYPE_LABEL_MAP: Record<string, string> = { HEALTH_CERT: '健康证', CONTRACT: '合同', PROBATION: '转正' }
const toOptions = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ label, value }))
const contractOptions = toOptions(CONTRACT_TYPE_LABEL_MAP)
const insuranceOptions = toOptions(SOCIAL_INSURANCE_LABEL_MAP)
const employmentOptions = toOptions(EMPLOYMENT_TYPE_LABEL_MAP)
// 离职不在这里选：要点“离职归档”（会停用账号并释放工号）
const statusOptions = [
  { label: '在职', value: 'ACTIVE' },
  { label: '休假中', value: 'ON_LEAVE' },
]

const rows = ref<EmployeeProfile[]>([])
const alertRows = ref<EmployeeProfileExpiryAlert[]>([])
const accounts = ref<Account[]>([])
const departments = ref<{ label: string; value: string }[]>([])
const loading = ref(false)
const alertsOnly = ref(false)
const showArchived = ref(false)
const keyword = ref('')
const filterDept = ref<string | null>(null)
const filterStatus = ref<string | null>(null)

// 手机上用卡片列表，电脑上用表格
const mql = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mql.matches)
const onMql = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mql.addEventListener('change', onMql)
onBeforeUnmount(() => mql.removeEventListener('change', onMql))

const accountsWithoutProfile = computed(() => {
  const profiledIds = new Set(rows.value.map((p) => p.accountId))
  return accounts.value.filter((a) => !profiledIds.has(a.id))
})
const accountOptions = computed(() => accountsWithoutProfile.value.map((a) => ({ label: `${a.realName}（${a.username}）`, value: a.id })))

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '-')

async function fetchList() {
  loading.value = true
  try {
    if (alertsOnly.value) {
      alertRows.value = await employeeProfileApi.expiryAlerts(30)
    } else {
      rows.value = await employeeProfileApi.list({ keyword: keyword.value.trim() || undefined, departmentId: filterDept.value ?? undefined, status: filterStatus.value ?? undefined, archived: showArchived.value ? 'only' : undefined })
    }
  } finally {
    loading.value = false
  }
}

// ---------------- 新建 / 编辑（同一张表单） ----------------
const formVisible = ref(false)
const submitting = ref(false)
const editingRow = ref<EmployeeProfile | null>(null)
const blank = () => ({
  accountId: null as string | null,
  employeeNo: '',
  hireDate: Date.now() as number | null,
  employmentType: 'EMPLOYEE' as 'EMPLOYEE' | 'NON_EMPLOYEE',
  contractType: null as EmployeeContractType | null,
  contractExpiresAt: null as number | null,
  probationEndsAt: null as number | null,
  socialInsurance: null as SocialInsuranceStatus | null,
  healthCertExpiresAt: null as number | null,
  status: 'ACTIVE' as EmployeeProfile['status'],
  terminationDate: null as number | null,
  terminationReason: '',
  idCardNo: '',
  bankAccountNo: '',
  bankName: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
  address: '',
  watchId: '',
  dutyStatus: 'OFF_DUTY' as 'ON_DUTY' | 'OFF_DUTY' | 'RESTING',
  floorsText: '',
  remark: '',
})
const model = ref(blank())
const ts = (iso: string | null) => (iso ? new Date(iso).getTime() : null)
const iso = (t: number | null) => (t ? new Date(t).toISOString() : undefined)

function openCreate() {
  editingRow.value = null
  model.value = blank()
  formVisible.value = true
  // 建议工号由系统按在职名册顺延给出（已归档释放的小号不自动回收，需要时手动填）
  employeeProfileApi.nextNo().then((no) => !editingRow.value && !model.value.employeeNo && (model.value.employeeNo = no)).catch(() => {})
}

function openEdit(row: EmployeeProfile) {
  editingRow.value = row
  model.value = {
    accountId: row.accountId,
    employeeNo: row.employeeNo,
    hireDate: ts(row.hireDate),
    employmentType: row.employmentType,
    contractType: row.contractType,
    contractExpiresAt: ts(row.contractExpiresAt),
    probationEndsAt: ts(row.probationEndsAt),
    socialInsurance: row.socialInsurance,
    healthCertExpiresAt: ts(row.healthCertExpiresAt),
    status: row.status,
    terminationDate: ts(row.terminationDate),
    terminationReason: row.terminationReason ?? '',
    idCardNo: row.idCardNo ?? '',
    bankAccountNo: row.bankAccountNo ?? '',
    bankName: row.bankName ?? '',
    emergencyContactName: row.emergencyContactName ?? '',
    emergencyContactPhone: row.emergencyContactPhone ?? '',
    emergencyContactRelation: row.emergencyContactRelation ?? '',
    address: row.address ?? '',
    watchId: row.watchId ?? '',
    dutyStatus: row.dutyStatus ?? 'OFF_DUTY',
    floorsText: (row.responsibleFloors ?? []).join('、'),
    remark: row.remark ?? '',
  }
  detailRow.value = null
  formVisible.value = true
}

async function handleSubmit() {
  const m = model.value
  if (!editingRow.value && !m.accountId) return void message.error('请选择账号')
  if (!m.employeeNo.trim() || !m.hireDate) return void message.error('请填写工号和入职日期')
  submitting.value = true
  try {
    // 文字类：新建时空的不传；编辑时传空字符串 = 清空
    const text = (v: string) => (editingRow.value ? v.trim() : v.trim() || undefined)
    const common = {
      employeeNo: m.employeeNo.trim(),
      hireDate: iso(m.hireDate)!,
      employmentType: m.employmentType,
      contractType: m.contractType ?? undefined,
      socialInsurance: m.socialInsurance ?? undefined,
      contractExpiresAt: iso(m.contractExpiresAt),
      probationEndsAt: iso(m.probationEndsAt),
      healthCertExpiresAt: iso(m.healthCertExpiresAt),
      idCardNo: text(m.idCardNo),
      bankAccountNo: text(m.bankAccountNo),
      bankName: text(m.bankName),
      emergencyContactName: text(m.emergencyContactName),
      emergencyContactPhone: text(m.emergencyContactPhone),
      emergencyContactRelation: text(m.emergencyContactRelation),
      address: text(m.address),
      watchId: m.watchId.trim(),
      dutyStatus: m.dutyStatus,
      responsibleFloors: m.floorsText.split(/[,，、\s]+/).map((x) => x.trim()).filter(Boolean),
      remark: text(m.remark),
    }
    if (editingRow.value) {
      await employeeProfileApi.update(editingRow.value.id, {
        ...common,
        // 没有“修改工号”权限的人不传工号（后端也会拒绝）
        employeeNo: canChangeNo.value ? common.employeeNo : undefined,
        status: m.status === 'TERMINATED' ? undefined : m.status,
        version: editingRow.value.version,
      })
      message.success('员工档案已更新')
    } else {
      // 手表/当班/负责楼层建档后再在“编辑”里设置
      const { watchId: _w, dutyStatus: _d, responsibleFloors: _f, ...createFields } = common
      await employeeProfileApi.create({ accountId: m.accountId!, ...createFields })
      message.success('员工档案已建立')
    }
    formVisible.value = false
    await fetchList()
  } finally {
    submitting.value = false
  }
}

// ---------------- 离职归档 / 恢复在职 ----------------
const archiveRow = ref<EmployeeProfile | null>(null)
const archiveModel = ref({ terminationDate: Date.now() as number | null, reason: '' })
const archiving = ref(false)
function openArchive(row: EmployeeProfile) {
  archiveRow.value = row
  archiveModel.value = { terminationDate: Date.now(), reason: '' }
  detailRow.value = null
}
async function doArchive() {
  if (!archiveRow.value) return
  archiving.value = true
  try {
    await employeeProfileApi.archive(archiveRow.value.id, { terminationDate: iso(archiveModel.value.terminationDate), reason: archiveModel.value.reason.trim() || undefined, version: archiveRow.value.version })
    message.success('已离职归档，账号已停用，工号已释放')
    archiveRow.value = null
    await fetchList()
  } finally {
    archiving.value = false
  }
}

const restoreRow = ref<EmployeeProfile | null>(null)
const restoreNo = ref('')
const restoring = ref(false)
function openRestore(row: EmployeeProfile) {
  restoreRow.value = row
  restoreNo.value = row.employeeNo
  detailRow.value = null
}
async function doRestore() {
  if (!restoreRow.value) return
  restoring.value = true
  try {
    await employeeProfileApi.restore(restoreRow.value.id, { employeeNo: restoreNo.value.trim() || undefined, version: restoreRow.value.version })
    message.success('已恢复在职，账号已重新启用')
    restoreRow.value = null
    await fetchList()
  } finally {
    restoring.value = false
  }
}

// ---------------- 详情 ----------------
const detailRow = ref<EmployeeProfile | null>(null)

const columns: DataTableColumns<EmployeeProfile> = [
  { key: 'realName', title: '姓名', width: 90, fixed: 'left', render: (row) => h('a', { style: 'cursor:pointer;color:#2080f0', onClick: () => (detailRow.value = row) }, row.account.realName) },
  { key: 'employeeNo', title: '工号', width: 70 },
  { key: 'departmentName', title: '部门', width: 90, render: (row) => row.departmentName ?? '-' },
  { key: 'positionName', title: '职务', width: 110, render: (row) => row.positionName ?? '-' },
  { key: 'hireDate', title: '入职日期', width: 110, render: (row) => day(row.hireDate) },
  { key: 'tenureYears', title: '工龄（年）', width: 90 },
  { key: 'contractType', title: '合同类型', width: 130, render: (row) => (row.contractType ? CONTRACT_TYPE_LABEL_MAP[row.contractType] : '-') },
  { key: 'socialInsurance', title: '社保', width: 70, render: (row) => (row.socialInsurance ? SOCIAL_INSURANCE_LABEL_MAP[row.socialInsurance] : '-') },
  { key: 'phone', title: '联系电话', width: 120, render: (row) => row.phone ?? '-' },
  { key: 'idCardNo', title: '身份证号', width: 170, render: (row) => row.idCardNo ?? '-' },
  { key: 'bank', title: '工资卡 / 开户行', width: 260, render: (row) => (row.bankAccountNo ? `${row.bankAccountNo}（${row.bankName ?? '-'}）` : '-') },
  { key: 'status', title: '状态', width: 80, render: (row) => renderStatusBadge(row.status, EMPLOYEE_PROFILE_STATUS_MAP) },
  { key: 'remark', title: '备注', width: 160, ellipsis: { tooltip: true }, render: (row) => row.remark ?? '-' },
  {
    key: 'actions',
    title: '操作',
    width: 200,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 4 }, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => (detailRow.value = row) }, { default: () => '详情' }),
          ...(row.archivedAt
            ? canRestore.value ? [h(NButton, { size: 'small', type: 'primary', secondary: true, onClick: () => openRestore(row) }, { default: () => '恢复在职' })] : []
            : [
                h(NButton, { size: 'small', type: 'primary', secondary: true, onClick: () => openEdit(row) }, { default: () => '编辑' }),
                ...(canArchive.value ? [h(NButton, { size: 'small', type: 'error', quaternary: true, onClick: () => openArchive(row) }, { default: () => '离职归档' })] : []),
              ]),
        ],
      }),
  },
]

const alertColumns: DataTableColumns<EmployeeProfileExpiryAlert> = [
  { key: 'realName', title: '姓名', render: (row) => row.account.realName },
  { key: 'employeeNo', title: '工号' },
  {
    key: 'alerts',
    title: '到期提醒',
    render: (row) =>
      h(
        NSpace,
        { size: 4 },
        {
          default: () =>
            row.alerts.map((a) =>
              h(NTag, { key: a.type, size: 'small', type: a.isExpired ? 'error' : 'warning' }, { default: () => `${ALERT_TYPE_LABEL_MAP[a.type]}：${new Date(a.expiresAt).toLocaleDateString()}${a.isExpired ? '(已过期)' : ''}` }),
            ),
        },
      ),
  },
]

onMounted(async () => {
  const [acc, deps] = await Promise.all([accountApi.list(), departmentApi.list()])
  accounts.value = acc
  departments.value = deps.map((d) => ({ label: d.name, value: d.id }))
  await fetchList()
})
watch([alertsOnly, showArchived, filterDept, filterStatus], fetchList)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(keyword, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(fetchList, 300)
})
</script>

<template>
  <div>
    <n-space style="margin-bottom: 12px" align="center">
      <n-input v-model:value="keyword" clearable placeholder="搜索姓名 / 工号" style="width: min(200px, 60vw)" :disabled="alertsOnly" />
      <n-select v-model:value="filterDept" :options="departments" clearable placeholder="部门" style="width: 130px" :disabled="alertsOnly" />
      <n-select v-model:value="filterStatus" :options="statusOptions" clearable placeholder="状态" style="width: 110px" :disabled="alertsOnly || showArchived" />
      <n-space align="center" :size="6">
        <n-switch v-model:value="showArchived" :disabled="alertsOnly" />
        <span>看已离职归档的</span>
      </n-space>
      <n-space align="center" :size="6">
        <n-switch v-model:value="alertsOnly" />
        <span>只看到期提醒（30天内）</span>
      </n-space>
      <n-button v-if="!showArchived" type="primary" @click="openCreate">建立员工档案</n-button>
    </n-space>

    <template v-if="!alertsOnly">
      <template v-if="isMobile">
        <n-empty v-if="!loading && rows.length === 0" description="没有符合条件的员工" />
        <div v-for="r in rows" :key="r.id" class="ep-card" @click="detailRow = r">
          <div class="ep-top">
            <b>{{ r.account.realName }}</b>
            <span class="ep-sub">{{ r.departmentName ?? '-' }} · {{ r.positionName ?? '-' }}</span>
            <component :is="() => renderStatusBadge(r.status, EMPLOYEE_PROFILE_STATUS_MAP)" />
          </div>
          <div class="ep-line">工号 {{ r.employeeNo }} · 入职 {{ day(r.hireDate) }} · 工龄 {{ r.tenureYears }} 年</div>
          <div class="ep-line">{{ r.contractType ? CONTRACT_TYPE_LABEL_MAP[r.contractType] : '合同类型未填' }} · 社保：{{ r.socialInsurance ? SOCIAL_INSURANCE_LABEL_MAP[r.socialInsurance] : '-' }}</div>
          <div class="ep-line">电话 {{ r.phone ?? '-' }}</div>
        </div>
      </template>
      <n-data-table v-else :columns="columns" :data="rows" :loading="loading" :row-key="(r: EmployeeProfile) => r.id" :scroll-x="1700" />
    </template>
    <n-data-table v-else :columns="alertColumns" :data="alertRows" :loading="loading" :row-key="(r: EmployeeProfileExpiryAlert) => r.id" :scroll-x="700" />

    <!-- 详情 -->
    <n-modal :show="!!detailRow" @update:show="(v) => !v && (detailRow = null)">
      <n-card v-if="detailRow" :title="`${detailRow.account.realName} 的员工档案`" style="width: min(760px, 96vw); max-height: 92vh; overflow: auto" :bordered="false" role="dialog" closable @close="detailRow = null" aria-modal="true">
        <template #header-extra>
          <n-space :size="6">
            <template v-if="detailRow.archivedAt">
              <n-button v-if="canRestore" size="small" type="primary" @click="openRestore(detailRow)">恢复在职</n-button>
            </template>
            <template v-else>
              <n-button size="small" type="primary" @click="openEdit(detailRow)">编辑</n-button>
              <n-button v-if="canArchive" size="small" type="error" quaternary @click="openArchive(detailRow)">离职归档</n-button>
            </template>
          </n-space>
        </template>
        <div class="ep-sec">基本信息</div>
        <n-descriptions :column="isMobile ? 1 : 2" label-placement="left" size="small" bordered>
          <n-descriptions-item label="姓名">{{ detailRow.account.realName }}</n-descriptions-item>
          <n-descriptions-item label="工号">{{ detailRow.employeeNo }}</n-descriptions-item>
          <n-descriptions-item label="性别">{{ detailRow.gender ? EMPLOYEE_GENDER_LABEL_MAP[detailRow.gender] : '-' }}</n-descriptions-item>
          <n-descriptions-item label="出生日期">{{ day(detailRow.birthDate) }}</n-descriptions-item>
          <n-descriptions-item label="身份证号">{{ detailRow.idCardNo ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="联系电话">{{ detailRow.phone ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="现住址" :span="isMobile ? 1 : 2">{{ detailRow.address ?? '-' }}</n-descriptions-item>
        </n-descriptions>
        <div class="ep-sec">任职信息</div>
        <n-descriptions :column="isMobile ? 1 : 2" label-placement="left" size="small" bordered>
          <n-descriptions-item label="门店">{{ detailRow.storeName ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="部门">{{ detailRow.departmentName ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="职务">{{ detailRow.positionName ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="用工性质">{{ EMPLOYMENT_TYPE_LABEL_MAP[detailRow.employmentType] }}</n-descriptions-item>
          <n-descriptions-item label="入职日期">{{ day(detailRow.hireDate) }}</n-descriptions-item>
          <n-descriptions-item label="工龄">{{ detailRow.tenureYears }} 年</n-descriptions-item>
          <n-descriptions-item label="转正日期">{{ day(detailRow.probationEndsAt) }}</n-descriptions-item>
          <n-descriptions-item label="状态"><component :is="() => renderStatusBadge(detailRow!.status, EMPLOYEE_PROFILE_STATUS_MAP)" /></n-descriptions-item>
          <template v-if="detailRow.status === 'TERMINATED'">
            <n-descriptions-item label="离职日期">{{ day(detailRow.terminationDate) }}</n-descriptions-item>
            <n-descriptions-item label="离职原因">{{ detailRow.terminationReason ?? '-' }}</n-descriptions-item>
          </template>
        </n-descriptions>
        <div class="ep-sec">合同与社保</div>
        <n-descriptions :column="isMobile ? 1 : 2" label-placement="left" size="small" bordered>
          <n-descriptions-item label="合同类型">{{ detailRow.contractType ? CONTRACT_TYPE_LABEL_MAP[detailRow.contractType] : '-' }}</n-descriptions-item>
          <n-descriptions-item label="合同到期">{{ day(detailRow.contractExpiresAt) }}</n-descriptions-item>
          <n-descriptions-item label="社保缴纳">{{ detailRow.socialInsurance ? SOCIAL_INSURANCE_LABEL_MAP[detailRow.socialInsurance] : '-' }}</n-descriptions-item>
          <n-descriptions-item label="健康证到期">{{ day(detailRow.healthCertExpiresAt) }}</n-descriptions-item>
        </n-descriptions>
        <div class="ep-sec">工资卡</div>
        <n-descriptions :column="isMobile ? 1 : 2" label-placement="left" size="small" bordered>
          <n-descriptions-item label="工资卡账号">{{ detailRow.bankAccountNo ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="开户行">{{ detailRow.bankName ?? '-' }}</n-descriptions-item>
        </n-descriptions>
        <div class="ep-sec">紧急联系人</div>
        <n-descriptions :column="isMobile ? 1 : 3" label-placement="left" size="small" bordered>
          <n-descriptions-item label="姓名">{{ detailRow.emergencyContactName ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="电话">{{ detailRow.emergencyContactPhone ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="关系">{{ detailRow.emergencyContactRelation ?? '-' }}</n-descriptions-item>
        </n-descriptions>
        <div class="ep-sec">备注</div>
        <div class="ep-remark">{{ detailRow.remark ?? '-' }}</div>
        <div class="ep-hint">姓名、部门、职务、联系电话来自“账号”，要修改请到账号管理里改。</div>
      </n-card>
    </n-modal>

    <!-- 离职归档 -->
    <n-modal :mask-closable="false" :show="!!archiveRow" @update:show="(v) => !v && (archiveRow = null)">
      <n-card v-if="archiveRow" :title="`离职归档：${archiveRow.account.realName}（工号 ${archiveRow.employeeNo}）`" style="width: min(480px, 96vw)" :bordered="false" role="dialog" closable @close="archiveRow = null" aria-modal="true">
        <n-form label-placement="top" size="small">
          <n-form-item label="离职日期"><n-date-picker v-model:value="archiveModel.terminationDate" type="date" style="width: 100%" /></n-form-item>
          <n-form-item label="离职原因（选填）"><n-input v-model:value="archiveModel.reason" /></n-form-item>
        </n-form>
        <div class="ep-hint">归档后：档案转为只读并移出在职名册；登录账号立即停用；工号 {{ archiveRow.employeeNo }} 释放，可分配给新员工；手机号仍属于该账号，不能重复开通。</div>
        <template #footer>
          <n-space justify="end">
            <n-button @click="archiveRow = null">取消</n-button>
            <n-button type="error" :loading="archiving" @click="doArchive">确认离职归档</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 恢复在职 -->
    <n-modal :mask-closable="false" :show="!!restoreRow" @update:show="(v) => !v && (restoreRow = null)">
      <n-card v-if="restoreRow" :title="`恢复在职：${restoreRow.account.realName}`" style="width: min(480px, 96vw)" :bordered="false" role="dialog" closable @close="restoreRow = null" aria-modal="true">
        <n-form label-placement="top" size="small">
          <n-form-item label="工号（原工号如果已被新员工使用，请换一个）"><n-input v-model:value="restoreNo" /></n-form-item>
        </n-form>
        <div class="ep-hint">恢复后：重新计入在职名册，登录账号重新启用（密码不变）。</div>
        <template #footer>
          <n-space justify="end">
            <n-button @click="restoreRow = null">取消</n-button>
            <n-button type="primary" :loading="restoring" @click="doRestore">确认恢复在职</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>

    <!-- 新建 / 编辑 -->
    <n-modal :mask-closable="false" :show="formVisible" @update:show="(v) => (formVisible = v)">
      <n-card :title="editingRow ? `编辑员工档案：${editingRow.account.realName}` : '建立员工档案'" style="width: min(720px, 96vw); max-height: 92vh; overflow: auto" :bordered="false" role="dialog" closable @close="formVisible = false" aria-modal="true">
        <n-form label-placement="top" size="small">
          <div class="ep-sec">基本信息</div>
          <div class="ep-grid">
            <n-form-item v-if="!editingRow" label="账号（姓名、部门、职务、电话来自账号）" class="ep-wide">
              <n-select v-model:value="model.accountId" :options="accountOptions" filterable placeholder="仅显示尚未建档的账号" />
            </n-form-item>
            <n-form-item label="工号" :feedback="editingRow && !canChangeNo ? '工号一旦分配，只有管理员才能修改' : undefined"><n-input v-model:value="model.employeeNo" :disabled="!!editingRow && !canChangeNo" /></n-form-item>
            <n-form-item label="身份证号（保存时自动识别性别和出生日期）"><n-input v-model:value="model.idCardNo" maxlength="18" placeholder="18 位身份证号" /></n-form-item>
            <n-form-item label="现住址" class="ep-wide"><n-input v-model:value="model.address" /></n-form-item>
          </div>
          <div class="ep-sec">呼叫定位系统（护理师用）</div>
          <div class="ep-grid">
            <n-form-item label="手表设备号"><n-input v-model:value="model.watchId" placeholder="与呼叫系统里的手表编号一致" /></n-form-item>
            <n-form-item label="当班状态"><n-select v-model:value="model.dutyStatus" :options="[{ label: '在岗', value: 'ON_DUTY' }, { label: '离岗', value: 'OFF_DUTY' }, { label: '休息', value: 'RESTING' }]" /></n-form-item>
            <n-form-item label="负责楼层（用顿号或逗号隔开）" class="ep-wide"><n-input v-model:value="model.floorsText" placeholder="如 2F、3F" /></n-form-item>
          </div>
          <div class="ep-sec">任职、合同与社保</div>
          <div class="ep-grid">
            <n-form-item label="入职日期"><n-date-picker v-model:value="model.hireDate" type="date" style="width: 100%" /></n-form-item>
            <n-form-item label="用工性质"><n-select v-model:value="model.employmentType" :options="employmentOptions" /></n-form-item>
            <n-form-item label="合同类型"><n-select v-model:value="model.contractType" :options="contractOptions" clearable placeholder="请选择" /></n-form-item>
            <n-form-item label="合同到期"><n-date-picker v-model:value="model.contractExpiresAt" type="date" style="width: 100%" clearable /></n-form-item>
            <n-form-item label="转正日期"><n-date-picker v-model:value="model.probationEndsAt" type="date" style="width: 100%" clearable /></n-form-item>
            <n-form-item label="社保缴纳"><n-select v-model:value="model.socialInsurance" :options="insuranceOptions" clearable placeholder="请选择" /></n-form-item>
            <n-form-item label="健康证到期"><n-date-picker v-model:value="model.healthCertExpiresAt" type="date" style="width: 100%" clearable /></n-form-item>
            <n-form-item v-if="editingRow" label="状态"><n-select v-model:value="model.status" :options="statusOptions" /></n-form-item>
          </div>
          <div class="ep-sec">工资卡</div>
          <div class="ep-grid">
            <n-form-item label="工资卡账号"><n-input v-model:value="model.bankAccountNo" placeholder="银行卡号（数字）" /></n-form-item>
            <n-form-item label="开户行"><n-input v-model:value="model.bankName" placeholder="如：招商银行西安科技路支行" /></n-form-item>
          </div>
          <div class="ep-sec">紧急联系人</div>
          <div class="ep-grid ep-grid3">
            <n-form-item label="姓名"><n-input v-model:value="model.emergencyContactName" /></n-form-item>
            <n-form-item label="电话"><n-input v-model:value="model.emergencyContactPhone" /></n-form-item>
            <n-form-item label="与员工关系"><n-input v-model:value="model.emergencyContactRelation" placeholder="如：配偶、母亲" /></n-form-item>
          </div>
          <n-form-item label="备注"><n-input v-model:value="model.remark" type="textarea" :autosize="{ minRows: 2 }" /></n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="formVisible = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="handleSubmit">保存</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.ep-card {
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.ep-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ep-top > :last-child {
  margin-left: auto;
}
.ep-sub {
  color: #888;
  font-size: 12px;
}
.ep-line {
  margin-top: 4px;
  color: #555;
  font-size: 12px;
}
.ep-sec {
  margin: 14px 0 8px;
  padding-left: 8px;
  border-left: 3px solid #d9822b;
  font-weight: 600;
  font-size: 13px;
}
.ep-sec:first-child {
  margin-top: 0;
}
.ep-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 12px;
}
.ep-grid3 {
  grid-template-columns: 1fr 1fr 1fr;
}
.ep-wide {
  grid-column: 1 / -1;
}
.ep-remark {
  white-space: pre-wrap;
  font-size: 13px;
  color: #444;
}
.ep-hint {
  margin-top: 14px;
  color: #999;
  font-size: 12px;
}
@media (max-width: 767px) {
  .ep-grid,
  .ep-grid3 {
    grid-template-columns: 1fr;
  }
}
</style>
