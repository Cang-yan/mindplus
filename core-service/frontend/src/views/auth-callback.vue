<template>
  <div class="auth-callback-page">
    <a-spin v-if="state === 'loading'" :loading="true" tip="正在同步登录状态..." />
    <div v-else class="result-card">
      <p class="error-text">{{ errorMessage || '登录失败，请重试。' }}</p>
      <a-button type="primary" @click="goLogin">重新登录</a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import request from '@/utils/req'
import {
  MINDUSER_SERVICE_KEY,
  buildMindUserLoginUrl,
  clearMindPlusLocalAuth,
  parseMindUserCallbackQuery,
} from '@/utils/minduser-auth'

const route = useRoute()
const router = useRouter()

const state = ref<'loading' | 'error'>('loading')
const errorMessage = ref('')

function setLocalAuth(payload: { token: string; uid: string; username: string; role: string }) {
  localStorage.setItem('jwt_token', payload.token)
  localStorage.setItem('uid', payload.uid)
  localStorage.setItem('username', payload.username || payload.uid)
  localStorage.setItem('userRole', payload.role || 'user')
  if (!localStorage.getItem('userColor')) {
    localStorage.setItem('userColor', '#2563eb')
  }
}

async function verifySession() {
  const res = await request.get('/api/auth/me')
  const payload = res || {}
  if (payload?.code && payload.code !== 200) {
    throw new Error(payload?.message || '登录状态校验失败')
  }
  return payload?.data || null
}

function failWith(message: string) {
  clearMindPlusLocalAuth()
  state.value = 'error'
  errorMessage.value = message
}

function resolveCallbackErrorMessage(error: any): string {
  const status = Number(error?.response?.status || 0)
  const serverMessage = String(error?.response?.data?.message || '').trim()

  if (status === 401 || status === 403) {
    return serverMessage || '登录态校验失败，请重新登录。'
  }

  if (status >= 500) {
    return 'MindPlus 服务暂时不可用，请确认 AIPPT 后端已启动（frontend/server）。'
  }

  if (!error?.response) {
    return '无法连接 MindPlus 服务，请检查后端是否启动。'
  }

  return serverMessage || error?.message || '登录状态校验失败，请重新登录。'
}

async function handleAuthCallback() {
  const parsed = parseMindUserCallbackQuery(route.query as Record<string, unknown>)
  if (!parsed.token || !parsed.uid) {
    failWith('缺少 token 或 uid，无法完成登录。')
    return
  }
  if (parsed.service && parsed.service !== MINDUSER_SERVICE_KEY) {
    failWith(`服务不匹配：期望 ${MINDUSER_SERVICE_KEY}，实际 ${parsed.service}`)
    return
  }

  setLocalAuth({
    token: parsed.token,
    uid: parsed.uid,
    username: parsed.username,
    role: parsed.role,
  })

  try {
    const me = await verifySession()
    if (me?.username) {
      localStorage.setItem('username', me.username)
    }
    if (me?.role) {
      localStorage.setItem('userRole', me.role)
    }
    Message.success('登录成功')
    router.replace(parsed.redirect || '/')
  } catch (error: any) {
    failWith(resolveCallbackErrorMessage(error))
  }
}

function goLogin() {
  window.location.replace(buildMindUserLoginUrl('/'))
}

onMounted(() => {
  handleAuthCallback()
})
</script>

<style scoped>
.auth-callback-page {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.result-card {
  width: min(440px, 100%);
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.error-text {
  margin: 0;
  color: #b91c1c;
  text-align: center;
}
</style>
