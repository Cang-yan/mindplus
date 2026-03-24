<template>
  <div class="auth-bridge-page" role="status" aria-live="polite">
    <a-spin :loading="true" tip="正在跳转到会员系统..." />
    <p class="hint" v-if="targetUrl">
      若未自动跳转，请
      <a :href="targetUrl">点击这里继续</a>
    </p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { buildMindUserLoginUrl, normalizeAppRedirectPath } from '@/utils/minduser-auth'

const route = useRoute()
const targetUrl = ref('')

onMounted(() => {
  const redirectPath = normalizeAppRedirectPath(route.query.redirect)
  const url = buildMindUserLoginUrl(redirectPath)
  targetUrl.value = url
  window.location.replace(url)
})
</script>

<style scoped>
.auth-bridge-page {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.hint {
  margin: 0;
  font-size: 14px;
  color: #64748b;
}

.hint a {
  color: #2563eb;
}
</style>
