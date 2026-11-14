<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NCard, NInput, NModal, NSpace } from 'naive-ui'
import { customerApi } from '../../api/modules/customer.api'
import { motherProfileApi } from '../../api/modules/care.api'
import type { RemovalCheck } from '../../api/types/customer'
import { message } from '../../utils/discrete-api'

/**
 * 删除 / 归档客户或母婴档案的统一处理窗口。规则：
 * - 录错的可以删：什么数据都没有 → 直接删；只有宝宝/评估表/资料/跟进等录入类数据 → 管理员输入客户姓名确认后连同删除；
 * - 用过的不能删：已有合同/入住/收款/护理记录等财务医疗痕迹 → 只能“归档”（列表默认隐藏，可恢复）。
 */
const props = defineProps<{ show: boolean; kind: 'customer' | 'mother'; id: string; label: string }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'done'): void }>()

const check = ref<RemovalCheck | null>(null)
const loading = ref(false)
const submitting = ref(false)
const confirm = ref('')
const reason = ref('')

const canDelete = computed(() => {
  const c = check.value
  if (!c) return false
  return props.kind === 'customer' ? !!c.canDelete : true
})
// 客户：超级管理员（强制删除权限）可以连同合同/收款等一起删（进回收站）；其他人用过的只能归档
const forceMode = computed(() => props.kind === 'customer' && (check.value?.blockers.length ?? 0) > 0 && !!check.value?.canForceDelete && !!check.value?.canDelete)
const needsConfirm = computed(() => (check.value?.attached.length ?? 0) > 0 || forceMode.value)
const everything = computed(() => [...(check.value?.blockers ?? []), ...(check.value?.attached ?? [])])
const careForceMissing = computed(() => {
  const c = check.value
  if (!c || !needsConfirm.value) return false
  return props.kind === 'customer' ? c.attached.some((a) => a.includes('母婴档案') || a.includes('宝宝')) && !c.canForceDeleteCare : !c.canForceDelete
})
const blocked = computed(() => (check.value?.blockers.length ?? 0) > 0 && !forceMode.value)
const subject = computed(() => (props.kind === 'customer' ? '客户' : '母婴档案'))

async function load() {
  check.value = null
  confirm.value = ''
  reason.value = ''
  loading.value = true
  try {
    check.value = props.kind === 'customer' ? await customerApi.deleteCheck(props.id) : await motherProfileApi.deleteCheck(props.id)
  } catch {
    emit('update:show', false)
  } finally {
    loading.value = false
  }
}
// immediate：窗口是点“归档/删除”时才创建的，创建时 show 已经是 true，不加就不会触发检查
watch(() => props.show, (v) => v && load(), { immediate: true })

async function run(fn: () => Promise<void>, okMsg: string) {
  submitting.value = true
  try {
    await fn()
    message.success(okMsg)
    emit('update:show', false)
    emit('done')
  } finally {
    submitting.value = false
  }
}
const doArchive = () =>
  run(() => (props.kind === 'customer' ? customerApi.archive(props.id, reason.value.trim() || undefined) : motherProfileApi.archive(props.id)), `已归档，可在“已归档”里找到并随时恢复`)
const doRestore = () => run(() => (props.kind === 'customer' ? customerApi.restore(props.id) : motherProfileApi.restore(props.id)), '已恢复')
const doDelete = () =>
  run(
    () =>
      props.kind === 'customer'
        ? customerApi.remove(props.id, needsConfirm.value ? confirm.value.trim() : undefined)
        : motherProfileApi.remove(props.id, needsConfirm.value ? { force: true, confirmName: confirm.value.trim() } : undefined),
    `已删除${subject.value}，放入回收站（30天内可还原）`,
  )
</script>

