<script setup lang="ts">
/** 纸质资料的照片缩略图（接口需要登录，所以用 blob 取图）；点击放大，PDF 点击在新窗口打开。 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { NImage, NImageGroup, NSpace } from 'naive-ui'
import { careDocumentApi } from '../../api/modules/care-archive.api'
import type { CareDocumentFile } from '../../api/types/care-archive'

const props = defineProps<{ documentId: string; files: Pick<CareDocumentFile, 'id' | 'fileName' | 'mimeType'>[]; width?: number }>()

const urls = ref<Record<string, string>>({})
const failed = ref(false)

function revokeAll() {
  Object.values(urls.value).forEach((u) => URL.revokeObjectURL(u))
  urls.value = {}
}

async function load() {
  revokeAll()
  failed.value = false
  try {
    const entries = await Promise.all(
      props.files.map(async (f) => [f.id, URL.createObjectURL(await careDocumentApi.fileBlob(props.documentId, f.id))] as const),
    )
    urls.value = Object.fromEntries(entries)
  } catch {
    failed.value = true
  }
}

async function openPdf(f: Pick<CareDocumentFile, 'id'>) {
  const url = urls.value[f.id] ?? URL.createObjectURL(await careDocumentApi.fileBlob(props.documentId, f.id))
  window.open(url, '_blank')
}

watch(() => [props.documentId, props.files.map((f) => f.id).join(',')], load, { immediate: true })
onBeforeUnmount(revokeAll)
</script>

<template>
  <div>
    <div v-if="failed" style="color: #b4533a; font-size: 13px">照片加载失败，请刷新页面重试</div>
    <n-image-group>
      <n-space vertical :size="8">
        <template v-for="f in files" :key="f.id">
          <a v-if="f.mimeType === 'application/pdf'" href="javascript:void(0)" @click="openPdf(f)">📄 {{ f.fileName }}（点击打开 PDF）</a>
          <n-image v-else-if="urls[f.id]" :src="urls[f.id]" :width="width ?? 360" :alt="f.fileName" object-fit="contain" />
          <div v-else style="color: #86817a; font-size: 12px">加载中…</div>
        </template>
      </n-space>
    </n-image-group>
  </div>
</template>
