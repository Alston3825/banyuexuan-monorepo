<script setup lang="ts">
/**
 * 选主责护理师：候选人 = 员工账号（本门店或不限门店、在职），职位/角色/部门带“护理”的排在前面。
 * 护理师不单独建档，统一在“员工/账号”里维护（给护理师账号赋“护理”相关角色或职位，这里就能排到前面）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { NSelect } from 'naive-ui'
import { motherProfileApi } from '../../api/modules/care.api'

const props = defineProps<{ modelValue: string | null; storeId?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()

const list = ref<{ id: string; name: string; roles: string[]; isNurse: boolean }[]>([])
async function load() {
  list.value = await motherProfileApi.nurseOptions(props.storeId)
}
onMounted(load)
watch(() => props.storeId, load)

const options = computed(() => {
  const mk = (x: (typeof list.value)[number]) => ({ label: x.roles.length ? `${x.name}（${x.roles.join('、')}）` : x.name, value: x.id })
  const nurses = list.value.filter((x) => x.isNurse)
  const others = list.value.filter((x) => !x.isNurse)
  return [
    ...(nurses.length ? [{ type: 'group' as const, label: '护理人员', key: 'n', children: nurses.map(mk) }] : []),
    ...(others.length ? [{ type: 'group' as const, label: nurses.length ? '其他员工' : '员工', key: 'o', children: others.map(mk) }] : []),
  ]
})
</script>

<template>
  <n-select
    :value="modelValue"
    :options="options"
    filterable
    clearable
    placeholder="选择护理师（员工账号）"
    style="width: 100%"
    @update:value="(v: string | null) => emit('update:modelValue', v)"
  />
</template>