<template>
  <n-modal :mask-closable="false" :show="show" @update:show="(v: boolean) => emit('update:show', v)">
    <n-card :title="`处理${subject}：${label}`" style="width: min(520px, 94vw)" :bordered="false" role="dialog" closable @close="emit('update:show', false)" aria-modal="true">
      <p v-if="loading || !check" style="color: var(--c-999999)">正在检查有没有关联数据…</p>
      <template v-else>
        <!-- 已归档：只能恢复（或在没有痕迹时删除） -->
        <p v-if="check.archived" style="margin: 0 0 10px; line-height: 1.7">这个{{ subject }}<b>已归档</b>（列表里默认看不到）。恢复后会重新出现在列表里。</p>

        <!-- 用过的：不能删 -->
        <div v-if="blocked" style="margin-bottom: 10px; line-height: 1.7">
          已有 <b style="color: var(--c-c0392b)">{{ check.blockers.join('、') }}</b>，属于{{ kind === 'customer' ? '财务/医疗' : '医疗' }}痕迹，<b>不能删除</b>。<br />
          不再使用的话请<b>归档</b>：列表里默认隐藏，{{ kind === 'customer' ? '不能再新建预订/合同，' : '' }}数据一条不丢，随时可以恢复。
        </div>

        <!-- 录错的：可以删 -->
        <template v-else>
          <p v-if="!needsConfirm" style="margin: 0 0 10px; line-height: 1.7">
            没有任何关联数据，可以直接<b>删除</b>（会放入回收站保留 30 天，操作会记入审计日志）。<span v-if="(check.linkedLeads ?? 0) > 0">关联的 {{ check.linkedLeads }} 条线索不会删除，只是解除关联。</span>
          </p>
          <div v-else style="margin-bottom: 10px; line-height: 1.7">
            名下有：<b style="color: var(--c-c0392b)">{{ everything.join('、') }}</b>。<br />
            <template v-if="forceMode">这个{{ subject }}已经用过（有合同/入住/收款等），<b>只有超级管理员能强制删除</b>，会把上面这些<b>全部一起删除</b>。</template>
            <template v-else>删除会把它们<b>一起删除</b>（含纸质原件照片）。</template>
            删除后放入<b>回收站</b>，保留 30 天，期内可在“系统管理 → 回收站”还原；操作会记入审计日志。<span v-if="(check.linkedLeads ?? 0) > 0">关联的 {{ check.linkedLeads }} 条线索不会删除，只是解除关联。</span>
            <n-input v-if="canDelete && !careForceMissing" v-model:value="confirm" style="margin-top: 8px" :placeholder="`请输入客户姓名“${check.customerName}”确认删除`" />
          </div>
          <p v-if="!canDelete" style="color: var(--c-d9822b); margin: 0 0 10px">删除{{ subject }}需要管理员权限；你可以先<b>归档</b>，让管理员来删。</p>
          <p v-else-if="careForceMissing" style="color: var(--c-d9822b); margin: 0 0 10px">连同母婴档案/评估表一起删除需要“强制删除档案”权限（管理员），你可以先<b>归档</b>。</p>
        </template>

        <n-input v-if="kind === 'customer' && !check.archived" v-model:value="reason" placeholder="归档原因（可不填，如：已退订、重复建档、长期无联系）" maxlength="60" style="margin-bottom: 4px" />
      </template>
      <template #footer>
        <n-space justify="end">
          <n-button @click="emit('update:show', false)">关闭</n-button>
          <template v-if="check">
            <n-button v-if="check.archived" type="primary" :loading="submitting" @click="doRestore">恢复</n-button>
            <n-button v-else :loading="submitting" @click="doArchive">归档</n-button>
            <n-button
              v-if="!blocked"
              type="error"
              :loading="submitting"
              :disabled="!canDelete || careForceMissing || (needsConfirm && confirm.trim() !== check.customerName)"
              @click="doDelete"
            >
              {{ forceMode ? '强制删除（放入回收站）' : '删除（放入回收站）' }}
            </n-button>
          </template>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>
