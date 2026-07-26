<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NCard, NList, NListItem, NThing, NTag } from 'naive-ui'
import { workflowDefinitionApi } from '../../api/modules/workflow-definition.api'
import type { WorkflowDefinition } from '../../api/types/workflow'

const definitions = ref<WorkflowDefinition[]>([])

onMounted(async () => {
  definitions.value = await workflowDefinitionApi.list()
})
</script>

<template>
  <n-card title="流程定义（只读）">
    <n-list v-for="def in definitions" :key="def.id" bordered style="margin-bottom: 16px">
      <template #header>
        <strong>{{ def.name }}</strong>
        <n-tag size="small" style="margin-left: 8px">{{ def.code }} v{{ def.version }}</n-tag>
      </template>
      <n-list-item v-for="node in def.nodes" :key="node.id">
        <n-thing :title="`第 ${node.seq} 节点：${node.name}`">
          <template #description>
            审批人类型：{{ node.approverType === 'ROLE' ? '按角色' : '按账号' }}
            <span v-if="node.approverRoleId"> — 角色 ID: {{ node.approverRoleId }}</span>
            <span v-if="node.approverAccountId"> — 账号 ID: {{ node.approverAccountId }}</span>
          </template>
        </n-thing>
      </n-list-item>
    </n-list>
  </n-card>
</template>
