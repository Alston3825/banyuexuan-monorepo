<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon, NLayout, NLayoutSider, NLayoutHeader, NLayoutContent, NMenu, NDropdown, NButton, NDrawer, NDrawerContent, NSpace, NBadge } from 'naive-ui'
import { Menu as MenuIcon, LogOutOutline, PersonCircleOutline, CreateOutline, NotificationsOutline, ColorPaletteOutline } from '@vicons/ionicons5'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import { useBreakpoint } from '../composables/useBreakpoint'
import { buildNavMenu } from './nav-menu'
import { THEMES, themeOf } from '../themes'
import MySignatureDialog from '../components/care/MySignatureDialog.vue'
import { mySignatureApi } from '../api/modules/care-sign.api'
import { dialog, message } from '../utils/discrete-api'
import { workspaceApi } from '../api/modules/workspace.api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const { breakpoint } = useBreakpoint()

const isDesktop = computed(() => breakpoint.value === 'desktop')
const selectedKey = computed(() => route.path)
// 按登录账号的权限动态算菜单，不是所有账号看到的都一样，见 layouts/nav-menu.ts
const navMenuOptions = computed(() => buildNavMenu(auth.hasAccess))

// 移动/平板端抽屉的显隐是纯临时 UI 状态，不持久化、不与桌面端的收起状态混用
const mobileDrawerVisible = ref(false)

// 登录后切到这个账号自己选的配色方案
ui.syncTheme(auth.account?.id)
const darkSider = computed(() => themeOf(ui.theme).darkSider)
const userMenuOptions = computed(() => [
  { label: '我的电子签名', key: 'signature', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) },
  { type: 'divider', key: 'd1' },
  // 配色方案直接平铺在菜单里（手机上点一下就能换，不用再展开二级菜单）
  ...THEMES.map((t) => ({
    label: `配色：${t.label}（${t.desc}）${ui.theme === t.key ? ' ✓' : ''}`,
    key: `theme:${t.key}`,
    icon: () => h(NIcon, null, { default: () => h(ColorPaletteOutline) }),
  })),
  { type: 'divider', key: 'd2' },
  { label: '退出登录', key: 'logout', icon: () => h(NIcon, null, { default: () => h(LogOutOutline) }) },
])

// ---------------- 待办小铃铛：有需要我处理的事就显示数量，超时的变红；每 60 秒刷新一次 ----------------
const todoTotal = ref(0)
const todoOverdue = ref(0)
let todoTimer: number | undefined
async function refreshTodoBadge(first = false) {
  try {
    const b = await workspaceApi.badge()
    todoTotal.value = b.total
    todoOverdue.value = b.overdue
    // 登录后第一次：弹一条提醒（每次登录只弹一次）
    if (first && b.total > 0 && !sessionStorage.getItem('todoPrompted')) {
      sessionStorage.setItem('todoPrompted', '1')
      message.warning(`您有 ${b.total} 项待办${b.overdue ? `，其中 ${b.overdue} 项已超时` : ''}，点右上角铃铛查看`, { duration: 8000, closable: true })
    }
  } catch {
    /* 取待办数量失败不影响使用 */
  }
}
onMounted(() => {
  refreshTodoBadge(true)
  todoTimer = window.setInterval(() => refreshTodoBadge(), 60_000)
})
onBeforeUnmount(() => window.clearInterval(todoTimer))

// 我的电子签名：护理师在护理档案里签字时选用，只需录入一次
const signatureVisible = ref(false)
onMounted(async () => {
  // 会在护理档案里签字的账号（有“修改母婴档案”权限）登录后，如果还没有电子签名，提醒一次（本次登录只提醒一次）
  if (!auth.hasAccess('care.profile.update') || sessionStorage.getItem('sigPrompted')) return
  try {
    if ((await mySignatureApi.get()).hasSignature) return
    sessionStorage.setItem('sigPrompted', '1')
    dialog.info({
      title: '请录入您的电子签名',
      content: '您在护理档案里需要签字（日常护理记录等）。现在用手指签一次名字，以后签字时直接选用，不用每次手写。',
      positiveText: '现在去录入',
      negativeText: '稍后再说',
      onPositiveClick: () => (signatureVisible.value = true),
    })
  } catch {
    /* 提醒失败不影响使用 */
  }
})

async function handleUserMenuSelect(key: string) {
  if (key === 'signature') signatureVisible.value = true
  if (key.startsWith('theme:')) ui.setTheme(key.slice(6), auth.account?.id)
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
      :inverted="darkSider"
      :bordered="!darkSider"
      collapse-mode="width"
      :collapsed-width="64"
      :width="220"
      :collapsed="ui.sidebarCollapsed"
      show-trigger
      @collapse="ui.sidebarCollapsed = true"
      @expand="ui.sidebarCollapsed = false"
    >
      <div class="brand bx-serif">{{ ui.sidebarCollapsed ? '伴' : '伴月轩' }}</div>
      <n-menu :inverted="darkSider" :value="selectedKey" :collapsed="ui.sidebarCollapsed" :collapsed-width="64" :options="navMenuOptions" />
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
          <span class="page-title bx-serif">{{ route.meta.title }}</span>
        </n-space>
        <n-space align="center" :size="18" :wrap="false">
          <n-badge :value="todoTotal" :max="99" :type="todoOverdue > 0 ? 'error' : 'warning'" :show="todoTotal > 0">
            <n-button quaternary circle title="我的待办" @click="router.push('/workspace/todos')">
              <template #icon><n-icon size="20"><NotificationsOutline /></n-icon></template>
            </n-button>
          </n-badge>
          <n-dropdown :options="userMenuOptions" @select="handleUserMenuSelect">
            <n-space align="center" class="user-entry" :wrap="false">
              <n-icon size="20"><PersonCircleOutline /></n-icon>
              <span>{{ auth.account?.realName }}</span>
            </n-space>
          </n-dropdown>
        </n-space>
      </n-layout-header>
      <n-layout-content class="content" :native-scrollbar="false">
        <router-view />
      </n-layout-content>
      <MySignatureDialog v-model:show="signatureVisible" />
    </n-layout>
  </n-layout>
</template>

<style scoped>
.brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--bx-brand);
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
  font-weight: 700;
  font-size: 18px;
}
.user-entry {
  cursor: pointer;
}
.content {
  padding: 16px;
}
</style>
