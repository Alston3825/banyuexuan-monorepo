<script setup lang="ts">
/**
 * 员工信息表批量开通账号：把 Excel 拖进来 → 读表并逐行检查 → 勾选确认 → 开通。
 * 用户名 = 手机号，初始密码统一 banyuexuan；表里有、账号页面没有的列（工龄等）不读取。
 */
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NCard, NCheckbox, NDataTable, NModal, NSelect, NSpace, NSpin, NSwitch, NTag, type DataTableColumns } from 'naive-ui'
import { accountApi } from '../../api/modules/account.api'
import type { ImportCommitResult, ImportPreview, ImportPreviewRow } from '../../api/types/account'
import { message } from '../../utils/discrete-api'

const DEFAULT_PASSWORD = 'banyuexuan'

const props = defineProps<{
  show: boolean
  file: File | null
  storeOptions: { label: string; value: string }[]
  roleOptions: { label: string; value: string }[]
}>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'done'): void }>()

const mql = window.matchMedia('(max-width: 767px)')
const isMobile = ref(mql.matches)
const onMql = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
mql.addEventListener('change', onMql)
onBeforeUnmount(() => mql.removeEventListener('change', onMql))

const loading = ref(false)
const submitting = ref(false)
const preview = ref<ImportPreview | null>(null)
const checked = ref<number[]>([]) // 勾选的行号
const result = ref<ImportCommitResult | null>(null)
const storeId = ref<string | null>(null)
const roleId = ref<string | null>(null)
const createMissing = ref(true)
const importProfileDetails = ref(true)

const hasError = (r: ImportPreviewRow) => r.issues.some((i) => i.level === 'error')
const okRows = computed(() => (preview.value?.rows ?? []).filter((r) => !hasError(r)))
const errorCount = computed(() => (preview.value?.rows ?? []).length - okRows.value.length)

async function load() {
  preview.value = null
  result.value = null
  if (!props.file) return
  loading.value = true
  try {
    const p = await accountApi.importPreview(props.file)
    preview.value = p
    // 默认勾选：没有错误、备注里没写“离职”的行
    checked.value = p.rows.filter((r) => !hasError(r) && !r.resigned).map((r) => r.rowNo)
    if (!storeId.value) storeId.value = props.storeOptions[0]?.value ?? null
    // 默认角色：优先“门店员工”类
    if (!roleId.value) roleId.value = props.roleOptions.find((o) => o.label.includes('STORE_STAFF'))?.value ?? null
  } catch {
    emit('update:show', false) // 错误提示已由全局拦截器弹出
  } finally {
    loading.value = false
  }
}
watch(() => [props.show, props.file], () => props.show && load(), { immediate: true })

function toggle(rowNo: number, on: boolean) {
  checked.value = on ? [...new Set([...checked.value, rowNo])] : checked.value.filter((n) => n !== rowNo)
}

async function submit() {
  if (!preview.value || !storeId.value) return void message.error('请选择开通到哪个门店')
  const rows = preview.value.rows
    .filter((r) => checked.value.includes(r.rowNo))
    .map(({ issues: _i, storeId: _s, employeeNoSuggested: _e, newDepartment: _d, newPosition: _p, resigned: _r, existingAccountId: _x, existingNo: _n, willRenumber: _w, ...base }) => base)
  if (rows.length === 0) return void message.error('请先勾选要开通的员工')
  submitting.value = true
  try {
    result.value = await accountApi.importCommit({ rows, storeId: storeId.value, createMissing: createMissing.value, roleId: roleId.value ?? undefined, importProfileDetails: importProfileDetails.value })
    if (result.value.created > 0 || result.value.renumbered > 0) emit('done')
  } finally {
    submitting.value = false
  }
}

const issueTag = (r: ImportPreviewRow) =>
  h(NSpace, { vertical: true, size: 2 }, {
    default: () => [
      ...r.issues.map((i) => h('span', { style: `font-size:12px;color:${i.level === 'error' ? '#d03050' : '#b7791f'}` }, `${i.level === 'error' ? '✗ ' : '⚠ '}${i.text}`)),
      ...(r.issues.length === 0 ? [h('span', { style: 'font-size:12px;color:#18a058' }, '✓ 可以开通')] : []),
    ],
  })

const columns: DataTableColumns<ImportPreviewRow> = [
  {
    key: 'sel',
    width: 44,
    render: (r) => h(NCheckbox, { checked: checked.value.includes(r.rowNo), disabled: hasError(r), 'onUpdate:checked': (v: boolean) => toggle(r.rowNo, v) }),
  },
  { key: 'rowNo', title: '表中行', width: 64 },
  { key: 'name', title: '姓名', width: 90 },
  { key: 'phone', title: '手机号（= 用户名）', width: 140, render: (r) => r.phone ?? '-' },
  { key: 'employeeNo', title: '工号', width: 100, render: (r) => h('span', null, [r.employeeNo ?? '-', r.employeeNoSuggested ? h(NTag, { size: 'tiny', type: 'info', style: 'margin-left:4px' }, { default: () => '自动' }) : null]) },
  { key: 'departmentName', title: '部门', width: 110, render: (r) => h('span', null, [r.departmentName ?? '-', r.newDepartment ? h(NTag, { size: 'tiny', type: 'warning', style: 'margin-left:4px' }, { default: () => '新建' }) : null]) },
  { key: 'positionName', title: '职位', width: 110, render: (r) => h('span', null, [r.positionName ?? '-', r.newPosition ? h(NTag, { size: 'tiny', type: 'warning', style: 'margin-left:4px' }, { default: () => '新建' }) : null]) },
  { key: 'hireDate', title: '入职日期', width: 100, render: (r) => r.hireDate ?? '-' },
  { key: 'issues', title: '检查结果', minWidth: 260, render: issueTag },
]

