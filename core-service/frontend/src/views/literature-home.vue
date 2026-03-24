<template>
  <main class="literature-home-page">
    <section class="section">
      <div class="quick-actions-grid">
        <article class="action-card primary" @click="goTranslationWorkspace">
          <div class="card-decoration"></div>
          <div class="card-content">
            <div class="card-icon primary-icon">
              <Icon name="document-text" :size="28" />
            </div>
            <div class="card-header">
              <h3 class="card-title">文献智能翻译</h3>
              <span class="ai-badge">AI</span>
            </div>
            <p class="card-description">OCR 文档解析、翻译与术语处理的一体化工作流。</p>
            <div class="card-action">
              <span>立即进入</span>
              <Icon name="arrow-right" :size="16" />
            </div>
          </div>
        </article>

        <article class="action-card assistant" @click.stop.prevent="goAssistantWorkspace">
          <div class="card-decoration"></div>
          <div class="card-content">
            <div class="card-icon assistant-icon">
              <Icon name="home-magic-wand" :size="28" />
            </div>
            <div class="card-header">
              <h3 class="card-title">文献辅助编撰</h3>
              <span class="ai-badge">AI</span>
            </div>
            <p class="card-description">进入 AI 助手完成问答、总结、结构化提炼与辅助写作。</p>
            <div class="card-action">
              <span>立即进入</span>
              <Icon name="arrow-right" :size="16" />
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="works-header">
        <div class="title-wrap">
          <h2 class="section-title">我的作品</h2>
          <span class="works-counter">{{ worksCounterText }}</span>
        </div>

        <div class="works-controls">
          <div class="work-filters">
            <button
              type="button"
              class="filter-btn"
              :class="{ active: activeType === 'translation' }"
              @click="activeType = 'translation'"
            >
              文献智能翻译
            </button>
            <button
              type="button"
              class="filter-btn"
              :class="{ active: activeType === 'assistant' }"
              @click="activeType = 'assistant'"
            >
              文献辅助编撰
            </button>
          </div>

          <div v-if="totalPages > 1" class="works-pagination">
            <button
              type="button"
              class="page-btn"
              :disabled="currentPage <= 1"
              @click="prevPage"
            >
              上一页
            </button>
            <span class="page-text">{{ currentPage }}/{{ totalPages }}</span>
            <button
              type="button"
              class="page-btn"
              :disabled="currentPage >= totalPages"
              @click="nextPage"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="loading-state">
        <Icon name="loading" :size="32" />
        <p>正在加载作品记录...</p>
      </div>
      <div v-else-if="currentWorks.length === 0" class="no-works-state">
        <div class="empty-icon">
          <Icon name="folder-open" :size="48" />
        </div>
        <p class="empty-text">当前分类下暂无历史记录</p>
        <button class="create-first-button" type="button" @click="createNewWorkByType">
          <Icon name="add-circle" :size="20" />
          <span>创建首个作品</span>
        </button>
      </div>
      <div v-else class="works-grid">
        <div
          v-for="work in displayWorks"
          :key="work.id"
          class="work-item"
          :class="{ disabled: !canOpenWork(work) }"
          @click="handleWorkCardClick(work)"
        >
          <div class="work-thumbnail">
            <div class="thumbnail-content">
              <div class="thumbnail-subtitle">{{ work.subtitle }}</div>
              <div class="thumbnail-title">{{ work.title }}</div>
            </div>
            <div class="work-overlay"></div>
          </div>
          <div class="work-info">
            <h3 class="work-title">{{ work.title }}</h3>
            <div class="work-meta">
              <span class="work-time">{{ formatTime(work.timestamp) }}</span>
              <a-dropdown trigger="click" position="bl">
                <button class="work-menu-button" type="button" @click.stop>
                  <Icon name="menu-dots" :size="16" />
                </button>
                <template #content>
                  <a-doption
                    class="work-menu-delete-option"
                    @click.stop="handleDeleteWork(work)"
                  >
                    删除
                  </a-doption>
                </template>
              </a-dropdown>
            </div>
          </div>
        </div>

        <div class="work-item empty-state" @click="createNewWorkByType">
          <div class="empty-icon">
            <Icon name="add-circle" :size="48" />
          </div>
          <p class="empty-text">创建新作品</p>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import IIcon from '@/utils/slide/icon.js'
