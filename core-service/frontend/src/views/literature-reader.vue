<template>
  <div class="redirect-container">
    <div class="redirect-spinner">
      <div class="spinner-ring"></div>
      <p>正在进入文献阅读助手...</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  router.replace({ name: 'LiteratureEmbed', query: { entry: 'translation' } })
})
</script>

<style scoped>
.redirect-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
}
.redirect-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.spinner-ring {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.redirect-spinner p {
  font-size: 14px;
  color: #64748b;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
