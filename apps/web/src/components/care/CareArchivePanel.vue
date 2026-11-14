<script setup lang="ts">
/**
 * 母婴档案里“只拍照留档”的资料标签页（风险告知书 / 入住宣教 / 呛奶应急预案），一种资料一个标签。
 * 手机优先：一个大按钮拍照/选图上传；已上传的按次显示成卡片，缩略图可点开放大；可补拍；
 * 上传后原件永久保留（传错的在 24 小时内可以删除）。
 */
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NEmpty, NSpace, NSpin, NTag } from 'naive-ui'
import { careDocumentApi } from '../../api/modules/care-archive.api'
import { CARE_DOC_TYPE_LABEL, type CareDocType, type CareDocument } from '../../api/types/care-archive'
import { dialog, message } from '../../utils/discrete-api'
import CareDocImages from './CareDocImages.vue'

const props = defineProps<{ motherProfileId: string; docType: CareDocType; hint: string }>()

const docs = ref<CareDocument[]>([])
const loading = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const addInput = ref<HTMLInputElement | null>(null)
const addTarget = ref<string | null>(null)

const title = computed(() => CARE_DOC_TYPE_LABEL[props.docType])
const fmt = (iso: string) => new Date(iso).toLocaleString('zh-CN', { hour12: false })
const deletable = (d: CareDocument) => Date.now() - new Date(d.createdAt).getTime() < 24 * 3600 * 1000

async function load() {
  loading.value = true
  try {
    docs.value = await careDocumentApi.list({ motherProfileId: props.motherProfileId, docType: props.docType })
  } finally {
    loading.value = false
  }
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return
  uploading.value = true
  try {
    await careDocumentApi.upload(files, { docType: props.docType, motherProfileId: props.motherProfileId })
    message.success('已上传并归档')
    await load()
  } finally {
    uploading.value = false
  }
}

function startAdd(d: CareDocument) {
  addTarget.value = d.id
  addInput.value?.click()
}
async function onAdd(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0 || !addTarget.value) return
  uploading.value = true
  try {
    await careDocumentApi.addFiles(addTarget.value, files)
    message.success('已补充照片')
    await load()
  } finally {
    uploading.value = false
  }
}

function remove(d: CareDocument) {
  dialog.warning({
    title: '删除这次上传的资料？',
    content: '只有上传后 24 小时内才能删除（防止传错），删除后不能恢复。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await careDocumentApi.remove(d.id)
      message.success('已删除')
      await load()
    },
  })
}

onMounted(load)
</script>

<template>
  <n-spin :show="loading">
    <n-card size="small" :title="title" style="margin-bottom: 14px">
      <template #header-extra>
        <n-tag v-if="docs.length > 0" type="success" size="small" round>已上传 {{ docs.length }} 次</n-tag>
        <n-tag v-else type="warning" size="small" round>尚未上传</n-tag>
      </template>
      <p class="ap-hint">{{ hint }}</p>
      <input ref="fileInput" type="file" multiple accept="image/*,application/pdf,.heic,.heif" style="display: none" @change="onPick" />
      <input ref="addInput" type="file" multiple accept="image/*,application/pdf,.heic,.heif" style="display: none" @change="onAdd" />
      <n-button type="primary" size="large" block :loading="uploading" @click="fileInput?.click()">📷 拍照 / 选择照片上传</n-button>
      <div class="ap-sub">多页资料请一次选多张；苹果手机照片可直接上传。上传后原件永久保留。</div>
    </n-card>

    <n-space vertical :size="12">
      <n-card v-for="d in docs" :key="d.id" size="small">
        <template #header>
          <span class="ap-time">{{ fmt(d.createdAt) }} 上传</span>
          <span class="ap-pages">· {{ d.files.length }} 页</span>
        </template>
        <template #header-extra>
          <n-space :size="6">
            <n-button size="small" :disabled="uploading" @click="startAdd(d)">补拍</n-button>
            <n-button v-if="deletable(d)" size="small" type="error" ghost @click="remove(d)">删除</n-button>
          </n-space>
        </template>
        <div class="ap-thumbs"><CareDocImages :document-id="d.id" :files="d.files" :width="150" /></div>
      </n-card>
      <n-empty v-if="!loading && docs.length === 0" description="还没有上传，点上面的按钮开始" />
    </n-space>
  </n-spin>
</template>

<style scoped>
.ap-hint {
  margin: 0 0 10px;
  color: var(--c-666666);
  font-size: 13px;
  line-height: 1.6;
}
.ap-sub {
  margin-top: 8px;
  color: var(--c-999999);
  font-size: 12px;
}
.ap-time {
  font-size: 14px;
}
.ap-pages {
  color: var(--c-888888);
  font-size: 12px;
}
.ap-thumbs :deep(.n-space) {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap;
  gap: 8px !important;
}
</style>
