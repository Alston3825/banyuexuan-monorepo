<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NInput, NModal, NSpace, NSpin } from 'naive-ui'
import { customerApi } from '../../api/modules/customer.api'
import type { Customer, MergePreview } from '../../api/types/customer'
import { message } from '../../utils/discrete-api'

/**
 * 合并重复客户：同一个人建了两个档案时，把“重复的”那个的所有数据（合同/入住/收款/母婴档案/线索/标签/跟进…）
 * 转到“保留的”客户名下，被合并的那个进回收站。
 */
const props = defineProps<{ show: boolean; sourceId: string; sourceLabel: string }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'done'): void }>()

const keyword = ref('')
const results = ref<Customer[]>([])
const searching = ref(false)
const target = ref<Customer | null>(null)
const preview = ref<MergePreview | null>(null)
const previewing = ref(false)
const submitting = ref(false)

watch(
  () => props.show,
  (v) => {
    if (v) {
      keyword.value = ''
      results.value = []
      target.value = null
      preview.value = null
    }
  },
  { immediate: true },
)

async function search() {
  if (!keyword.value.trim()) return
  searching.value = true
  try {
    results.value = (await customerApi.list({ keyword: keyword.value.trim() })).filter((c) => c.id !== props.sourceId)
  } finally {
    searching.value = false
  }
}

async function pick(c: Customer) {
  target.value = c
  preview.value = null
  previewing.value = true
  try {
    preview.value = await customerApi.mergePreview(props.sourceId, c.id)
  } catch {
    target.value = null
  } finally {
    previewing.value = false
  }
}

const canMerge = computed(() => !!preview.value && preview.value.conflicts.length === 0)

async function doMerge() {
  if (!target.value) return
  submitting.value = true
  try {
    await customerApi.merge(props.sourceId, target.value.id)
    message.success('已合并，被合并的客户放入了回收站')
    emit('update:show', false)
    emit('done')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <n-modal :show="show" @update:show="(v: boolean) => emit('update:show', v)">
    <n-card title="合并重复客户" style="width: min(560px, 94vw)" :bordered="false" role="dialog" aria-modal="true">
      <p style="margin: 0 0 10px; line-height: 1.7">
        要合并掉的重复客户：<b style="color: #c0392b">{{ sourceLabel }}</b><br />
        请搜索并选择<b>要保留</b>的那一个客户，重复客户名下的合同、入住、收款、母婴档案、线索、标签、跟进记录会<b>全部转到保留的客户名下</b>，保留客户缺的资料（医院、预产期等）会用重复客户的补上。
      </p>
      <n-space style="margin-bottom: 8px">
        <n-input v-model:value="keyword" placeholder="按姓名/手机号/客户编号搜索要保留的客户" style="width: min(340px, 70vw)" clearable @keyup.enter="search" />
        <n-button :loading="searching" @click="search">搜索</n-button>
      </n-space>
      <div v-if="results.length > 0 && !target" style="max-height: 200px; overflow: auto; border: 1px solid #eee; border-radius: 6px">
        <div
          v-for="c in results"
          :key="c.id"
          style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f3f3f3"
          @click="pick(c)"
        >
          {{ c.name }}　<span style="color: #888">{{ c.customerNo }}　{{ c.phone }}</span>
        </div>
      </div>
      <n-spin v-if="previewing" size="small" />
      <template v-if="target && preview">
        <n-alert type="info" :bordered="false" style="margin-top: 8px">
          保留：<b>{{ target.name }}</b>（{{ target.customerNo }}）　<n-button text type="primary" @click="target = null; preview = null">重选</n-button>
          <div style="margin-top: 6px">
            将转入：<b>{{ preview.moves.length > 0 ? preview.moves.map((m) => `${m.count} ${m.label}`).join('、') : '（重复客户名下没有其他数据）' }}</b>
          </div>
        </n-alert>
        <n-alert v-for="c in preview.conflicts" :key="c" type="error" :bordered="false" style="margin-top: 8px">{{ c }}</n-alert>
        <p style="color: #888; margin: 8px 0 0; font-size: 12px">合并后“{{ sourceLabel }}”进入回收站（30天内可还原成独立客户，但已转走的数据不会自动回去）。</p>
      </template>
      <template #footer>
        <n-space justify="end">
          <n-button @click="emit('update:show', false)">取消</n-button>
          <n-button type="primary" :disabled="!canMerge" :loading="submitting" @click="doMerge">确认合并</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>
