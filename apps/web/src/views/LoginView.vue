<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AxiosError } from 'axios'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, type FormInst, type FormRules } from 'naive-ui'
import { useAuthStore } from '../stores/auth'
import { message } from '../utils/discrete-api'
import BeianFooter from '../components/BeianFooter.vue'

const route = useRoute()
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
    const redirect = (route.query.redirect as string) || '/crm/customers'
    router.push(redirect)
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
  <div class="login-page">
    <n-card title="伴月轩月子中心管理系统" class="login-card">
      <n-form ref="formRef" :model="model" :rules="rules" @keyup.enter="handleSubmit">
        <n-form-item label="用户名" path="username">
          <!-- 关掉浏览器的“记住密码自动填充”：多人轮流用同一台电脑登录时，浏览器会把之前保存的管理员账号密码填回来，覆盖刚输入的内容 -->
          <n-input v-model:value="model.username" placeholder="请输入用户名（手机号）" :input-props="userProps" />
        </n-form-item>
        <n-form-item label="密码" path="password">
          <n-input v-model:value="model.password" placeholder="请输入密码" :input-props="passProps">
            <template #suffix><a style="cursor: pointer; color: #999; font-size: 12px; user-select: none" @click="showPwd = !showPwd">{{ showPwd ? '隐藏' : '显示' }}</a></template>
          </n-input>
        </n-form-item>
        <n-button type="primary" block :loading="loading" @click="handleSubmit">登录</n-button>
      </n-form>
    </n-card>
    <BeianFooter />
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f6f8;
  padding: 16px;
}
.login-card {
  width: 100%;
  max-width: 360px;
}
</style>
