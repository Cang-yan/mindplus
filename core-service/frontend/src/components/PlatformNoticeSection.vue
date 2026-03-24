<template>
  <section class="platform-notice-section">
    <header class="notice-header">
      <h2>平台通知</h2>
      <p>以下通知由平台运营发布，供全体用户参考。</p>
    </header>

    <div v-if="loading" class="notice-state">正在加载通知...</div>
    <div v-else-if="errorText" class="notice-state error">{{ errorText }}</div>
    <ul v-else-if="noticeItems.length" class="notice-list">
      <li v-for="notice in noticeItems" :key="notice.id" class="notice-item">
        <div class="notice-meta">
          <h3>{{ notice.title || '平台通知' }}</h3>
          <span v-if="notice.pinned" class="notice-tag">置顶</span>
          <time>{{ formatNoticeTime(notice.updatedAt || notice.createdAt) }}</time>
        </div>
        <p class="notice-content">{{ notice.content }}</p>
      </li>
    </ul>
    <div v-else class="notice-state">暂无平台通知</div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { listPublicNotices } from '@/api/notices'

const loading = ref(false)
const errorText = ref('')
const noticeItems = ref([])

function parseToDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const normalized = text.includes('T') ? text : text.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isFinite(date.getTime()) ? date : null
}

function formatNoticeTime(value) {
  const date = parseToDate(value)
  if (!date) return ''
  return date.toLocaleString()
}

async function loadNotices() {
  loading.value = true
  errorText.value = ''
  try {
    noticeItems.value = await listPublicNotices(10)
  } catch (error) {
    console.error('load notices failed', error)
    errorText.value = String(error && error.message ? error.message : '通知加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadNotices()
})
</script>

<style scoped>
.platform-notice-section {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
}

.notice-header h2 {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
}

.notice-header p {
  margin: 8px 0 0;
  font-size: 13px;
  color: #64748b;
}

.notice-state {
  margin-top: 16px;
  font-size: 13px;
  color: #64748b;
}

.notice-state.error {
  color: #b42318;
}

.notice-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.notice-item {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  background: #f8fafc;
}

.notice-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.notice-meta h3 {
  margin: 0;
  font-size: 15px;
  color: #0f172a;
}

.notice-meta time {
  margin-left: auto;
  font-size: 12px;
  color: #64748b;
}

.notice-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: #ffedd5;
  color: #b45309;
  font-size: 12px;
  font-weight: 600;
}

.notice-content {
  margin: 10px 0 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-line;
}

@media (max-width: 768px) {
  .platform-notice-section {
    padding: 16px;
  }

  .notice-meta time {
    margin-left: 0;
    width: 100%;
  }
}
</style>