import { Message } from '@arco-design/web-vue'
import {
  deleteLiteratureAssistantHistory,
  deleteLiteratureResult,
  listLiteratureHistory,
} from '@/api/literature'
import { request } from '@/utils/req'

const Icon = IIcon
const router = useRouter()
const MAX_WORKS = 10
const GRID_ROWS = 2
const ASSISTANT_DELETED_JOBS_STORAGE_KEY = 'literature_home_deleted_assistant_jobs_v1'

const activeType = ref('translation')
const loading = ref(false)
const translationWorks = ref([])
const assistantWorks = ref([])
const deletingWorkId = ref('')
const currentPage = ref(1)
const gridColumns = ref(4)
const deletedAssistantJobIds = ref(loadDeletedAssistantJobIds())

const deletedAssistantJobIdSet = computed(() => new Set(deletedAssistantJobIds.value))
const FAILED_ASSISTANT_STATUSES = new Set(['error', 'failed'])

const currentWorks = computed(() => {
  if (activeType.value === 'assistant') {
    return assistantWorks.value.filter(item => !deletedAssistantJobIdSet.value.has(String(item.recordId || item.id)))
  }
  return translationWorks.value
})

const worksPerPage = computed(() => {
  const slots = Math.max(1, gridColumns.value * GRID_ROWS)
  return Math.max(1, slots - 1)
})

const totalPages = computed(() => Math.max(1, Math.ceil(currentWorks.value.length / worksPerPage.value)))

const displayWorks = computed(() => {
  const page = Math.max(1, Math.min(currentPage.value, totalPages.value))
  const start = (page - 1) * worksPerPage.value
  const end = start + worksPerPage.value
  return currentWorks.value.slice(start, end)
})

const worksCounterText = computed(() => `${currentWorks.value.length}/${MAX_WORKS}`)

function loadDeletedAssistantJobIds() {
  try {
    const text = localStorage.getItem(ASSISTANT_DELETED_JOBS_STORAGE_KEY) || '[]'
    const raw = JSON.parse(text)
    if (!Array.isArray(raw)) return []
    return raw.map(item => String(item || '').trim()).filter(Boolean).slice(0, 200)
  } catch {
    return []
  }
}

function persistDeletedAssistantJobIds() {
  try {
    localStorage.setItem(ASSISTANT_DELETED_JOBS_STORAGE_KEY, JSON.stringify(deletedAssistantJobIds.value))
  } catch {
    // ignore
  }
}

function markAssistantJobDeleted(jobId) {
  const safeJobId = String(jobId || '').trim()
  if (!safeJobId) return
  if (deletedAssistantJobIdSet.value.has(safeJobId)) return
  deletedAssistantJobIds.value = [...deletedAssistantJobIds.value, safeJobId]
  persistDeletedAssistantJobIds()
}

function formatTime(timestamp) {
  if (!timestamp) return '刚刚'
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 30) return `${days} 天前`
  return new Date(timestamp).toLocaleDateString()
}

