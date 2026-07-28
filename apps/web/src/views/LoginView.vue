<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, type FormInst, type FormRules } from 'naive-ui'
import { useAuthStore } from '../stores/auth'
import { message } from '../utils/discrete-api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const model = ref({ username: '', password: '' })

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
  } catch {
    message.error('登录失败，请检查用户名和密码')
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
          <n-input v-model:value="model.username" placeholder="请输入用户名" />
        </n-form-item>
        <n-form-item label="密码" path="password">
          <n-input v-model:value="model.password" type="password" show-password-on="click" placeholder="请输入密码" />
        </n-form-item>
        <n-button type="primary" block :loading="loading" @click="handleSubmit">登录</n-button>
      </n-form>
    </n-card>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
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
