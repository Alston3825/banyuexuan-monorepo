<script setup lang="ts">
/**
 * “我的电子签名”：员工自己在手机/平板/电脑上手写签一次，之后在护理档案里签字时直接选用，
 * 不用每次再手写。换签名随时可以重新录入（以前已经签过的记录里，保留的是当时的签名图）。
 */
import { ref, watch } from 'vue'
import { NButton, NCard, NModal, NSpace } from 'naive-ui'
import { mySignatureApi } from '../../api/modules/care-sign.api'
import { message } from '../../utils/discrete-api'
import SignaturePad from './SignaturePad.vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean]; saved: [] }>()

const current = ref<string | null>(null)
const pad = ref<InstanceType<typeof SignaturePad> | null>(null)
const hasInk = ref(false)
const saving = ref(false)
const loading = ref(false)

watch(
  () => props.show,
  async (v) => {
    if (!v) return
    hasInk.value = false
    loading.value = true
    try {
      current.value = (await mySignatureApi.get()).signatureData
    } finally {
      loading.value = false
    }
  },
)

async function save() {
  const img = pad.value?.toPng()
  if (!img) return void message.warning('请在框里签上完整的名字')
  saving.value = true
  try {
    await mySignatureApi.set(img)
    message.success('电子签名已保存，以后签字时直接选用即可')
    emit('saved')
    emit('update:show', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal :show="show" :mask-closable="false" @update:show="(v) => emit('update:show', v)">
    <n-card title="我的电子签名" style="width: min(520px, 96vw)" :bordered="false" role="dialog" aria-modal="true" closable @close="emit('update:show', false)">
      <div v-if="current" class="ms-cur">
        <div class="ms-label">当前使用的签名</div>
        <img :src="current" alt="当前签名" class="ms-img" />
      </div>
      <div class="ms-label">{{ current ? '重新签名（会替换上面这个）' : '请用手指（或鼠标）在下面签上您的名字，只需录入一次' }}</div>
      <SignaturePad v-if="show" ref="pad" :height="190" @change="(v) => (hasInk = v)" />
      <div class="ms-tip">签名图会用在您签字的日常护理记录等档案上，并连同签字时间一起留存。请签得清晰、完整，字尽量占满框。</div>
      <template #footer>
        <n-space justify="end">
          <n-button @click="pad?.clear()">清除重写</n-button>
          <n-button @click="emit('update:show', false)">稍后再说</n-button>
          <n-button type="primary" :disabled="!hasInk || loading" :loading="saving" @click="save">保存签名</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.ms-label {
  margin: 6px 0;
  color: var(--c-555555);
  font-size: 13px;
}
.ms-cur {
  margin-bottom: 10px;
  padding: 8px;
  border-radius: 8px;
  background: var(--c-f6f8fb);
}
.ms-img {
  display: block;
  max-height: 70px;
  max-width: 100%;
}
.ms-tip {
  margin-top: 8px;
  color: var(--c-999999);
  font-size: 12px;
}
</style>