function normalizeOpenDraftWork(job) {
  const jobId = String(job?.id || job?.job_id || '').trim()
  if (!jobId) return null

  const status = String(job?.status || '').trim().toLowerCase()
  const statusMap = {
    pending: '排队中',
    queued: '排队中',
    running: '执行中',
    success: '已完成',
    done: '已完成',
    failed: '失败',
    error: '失败',
    cancelled: '已取消',
    outline_review: '等待审阅',
    chapter_review: '等待审阅',
  }
  const updatedAtRaw = job?.updatedAt || job?.createdAt || job?.updated_at || job?.created_at || ''
  const updatedAtText = String(updatedAtRaw || '').trim()
  let timestamp = Number.isFinite(new Date(updatedAtText).getTime())
    ? new Date(updatedAtText).getTime()
    : Date.now()

  if ((!updatedAtText || Number.isNaN(timestamp)) && Number.isFinite(Number(updatedAtRaw))) {
    const epoch = Number(updatedAtRaw)
    const millis = epoch > 1_000_000_000_000 ? epoch : epoch * 1000
    timestamp = Number.isFinite(millis) ? millis : Date.now()
  }

  const progressFallback = status === 'done'
    ? 100
    : (status === 'error' ? 100 : (status === 'running' ? 60 : 0))
  const progress = Number(job?.progress ?? progressFallback)
  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.floor(progress))) : 0
  const statusText = statusMap[status] || '排队中'

  return {
    id: jobId,
    sourceType: 'assistant',
    recordId: jobId,
    docId: jobId,
    jobId,
    jobStatus: status,
    title: String(job?.topic || '未命名编撰任务'),
    subtitle: `${statusText} · 进度 ${safeProgress}%`,
    timestamp,
    raw: job,
  }
}

function isAssistantFailedWork(work) {
  if (!work || String(work.sourceType || '').trim() !== 'assistant') return false
  const status = String(work.jobStatus || '').trim().toLowerCase()
  return FAILED_ASSISTANT_STATUSES.has(status)
}

async function refreshTranslationWorks() {
  const translation = await listLiteratureHistory('translation')
  translationWorks.value = translation
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_WORKS)
}

async function refreshAssistantWorks() {
  const uid = String(localStorage.getItem('uid') || '').trim()
  const response = await request.get('/api/opendraft/papers', {
    params: uid ? { uid } : {},
  })
  const papers = Array.isArray(response)
    ? response
    : (Array.isArray(response?.data) ? response.data : [])

  const visiblePapers = papers.filter((paper) => {
    const ownerUid = String(paper?.uid || paper?.user_id || paper?.owner_uid || '').trim()
    if (!ownerUid || !uid) return true
    return ownerUid === uid
  })

  const normalizedAssistantWorks = visiblePapers
    .map(normalizeOpenDraftWork)
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp)

  const visibleAssistantWorks = normalizedAssistantWorks
    .filter(item => !deletedAssistantJobIdSet.value.has(String(item.recordId || item.id)))

  const collapsedAssistantWorks = []
  let failedShown = false
  for (const item of visibleAssistantWorks) {
    if (isAssistantFailedWork(item)) {
      if (failedShown) continue
      failedShown = true
    }
    collapsedAssistantWorks.push(item)
  }

  if (collapsedAssistantWorks.length > MAX_WORKS) {
    collapsedAssistantWorks
      .slice(MAX_WORKS)
      .forEach(item => markAssistantJobDeleted(item.recordId || item.id))
  }

  assistantWorks.value = collapsedAssistantWorks.slice(0, MAX_WORKS)
}

async function refreshWorks(type = activeType.value) {
  loading.value = true
  try {
    if (type === 'assistant') {
      await refreshAssistantWorks()
    } else {
      await refreshTranslationWorks()
    }
  } catch (error) {
    console.error('Failed to load literature works:', error)
    Message.error('加载文献作品记录失败')
  } finally {
    loading.value = false
  }
}

function goTranslationWorkspace() {
  router.push({ name: 'LiteratureEmbed', query: { entry: 'translation' } })
}

function openAssistantWorkspaceInNewTab(query = {}) {
  const target = router.resolve({
    name: 'LiteratureAssistantStandalone',
    query,
  })
  const newTab = window.open(target.href, '_blank')
  if (newTab) {
    try {
      newTab.opener = null
    } catch {
      // ignore
    }
    return
  }
  Message.warning('浏览器拦截了新标签页，请允许弹窗后重试')
}

function goAssistantWorkspace() {
  openAssistantWorkspaceInNewTab({ fresh: '1' })
}

