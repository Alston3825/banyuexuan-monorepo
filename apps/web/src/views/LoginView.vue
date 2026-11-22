<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AxiosError } from 'axios'
import { useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NButton, type FormInst, type FormRules } from 'naive-ui'
import { useAuthStore } from '../stores/auth'
import { message } from '../utils/discrete-api'
import BeianFooter from '../components/BeianFooter.vue'
import BxTheme from '../components/BxTheme.vue'

const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const model = ref({ username: '', password: '' })

// 防浏览器“记住密码”自动填充：Chrome 会无视 autocomplete="off"，把保存的管理员账号密码填回来（甚至在点登录后再次覆盖）。
// 办法：① 密码框不用 type=password（改用 CSS 圆点遮盖），浏览器就不把它当密码框；
//       ② 两个框先设为只读，用户点进去才解除只读（浏览器不会往只读框里填）；③ 每次打开页面用随机的 name。
const rnd = Math.random().toString(36).slice(2, 8)
const showPwd = ref(false)
const userReadonly = ref(true)
const passReadonly = ref(true)
const userProps = computed(() => ({ name: `u_${rnd}`, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, readonly: userReadonly.value, onFocus: () => (userReadonly.value = false), onPointerdown: () => (userReadonly.value = false) }))
const passProps = computed(() => ({
  name: `p_${rnd}`,
  type: 'text',
  autocomplete: 'off',
  autocapitalize: 'off',
  spellcheck: false,
  readonly: passReadonly.value,
  onFocus: () => (passReadonly.value = false),
  onPointerdown: () => (passReadonly.value = false),
  style: showPwd.value ? '' : '-webkit-text-security: disc; text-security: disc;',
}))

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleSubmit() {
  await formRef.value?.validate()
  loading.value = true
  try {
    await auth.login(model.value.username, model.value.password)
    await router.replace('/workspace/todos?tab=reminder')
  } catch (e) {
    // 密码只清密码框，用户名留着方便重输；有后端给的具体原因（如账号已停用）就直接显示
    const serverMsg = (e as AxiosError<{ message?: string | string[] }>).response?.data?.message
    message.error((Array.isArray(serverMsg) ? serverMsg.join('，') : serverMsg) || '登录失败，请检查用户名和密码')
    model.value.password = ''
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <BxTheme bare>
    <div class="lg">
      <section class="lg-art" aria-hidden="true">
        <!-- 一只手托着一弯月亮：伴月。粗马克笔线 + 米白剪纸色块 -->
        <svg viewBox="0 0 400 400" class="lg-svg">
          <path d="M212 66c-44 6-78 44-77 90 1 50 42 89 92 87 30-1 56-17 71-41-13 6-27 9-42 7-42-5-72-43-67-85 3-23 11-43 23-58z" fill="#F7F5EF" stroke="#161615" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" />
          <path d="M318 96l1 22M307 107l23 1" stroke="#161615" stroke-width="7" stroke-linecap="round" fill="none" />
          <path d="M70 318c22-14 44-22 70-21 30 2 52 14 84 13 22-1 40-8 54-20 10-9 25-8 31 1 6 9 2 20-8 28-26 22-58 36-94 39-34 3-62-6-92-4-16 1-30 5-43 12" fill="none" stroke="#161615" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M148 298c14-10 32-14 50-12 16 2 28 9 30 18" fill="none" stroke="#161615" stroke-width="9" stroke-linecap="round" />
          <circle cx="92" cy="120" r="9" fill="#F7F5EF" />
          <rect x="300" y="226" width="20" height="14" rx="2" transform="rotate(-8 310 233)" fill="#161615" />
        </svg>
        <p class="lg-motto bx-serif">月子里的每一天，都有人用心记着。</p>
      </section>
      <section class="lg-form">
        <h1 class="bx-serif">伴月轩</h1>
        <p class="lg-sub">月子中心管理系统</p>
        <n-form ref="formRef" :model="model" :rules="rules" size="large" @keyup.enter="handleSubmit">
          <n-form-item label="用户名" path="username">
            <!-- 关掉浏览器的“记住密码自动填充”：多人轮流用同一台电脑登录时，浏览器会把之前保存的管理员账号密码填回来，覆盖刚输入的内容 -->
            <n-input v-model:value="model.username" placeholder="请输入用户名（手机号）" :input-props="userProps" />
          </n-form-item>
          <n-form-item label="密码" path="password">
            <n-input v-model:value="model.password" placeholder="请输入密码" :input-props="passProps">
              <template #suffix><a class="lg-eye" @click="showPwd = !showPwd">{{ showPwd ? '隐藏' : '显示' }}</a></template>
            </n-input>
          </n-form-item>
          <n-button type="primary" block size="large" :loading="loading" @click="handleSubmit">登录</n-button>
        </n-form>
        <BeianFooter class="lg-beian" />
      </section>
    </div>
  </BxTheme>
</template>

<style scoped>
.lg { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; background: var(--bx-paper); font-family: var(--bx-sans); color: var(--bx-ink); }
.lg-art { background: var(--bx-hero); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; }
.lg-svg { width: min(360px, 70%); height: auto; }
.lg-motto { margin-top: 28px; font-size: 20px; letter-spacing: 1px; color: var(--bx-ink); text-align: center; }
.lg-form { display: flex; flex-direction: column; justify-content: center; padding: 40px clamp(24px, 8vw, 96px); max-width: 560px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.lg-form h1 { margin: 0; font-size: 40px; font-weight: 700; letter-spacing: 4px; }
.lg-sub { margin: 8px 0 36px; color: var(--bx-gray); font-size: 15px; }
.lg-eye { cursor: pointer; color: var(--bx-gray); font-size: 12px; user-select: none; }
.lg-beian { margin-top: 40px; }
@media (max-width: 767px) {
  .lg { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .lg-art { padding: 28px 20px 22px; }
  .lg-svg { width: 150px; }
  .lg-motto { margin-top: 12px; font-size: 15px; }
  .lg-form { padding: 28px 20px; justify-content: flex-start; }
  .lg-form h1 { font-size: 30px; }
  .lg-sub { margin-bottom: 24px; }
}
</style>
