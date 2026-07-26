<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon, NLayout, NLayoutSider, NLayoutHeader, NLayoutContent, NMenu, NDropdown, NButton, NDrawer, NDrawerContent, NSpace } from 'naive-ui'
import { Menu as MenuIcon, LogOutOutline, PersonCircleOutline } from '@vicons/ionicons5'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import { useBreakpoint } from '../composables/useBreakpoint'
import { navMenuOptions } from './nav-menu'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const { breakpoint } = useBreakpoint()

const isDesktop = computed(() => breakpoint.value === 'desktop')
const selectedKey = computed(() => route.path)

// 移动/平板端抽屉的显隐是纯临时 UI 状态，不持久化、不与桌面端的收起状态混用
const mobileDrawerVisible = ref(false)

const userMenuOptions = [{ label: '退出登录', key: 'logout', icon: () => h(NIcon, null, { default: () => h(LogOutOutline) }) }]

async function handleUserMenuSelect(key: string) {
  if (key === 'logout') {
    await auth.logout()
    router.push('/login')
  }
}
</script>

<template>
  <n-layout style="height: 100vh" has-sider>
    <!-- 桌面端：常驻可收起侧边栏 -->
    <n-layout-sider
      v-if="isDesktop"
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="220"
      :collapsed="ui.sidebarCollapsed"
      show-trigger
      @collapse="ui.sidebarCollapsed = true"
      @expand="ui.sidebarCollapsed = false"
    >
      <div class="brand">{{ ui.sidebarCollapsed ? '伴' : '伴月轩管理后台' }}</div>
      <n-menu :value="selectedKey" :collapsed="ui.sidebarCollapsed" :collapsed-width="64" :options="navMenuOptions" />
    </n-layout-sider>

    <!-- 移动/平板端：抽屉式侧边栏，默认收起，靠顶栏汉堡按钮打开 -->
    <n-drawer v-else v-model:show="mobileDrawerVisible" placement="left" :width="240">
      <n-drawer-content title="伴月轩管理后台" :native-scrollbar="false">
        <n-menu :value="selectedKey" :options="navMenuOptions" @update:value="mobileDrawerVisible = false" />
      </n-drawer-content>
    </n-drawer>

    <n-layout>
      <n-layout-header bordered class="topbar">
        <n-space align="center">
          <n-button v-if="!isDesktop" quaternary circle @click="mobileDrawerVisible = true">
            <template #icon><n-icon><MenuIcon /></n-icon></template>
          </n-button>
          <span class="page-title">{{ route.meta.title }}</span>
        </n-space>
        <n-dropdown :options="userMenuOptions" @select="handleUserMenuSelect">
          <n-space align="center" class="user-entry" :wrap="false">
            <n-icon size="20"><PersonCircleOutline /></n-icon>
            <span>{{ auth.account?.realName }}</span>
          </n-space>
        </n-dropdown>
      </n-layout-header>
      <n-layout-content class="content" :native-scrollbar="false">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<style scoped>
.brand {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #1f3a5f;
  border-bottom: 1px solid #efeff5;
  white-space: nowrap;
  overflow: hidden;
}
.topbar {
  height: 56px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-title {
  font-weight: 600;
}
.user-entry {
  cursor: pointer;
}
.content {
  padding: 16px;
}
</style>
