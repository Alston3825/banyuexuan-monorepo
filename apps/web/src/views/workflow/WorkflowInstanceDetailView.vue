<script setup lang="ts">
/** 审批详情：谁提交的、审到哪一步、各人意见；待审批人在这里直接通过/驳回。 */
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NSpace } from 'naive-ui'
import ApprovalProgress from '../../components/workflow/ApprovalProgress.vue'
import type { WorkflowProgress } from '../../api/types/workflow'

const route = useRoute()
const router = useRouter()
const instanceId = route.params.id as string
const info = ref<WorkflowProgress | null>(null)
</script>

<template>
  <n-card :title="info ? `${info.businessLabel}：${info.title}` : '审批详情'" style="max-width: 860px">
    <template #header-extra>
      <n-space>
        <n-button size="small" @click="router.back()">返回</n-button>
        <n-button v-if="info?.businessPath" size="small" type="primary" secondary @click="router.push(info!.businessPath!)">去看{{ info.businessLabel }}</n-button>
      </n-space>
    </template>
    <ApprovalProgress :instance-id="instanceId" @loaded="(p) => (info = p)" />
  </n-card>
</template>
