<script setup lang="ts">
/**
 * 新生儿 24 小时护理记录：一行一次护理，列 = 时间 | 晨护 | 脐带护理 | 皮肤护理 | 臀部护理 | 面部护理 | 游泳 | 洗澡 | 抚触 | 早教 | 其他（手写）| 责护签字 | 操作（打勾=已做），
 * 排列方式和“24 小时喂养记录”一致。电脑端是表格，手机上每行一张卡片。
 */
import type { FeedingEntry } from '../../api/types/care-archive'

const props = defineProps<{ modelValue: FeedingEntry[]; defaultNurse?: string; narrow?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: FeedingEntry[]] }>()

const TICKS = [
  { key: 'morningCare', label: '晨护' },
  { key: 'cordCare', label: '脐带护理' },
  { key: 'skinCare', label: '皮肤护理' },
  { key: 'hipCare', label: '臀部护理' },
  { key: 'faceCare', label: '面部护理' },
  { key: 'swimming', label: '游泳' },
  { key: 'bathing', label: '洗澡' },
  { key: 'massage', label: '抚触' },
  { key: 'earlyEdu', label: '早教' },
] as const

const setRow = (i: number, patch: FeedingEntry) => emit('update:modelValue', props.modelValue.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
const removeRow = (i: number) => emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
const nowHm = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const addRow = () => emit('update:modelValue', [...props.modelValue, { time: nowHm(), nurseName: props.defaultNurse ?? '' }])
const toggle = (i: number, key: string) => setRow(i, { [key]: props.modelValue[i][key] === 'YES' ? null : 'YES' })
const count = (k: string) => props.modelValue.filter((r) => r[k] === 'YES').length
</script>

<template>
  <div class="nr">
    <table v-if="!narrow" class="nr-t">
      <thead>
        <tr>
          <th class="w-time">时间</th>
          <th v-for="t in TICKS" :key="t.key">{{ t.label }}</th>
          <th class="w-other">其他</th>
          <th class="w-nurse">责护签字</th>
          <th class="w-x">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in modelValue" :key="i">
          <td><input type="time" :value="(r.time as string) ?? ''" @input="(e) => setRow(i, { time: (e.target as HTMLInputElement).value })" /></td>
          <td v-for="t in TICKS" :key="t.key" class="c"><button type="button" class="tick" :class="{ on: r[t.key] === 'YES' }" @click="toggle(i, t.key)">✓</button></td>
          <td><input :value="(r.otherCare as string) ?? ''" @input="(e) => setRow(i, { otherCare: (e.target as HTMLInputElement).value })" /></td>
          <td><input :value="(r.nurseName as string) ?? ''" @input="(e) => setRow(i, { nurseName: (e.target as HTMLInputElement).value })" /></td>
          <td class="c"><button type="button" class="del" @click="removeRow(i)">删除</button></td>
        </tr>
        <tr v-if="modelValue.length === 0">
          <td colspan="13" class="empty">还没有记录，点下面“＋ 添加一行”。</td>
        </tr>
        <tr class="sum">
          <td>总结</td>
          <td v-for="t in TICKS" :key="t.key" class="c">{{ count(t.key) || '' }}</td>
          <td colspan="3"></td>
        </tr>
      </tbody>
    </table>

    <template v-else>
      <div v-for="(r, i) in modelValue" :key="i" class="nr-card">
        <div class="nr-head">
          <input class="nr-time" type="time" :value="(r.time as string) ?? ''" @input="(e) => setRow(i, { time: (e.target as HTMLInputElement).value })" />
          <span class="nr-no">第 {{ i + 1 }} 次</span>
          <button type="button" class="del" @click="removeRow(i)">删除</button>
        </div>
        <div class="nr-ticks">
          <button v-for="t in TICKS" :key="t.key" type="button" class="nr-chip" :class="{ on: r[t.key] === 'YES' }" @click="toggle(i, t.key)">{{ t.label }}</button>
        </div>
        <label class="nr-nurse">其他<input :value="(r.otherCare as string) ?? ''" placeholder="没有对应勾选项的护理，手写" @input="(e) => setRow(i, { otherCare: (e.target as HTMLInputElement).value })" /></label>
        <label class="nr-nurse" style="margin-top: 6px">责护签字<input :value="(r.nurseName as string) ?? ''" @input="(e) => setRow(i, { nurseName: (e.target as HTMLInputElement).value })" /></label>
      </div>
      <div v-if="modelValue.length === 0" class="empty">还没有记录，点下面的按钮添加。</div>
    </template>
    <button type="button" class="add" @click="addRow">＋ 添加一行（时间默认现在）</button>
  </div>
</template>

<style scoped>
.nr-t { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
.nr-t th, .nr-t td { border: 1px solid var(--c-9a9a9a); padding: 1px 3px; text-align: center; vertical-align: middle; }
.nr-t th { background: var(--c-f4f4f4); font-weight: 600; padding: 4px 2px; }
.w-time { width: 92px; }
.w-other { width: 22%; }
.w-nurse { width: 90px; }
.w-x { width: 64px; }
.nr-t input { width: 100%; height: 26px; padding: 0 3px; border: 0; background: transparent; font-size: 13px; outline: none; text-align: center; }
.nr-t input[type='time'] { font-weight: 600; }
.nr-t input:focus { background: var(--c-f6fbf8); }
.tick { width: 24px; height: 22px; border: 1px solid var(--c-cccccc); border-radius: 4px; background: #fff; color: var(--c-cccccc); cursor: pointer; }
.tick.on { border-color: var(--c-18a058); background: var(--c-e8f6ee); color: var(--c-0c7a43); font-weight: 700; }
.del { padding: 1px 8px; border: 1px solid var(--c-f0c0c0); border-radius: 4px; background: #fff; color: var(--c-cc3333); font-size: 12px; cursor: pointer; }
.sum td { background: var(--c-f9f9f9); font-weight: 600; padding: 3px; }
.empty { padding: 14px; color: var(--c-999999); text-align: center; }
.add { margin-top: 6px; width: 100%; padding: 5px; border: 1px dashed var(--c-18a058); border-radius: 6px; background: #fff; color: var(--c-18a058); cursor: pointer; }
.nr-card { margin-bottom: 10px; padding: 8px 10px; border: 1px solid var(--c-e6e6e6); border-radius: 8px; background: var(--c-fcfcfc); }
.nr-head { display: flex; align-items: center; gap: 8px; }
.nr-time { height: 34px; border: 1px solid var(--c-dddddd); border-radius: 6px; padding: 0 6px; font-size: 15px; font-weight: 600; }
.nr-no { flex: 1; color: var(--c-888888); font-size: 12px; }
.nr-ticks { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.nr-chip { padding: 8px 12px; border: 1px solid var(--c-cccccc); border-radius: 18px; background: #fff; color: var(--c-666666); font-size: 14px; }
.nr-chip.on { border-color: var(--c-18a058); background: var(--c-e8f6ee); color: var(--c-0c7a43); font-weight: 700; }
.nr-nurse { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--c-666666); }
.nr-nurse input { height: 34px; border: 1px solid var(--c-dddddd); border-radius: 6px; padding: 0 8px; font-size: 14px; }
</style>
