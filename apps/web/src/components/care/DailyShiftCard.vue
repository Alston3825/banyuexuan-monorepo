<script setup lang="ts">
/** 班次总结与签字：外框里并排两个小框——白班护理总结（含护理师签字、客户签字）和夜班护理总结（含护理师签字）。 */
import type { FieldSpec } from '../../api/types/care-archive'
import PaperField from './PaperField.vue'
import SheetSection from './SheetSection.vue'

defineProps<{
  title: string
  summary: string
  state: 'empty' | 'done'
  open: boolean
  collapsible: boolean
  fields: Record<string, FieldSpec>
  values: Record<string, unknown>
  warn: (key: string) => string | undefined
}>()
const emit = defineEmits<{ toggle: []; 'update:values': [value: Record<string, unknown>] }>()
</script>

<template>
  <SheetSection :title="title" :summary="summary" :state="state" :open="open" :collapsible="collapsible" @toggle="emit('toggle')">
    <div class="sc">
      <div class="sc-box">
        <div class="sc-t">白班护理总结</div>
        <PaperField no-label :field="fields.dayShiftSummary" :model-value="values" :warn="warn('dayShiftSummary')" :rows="4" @update:model-value="(v) => emit('update:values', v)" />
        <div class="sc-sign">
          <PaperField :field="fields.dayNurseName" :model-value="values" :warn="warn('dayNurseName')" width="90px" @update:model-value="(v) => emit('update:values', v)" />
          <PaperField :field="fields.babyClientSigner" :model-value="values" :warn="warn('babyClientSigner')" width="90px" @update:model-value="(v) => emit('update:values', v)" />
        </div>
      </div>
      <div class="sc-box">
        <div class="sc-t">夜班护理总结</div>
        <PaperField no-label :field="fields.nightShiftSummary" :model-value="values" :warn="warn('nightShiftSummary')" :rows="4" @update:model-value="(v) => emit('update:values', v)" />
        <div class="sc-sign">
          <PaperField :field="fields.nightNurseName" :model-value="values" :warn="warn('nightNurseName')" width="90px" @update:model-value="(v) => emit('update:values', v)" />
        </div>
      </div>
    </div>
  </SheetSection>
</template>

<style scoped>
.sc {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.sc-box {
  padding: 8px 10px 10px;
  border: 1px solid #dcdcdc;
  border-radius: 12px;
}
.sc-t {
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 700;
  color: #333;
}
.sc-sign {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  margin-top: 6px;
}
@media (max-width: 767px) {
  .sc {
    grid-template-columns: 1fr;
  }
}
</style>