function createNewWorkByType() {
  if (activeType.value === 'assistant') {
    goAssistantWorkspace()
    return
  }
  goTranslationWorkspace()
}

async function handleDeleteTranslationWork(work) {
  const targetId = String(work.recordId || work.id || '').trim()
  if (!targetId || deletingWorkId.value === targetId) return

  try {
    deletingWorkId.value = targetId
    await deleteLiteratureResult(targetId, 'translation')
    translationWorks.value = translationWorks.value.filter(item => String(item.recordId || item.id) !== targetId)
    Message.success('删除成功')
  } catch (error) {
    console.error('Failed to delete translation work:', error)
    Message.error('删除失败')
  } finally {
    deletingWorkId.value = ''
  }
}

async function handleDeleteAssistantWork(work) {
  const targetId = String(work.jobId || work.recordId || work.docId || work.id || '').trim()
  if (!targetId || deletingWorkId.value === targetId) return

  try {
    deletingWorkId.value = targetId
    const uid = String(localStorage.getItem('uid') || '').trim()

    await request.delete(`/api/opendraft/papers/${encodeURIComponent(targetId)}`, {
      params: uid ? { uid } : {},
    })

    try {
      await deleteLiteratureAssistantHistory(targetId)
    } catch (historyError) {
      console.warn('delete assistant history failed:', historyError)
    }

    markAssistantJobDeleted(targetId)
    assistantWorks.value = assistantWorks.value.filter(item => String(item.recordId || item.id) !== targetId)
    Message.success('删除成功')
  } catch (error) {
    console.error('Failed to delete assistant work:', error)
    Message.error('删除失败')
  } finally {
    deletingWorkId.value = ''
  }
}

async function handleDeleteWork(work) {
  if (!work) return
  if (work.sourceType === 'assistant') {
    await handleDeleteAssistantWork(work)
    return
  }
  await handleDeleteTranslationWork(work)
}

function openWork(work) {
  if (!work) return
  if (!canOpenWork(work)) return
  if (work.sourceType === 'assistant') {
    const jobId = String(work.jobId || work.recordId || work.docId || '').trim()
    const nextQuery = jobId ? { jobId } : {}
    openAssistantWorkspaceInNewTab(nextQuery)
    return
  }
  router.push({
    name: 'LiteratureEmbed',
    query: {
      entry: 'translation',
      recordId: work.recordId,
      openDetail: '1',
    },
  })
}

function canOpenWork(work) {
  return !isAssistantFailedWork(work)
}

function handleWorkCardClick(work) {
  if (!canOpenWork(work)) return
  openWork(work)
}

function resolveGridColumns() {
  const width = window.innerWidth
  if (width <= 768) return 1
  if (width <= 960) return 2
  if (width <= 1536) return 3
  return 4
}

function updateGridColumns() {
  gridColumns.value = resolveGridColumns()
}

function prevPage() {
  currentPage.value = Math.max(1, currentPage.value - 1)
}

function nextPage() {
  currentPage.value = Math.min(totalPages.value, currentPage.value + 1)
}

function handleWindowFocus() {
  void refreshWorks(activeType.value)
}

watch(activeType, (nextType) => {
  currentPage.value = 1
  void refreshWorks(nextType)
})

watch(
  () => [currentWorks.value.length, worksPerPage.value],
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
    if (currentPage.value <= 0) {
      currentPage.value = 1
    }
  }
)

onMounted(() => {
  updateGridColumns()
  void refreshWorks(activeType.value)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('resize', updateGridColumns)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('resize', updateGridColumns)
})
</script>

<style scoped>
.literature-home-page {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  background: #f8fafc;
}

.section {
  margin-bottom: 32px;
}

.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.action-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.action-card.primary {
  background: linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%);
}

