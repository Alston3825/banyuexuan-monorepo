<script setup lang="ts">
/**
 * 护理设置：把原来分散的四个后台设置页合并到一个入口，用标签页切换。
 *   护理字段 → 护理项目（表单）→ 护理方案 → 关怀模板
 * 日常工作页面（护理看板、母婴档案、待跟进关怀）在菜单前面，这里只放管理人员偶尔调整的配置。
 * 标签按账号权限显示；?tab=fields|forms|plans|outreach 可直接定位到某个标签（老地址会跳到这里）。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NTabPane, NTabs } from 'naive-ui'
import { useAuthStore } from '../../stores/auth'
import CareFieldsView from './CareFieldsView.vue'
import CareFormTemplatesView from './CareFormTemplatesView.vue'
import CarePlanTemplatesView from './CarePlanTemplatesView.vue'
import CareOutreachTemplatesView from './CareOutreachTemplatesView.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const allTabs = [
  { name: 'fields', label: '护理字段', perm: 'care.field' },
  { name: 'forms', label: '护理项目', perm: 'care.form-template' },
  { name: 'plans', label: '护理方案', perm: 'care.plan-template' },
  { name: 'outreach', label: '关怀模板', perm: 'care.outreach-template' },
]
const tabs = computed(() => allTabs.filter((t) => auth.hasAccess(t.perm)))

const active = ref<string>(String(route.query.tab ?? ''))
if (!tabs.value.some((t) => t.name === active.value)) active.value = tabs.value[0]?.name ?? 'fields'

watch(active, (name) => {
  if (route.query.tab !== name) router.replace({ query: { ...route.query, tab: name } })
})
</script>

<template>
  <div>
    <p style="margin: 0 0 8px; color: #888; font-size: 13px">护理表单和方案的后台配置。日常护理工作请使用左侧的“护理看板”和“母婴档案”。</p>
    <n-tabs v-model:value="active" type="line" animated>
      <n-tab-pane v-for="t in tabs" :key="t.name" :name="t.name" :tab="t.label" display-directive="if">
        <CareFieldsView v-if="t.name === 'fields'" />
        <CareFormTemplatesView v-else-if="t.name === 'forms'" />
        <CarePlanTemplatesView v-else-if="t.name === 'plans'" />
        <CareOutreachTemplatesView v-else />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