const close = () => emit('update:show', false)
</script>

<template>
  <n-modal :show="show" :mask-closable="!submitting" @update:show="(v) => emit('update:show', v)">
    <n-card :title="`批量开通账号${file ? '：' + file.name : ''}`" style="width: min(1040px, 96vw); max-height: 94vh; overflow: auto" :bordered="false" role="dialog" aria-modal="true">
      <n-spin :show="loading">
        <div v-if="loading && !preview" style="min-height: 120px" />

        <!-- 开通结果 -->
        <template v-if="result">
          <p style="font-size: 15px">
            新开通 <b style="color: #18a058">{{ result.created }}</b> 个账号<span v-if="result.renumbered">，改了 <b style="color: #18a058">{{ result.renumbered }}</b> 位已有员工的工号</span><span v-if="result.skipped">，<b>{{ result.skipped }}</b> 位已有账号未改动</span><span v-if="result.failed.length">，<b style="color: #d03050">{{ result.failed.length }}</b> 个没有开通</span>。
          </p>
          <p style="color: #666; font-size: 13px">登录方式：用户名 = 手机号，初始密码 <b>{{ DEFAULT_PASSWORD }}</b>。</p>
          <div v-if="result.failed.length" style="margin-top: 8px">
            <div v-for="f in result.failed" :key="f.rowNo" style="color: #d03050; font-size: 13px; margin-bottom: 4px">表中第 {{ f.rowNo }} 行 {{ f.name }}：{{ f.error }}</div>
          </div>
        </template>

        <template v-else-if="preview">
          <div class="ai-sum">
            读到 <b>{{ preview.rows.length }}</b> 位员工（工作表「{{ preview.sheetName }}」第 {{ preview.headerRow }} 行为表头）：
            <b style="color: #18a058">{{ okRows.length }}</b> 位可以开通<span v-if="errorCount">，<b style="color: #d03050">{{ errorCount }}</b> 位有问题（请先在表里改好）</span>。
            <span v-if="preview.ignoredColumns.length" style="color: #999">没有读取的列：{{ preview.ignoredColumns.join('、') }}。</span>
          </div>

          <div class="ai-opts">
            <div><span>开通到门店</span><n-select v-model:value="storeId" :options="storeOptions" size="small" style="width: 200px" /></div>
            <div><span>赋予角色</span><n-select v-model:value="roleId" :options="roleOptions" clearable size="small" placeholder="不赋予（以后单独分配）" style="width: 240px" /></div>
            <div><n-switch v-model:value="createMissing" size="small" /> <span>部门/职位不存在时自动新建</span></div>
            <div><n-switch v-model:value="importProfileDetails" size="small" /> <span>同时写入员工档案（合同、社保、身份证、工资卡）</span></div>
          </div>

          <template v-if="isMobile">
            <div v-for="r in preview.rows" :key="r.rowNo" class="ai-card" :class="{ 'ai-card-err': hasError(r) }">
              <n-checkbox :checked="checked.includes(r.rowNo)" :disabled="hasError(r)" @update:checked="(v: boolean) => toggle(r.rowNo, v)">
                <b>{{ r.name }}</b> <span style="color: #888; font-size: 12px">第 {{ r.rowNo }} 行 · {{ r.phone ?? '无手机号' }}</span>
              </n-checkbox>
              <div class="ai-line">工号 {{ r.employeeNo ?? '-' }}{{ r.employeeNoSuggested ? '（自动）' : '' }} · {{ r.departmentName ?? '-' }}{{ r.newDepartment ? '（新建）' : '' }} · {{ r.positionName ?? '-' }}{{ r.newPosition ? '（新建）' : '' }}</div>
              <component :is="() => issueTag(r)" />
            </div>
          </template>
          <n-data-table v-else :columns="columns" :data="preview.rows" :row-key="(r: ImportPreviewRow) => r.rowNo" size="small" :scroll-x="1000" :max-height="360" />
        </template>
      </n-spin>

      <template #footer>
        <n-space justify="end">
          <template v-if="result"><n-button type="primary" @click="close">完成</n-button></template>
          <template v-else>
            <n-button :disabled="submitting" @click="close">取消</n-button>
            <n-button type="primary" :loading="submitting" :disabled="!preview || checked.length === 0" @click="submit">开通所选的 {{ checked.length }} 位</n-button>
          </template>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.ai-sum {
  font-size: 13px;
  line-height: 1.8;
  margin-bottom: 8px;
}
.ai-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  align-items: center;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #faf6f0;
  border-radius: 6px;
  font-size: 13px;
}
.ai-opts > div {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ai-card {
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 8px;
}
.ai-card-err {
  background: #fff7f7;
}
.ai-line {
  margin: 4px 0;
  font-size: 12px;
  color: #555;
}
</style>