.action-card.assistant {
  background: linear-gradient(135deg, #f0f9ff 0%, #ecfeff 100%);
}

.action-card:hover {
  border-color: #2563eb;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

.card-decoration {
  position: absolute;
  top: 0;
  right: 0;
  width: 128px;
  height: 128px;
  background: linear-gradient(135deg, rgba(147, 51, 234, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%);
  border-radius: 50%;
  margin-right: -64px;
  margin-top: -64px;
}

.card-content {
  position: relative;
  z-index: 1;
}

.card-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  color: white;
}

.primary-icon {
  background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
}

.assistant-icon {
  background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.card-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.ai-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #6d28d9;
  background: rgba(237, 233, 254, 0.9);
}

.card-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: #475569;
}

.card-action {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #2563eb;
  font-weight: 600;
  font-size: 13px;
}

.works-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
}

.title-wrap {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.section-title {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.works-counter {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.works-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.work-filters {
  display: flex;
  gap: 8px;
}

.filter-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn.active {
  border-color: transparent;
  color: #fff;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.2);
}

.works-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-btn {
  border: 1px solid #d0d7e2;
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: #2563eb;
  color: #1d4ed8;
}

.page-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.page-text {
  min-width: 52px;
  text-align: center;
  font-size: 12px;
  color: #64748b;
}

.works-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.work-item {
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.work-item:hover {
  border-color: #2563eb;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

.work-item.disabled {
  cursor: not-allowed;
  opacity: 0.82;
}

.work-item.disabled:hover {
  border-color: #e2e8f0;
  box-shadow: none;
}

.work-thumbnail {
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, #1e293b 0%, #334155 50%, #0f172a 100%);
  position: relative;
  overflow: hidden;
  min-height: 160px;
}

.thumbnail-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
}

.thumbnail-subtitle {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.6;
  margin-bottom: 4px;
}

.thumbnail-title {
  font-size: 20px;
  font-weight: 700;
}

.work-overlay {
  position: absolute;
  inset: 0;
  background: black;
  opacity: 0;
  transition: opacity 0.2s;
}

.work-item:hover .work-overlay {
  opacity: 0.1;
}

.work-info {
  padding: 12px 16px;
}

.work-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.work-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
}

.work-time {
  white-space: nowrap;
}

.work-menu-button {
  padding: 4px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s;
}

.work-item:hover .work-menu-button {
  opacity: 1;
}

.work-menu-button:hover {
  color: #64748b;
  background: #f8fafc;
}

:deep(.work-menu-delete-option) {
  color: #b42318;
}

:deep(.work-menu-delete-option:hover) {
  background: #fff1f0;
}

.work-item.empty-state {
  background: #f8fafc;
  border: 2px dashed #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  gap: 16px;
}

.work-item.empty-state:hover {
  border-color: #2563eb;
  background: rgba(239, 246, 255, 0.3);
}

.empty-icon {
  width: 56px;
  height: 56px;
  background: white;
  border-radius: 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: all 0.2s;
}

.work-item.empty-state:hover .empty-icon {
  color: #2563eb;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  transition: color 0.2s;
}

.work-item.empty-state:hover .empty-text {
  color: #2563eb;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 16px;
}

.loading-state p {
  font-size: 14px;
  color: #64748b;
}

.no-works-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 24px;
}

.no-works-state .empty-icon {
  width: 80px;
  height: 80px;
  background: #f8fafc;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
}

.no-works-state .empty-text {
  font-size: 16px;
  font-weight: 500;
  color: #64748b;
}

.create-first-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #9333ea 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(147, 51, 234, 0.25);
  transition: all 0.2s;
}

.create-first-button:hover {
  box-shadow: 0 6px 16px rgba(147, 51, 234, 0.35);
  transform: translateY(-1px);
}

@media (max-width: 1536px) {
  .works-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 960px) {
  .literature-home-page {
    padding: 16px;
  }

  .quick-actions-grid {
    grid-template-columns: 1fr;
  }

  .works-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .works-controls {
    width: 100%;
    justify-content: space-between;
  }

  .works-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .works-grid {
    grid-template-columns: 1fr;
  }

  .works-controls {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
