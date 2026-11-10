<script setup lang="ts">
/** 自定义快捷入口：把自己每天最常用的页面放到这里，一点就到。只能选自己有权限进的页面。 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NCheckbox, NEmpty, NIcon, NInput, NModal, NSpace } from 'naive-ui'
import { workbenchApi, type QuickLinkRow } from '../../api/modules/workbench.api'
import { listNavLeaves } from '../../layouts/nav-menu'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const links = ref<QuickLinkRow[]>([])
const picking = ref(false)
const picked = ref<string[]>([])
const kw = ref('')
const leaves = computed(() => listNavLeaves(auth.hasAccess))
const iconOf = (path: string) => leaves.value.find((l) => l.to === path)?.icon
const groups = computed(() => {
  const k = kw.value.trim()
  const m = new Map<string, typeof leaves.value>()
  for (const l of leaves.value.filter((x) => !k || x.label.includes(k) || x.group.includes(k))) m.set(l.group, [...(m.get(l.group) ?? []), l])
  return [...m.entries()]
})

onMounted(async () => (links.value = await workbenchApi.links()))
function openPick() {
  picked.value = links.value.map((l) => l.path)
  kw.value = ''
  picking.value = true
}
function toggle(path: string, on: boolean) {
  picked.value = on ? [...picked.value, path] : picked.value.filter((p) => p !== path)
}
async function save() {
  const rows = picked.value.map((p) => ({ path: p, label: leaves.value.find((l) => l.to === p)?.label ?? p }))
  links.value = await workbenchApi.saveLinks(rows)
  picking.value = false
}
function move(i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= picked.value.length) return
  const a = [...picked.value]
  ;[a[i], a[j]] = [a[j], a[i]]
  picked.value = a
}
const labelOf = (p: string) => leaves.value.find((l) => l.to === p)?.label ?? p
</script>

<template>
  <div>
    <div class="sc-bar"><b>我的常用页面</b><n-button size="small" type="primary" @click="openPick">编辑快捷入口</n-button></div>
    <n-empty v-if="links.length === 0" description="还没有快捷入口。点右上角，把你每天最常用的页面放进来" style="margin: 30px 0" />
    <div class="sc-grid">
      <button v-for="l in links" :key="l.path" class="sc-tile" @click="router.push(l.path)">
        <n-icon v-if="iconOf(l.path)" :component="iconOf(l.path)" :size="26" />
        <span>{{ l.label }}</span>
      </button>
    </div>

    <n-modal :mask-closable="false" :show="picking" @update:show="(v) => (picking = v)">
      <n-card title="选择快捷入口" style="width: min(560px, 96vw)" :bordered="false" closable @close="picking = false">
        <n-input v-model:value="kw" clearable placeholder="搜索页面名称" style="margin-bottom: 10px" />
        <div v-if="picked.length" class="sc-picked">
          <div class="sc-sub">已选 {{ picked.length }} 个（可用 ↑↓ 调整顺序）</div>
          <div v-for="(p, i) in picked" :key="p" class="sc-row"><span>{{ labelOf(p) }}</span><n-space :size="4"><n-button size="tiny" :disabled="i === 0" @click="move(i, -1)">↑</n-button><n-button size="tiny" :disabled="i === picked.length - 1" @click="move(i, 1)">↓</n-button></n-space></div>
        </div>
        <div class="sc-list">
          <div v-for="[g, items] in groups" :key="g">
            <div class="sc-group">{{ g }}</div>
            <div class="sc-checks"><n-checkbox v-for="l in items" :key="l.to" :checked="picked.includes(l.to)" @update:checked="(v: boolean) => toggle(l.to, v)">{{ l.label }}</n-checkbox></div>
          </div>
        </div>
        <template #footer><n-space justify="end"><n-button @click="picking = false">取消</n-button><n-button type="primary" @click="save">保存</n-button></n-space></template>
      </n-card>
    </n-modal>
  </div>
</template>

<style scoped>
.sc-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.sc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.sc-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 92px; padding: 12px; background: #fffdf8; border: 1px solid #efe7da; border-radius: 14px; cursor: pointer; font-size: 14px; color: inherit; }
.sc-tile:hover { background: #fdf6dc; }
.sc-sub { font-size: 12px; color: #8a7f70; margin-bottom: 4px; }
.sc-picked { margin-bottom: 10px; padding: 8px; background: #fdf6dc; border-radius: 8px; }
.sc-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 14px; }
.sc-list { max-height: 46vh; overflow-y: auto; }
.sc-group { margin: 10px 0 6px; font-size: 13px; font-weight: 600; color: #8a7f70; }
.sc-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
</style>
