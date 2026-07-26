<script setup lang="ts" generic="T extends { version: number }">
import { computed, ref, watch } from 'vue'
import { NModal, NCard, NForm, NFormItem, NInput, NSelect, NInputNumber, NSpace, NButton, type FormInst, type FormRules } from 'naive-ui'
import type { CrudFormField, CrudSelectOption } from './types'

const props = defineProps<{
  visible: boolean
  title: string
  fields: CrudFormField[]
  initialData: T | null
  submitting?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [boolean]
  submit: [Record<string, unknown>]
}>()

const formRef = ref<FormInst | null>(null)
const model = ref<Record<string, unknown>>({})
const resolvedOptions = ref<Record<string, CrudSelectOption[]>>({})

const isEdit = computed(() => props.initialData !== null)
const visibleFields = computed(() =>
  props.fields.filter((f) => f.showOn === 'both' || (isEdit.value ? f.showOn === 'update' : f.showOn === 'create')),
)
const rules = computed(() => {
  const r: FormRules = {}
  for (const f of visibleFields.value) {
    if (f.rules) r[f.key] = f.rules
  }
  return r
})

async function loadOptions() {
  for (const f of props.fields) {
    if (f.component !== 'select' || !f.options) continue
    if (Array.isArray(f.options)) {
      resolvedOptions.value[f.key] = f.options
    } else {
      resolvedOptions.value[f.key] = await f.options()
    }
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    model.value = props.initialData ? { ...props.initialData } : {}
    void loadOptions()
  },
  { immediate: true },
)

function close() {
  emit('update:visible', false)
}

async function handleSubmit() {
  await formRef.value?.validate()
  const payload: Record<string, unknown> = {}
  for (const f of visibleFields.value) {
    payload[f.key] = model.value[f.key]
  }
  if (isEdit.value && props.initialData) {
    payload.version = props.initialData.version
  }
  emit('submit', payload)
}
</script>

<template>
  <n-modal :show="visible" @update:show="(v: boolean) => emit('update:visible', v)">
    <n-card :title="title" style="width: 480px" :bordered="false" role="dialog" aria-modal="true">
      <n-form ref="formRef" :model="model" :rules="rules" label-placement="left" label-width="90">
        <n-form-item v-for="f in visibleFields" :key="f.key" :label="f.label" :path="f.key">
          <n-input v-if="f.component === 'input'" v-model:value="model[f.key] as string" :placeholder="f.placeholder" />
          <n-input
            v-else-if="f.component === 'textarea'"
            v-model:value="model[f.key] as string"
            type="textarea"
            :placeholder="f.placeholder"
          />
          <n-input-number v-else-if="f.component === 'number'" v-model:value="model[f.key] as number" style="width: 100%" />
          <n-select
            v-else-if="f.component === 'select'"
            v-model:value="model[f.key] as string"
            :options="resolvedOptions[f.key] ?? []"
            :placeholder="f.placeholder"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="close">取消</n-button>
          <n-button type="primary" :loading="submitting" @click="handleSubmit">提交</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>
