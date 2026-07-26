<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NTree, NCard, type TreeOption } from 'naive-ui'
import { permissionApi } from '../../api/modules/permission.api'
import { buildPermissionTree } from '../../utils/permission-tree'
import type { PermissionPoint } from '../../api/types/permission'

const catalog = ref<PermissionPoint[]>([])
const tree = computed(() => buildPermissionTree(catalog.value) as unknown as TreeOption[])

onMounted(async () => {
  catalog.value = await permissionApi.list()
})
</script>

<template>
  <n-card title="权限目录（只读）">
    <n-tree :data="tree" key-field="id" label-field="name" children-field="children" :selectable="false" default-expand-all />
  </n-card>
</template>
