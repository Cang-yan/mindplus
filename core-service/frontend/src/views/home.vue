<template>
  <!-- Content Area -->
  <main class="content-area">
    <!-- Quick Actions Section -->
    <section class="section">
      <div class="quick-actions-grid">
        <!-- AI Create PPT -->
        <div class="action-card primary" @click="createNewAiPpt">
          <div class="card-decoration"></div>
          <div class="card-content">
            <div class="card-icon primary-icon">
              <Icon name="home-magic-wand" :size="28" />
            </div>
            <div class="card-header">
              <h3 class="card-title">{{ t('slide.home.aiCreatePpt') }}</h3>
              <span class="ai-badge">AI</span>
            </div>
            <p class="card-description">{{ t('slide.home.aiCreatePptDesc') }}</p>
            <div class="card-action">
              <span>{{ t('slide.home.createNow') }}</span>
              <Icon name="arrow-right" :size="16" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- My Works Section -->
    <section class="section">
      <div class="works-header">
        <div class="title-wrap">
          <h2 class="section-title">{{ t('slide.home.myWorks') }}</h2>
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

      <!-- Works Grid -->
      <div v-if="loading" class="loading-state">
        <Icon name="loading" :size="32" />
        <p>{{ t('common.loading') }}</p>
      </div>
      <div v-else-if="works.length === 0" class="no-works-state">
        <div class="empty-icon">
          <Icon name="folder-open" :size="48" />
        </div>
        <p class="empty-text">{{ t('slide.home.noWorks') }}</p>
        <button class="create-first-button" @click="createNewPpt">
          <Icon name="add-circle" :size="20" />
          <span>{{ t('slide.home.createFirstWork') }}</span>
        </button>
      </div>
      <div v-else class="works-grid">
        <!-- Work Item -->
        <div v-for="work in displayWorks" :key="work.id" class="work-item" @click="openWork(work)">
          <div class="work-thumbnail">
            <div class="thumbnail-content">
              <div class="thumbnail-subtitle">{{ work.subtitle }}</div>
              <div class="thumbnail-title">{{ work.title }}</div>
            </div>
            <div class="work-overlay"></div>
          </div>
          <div class="work-info">
            <h3 class="work-title">{{ work.name }}</h3>
            <div class="work-meta">
              <span class="work-time">{{ work.time }}</span>
              <a-dropdown trigger="click" position="bl">
                <button class="work-menu-button" type="button" @click.stop>
                  <Icon name="menu-dots" :size="16" />
                </button>
                <template #content>
                  <a-doption
                    class="work-menu-delete-option"
                    @click.stop="handleDeleteWork(work)"
                  >
                    {{ t('common.delete') }}
                  </a-doption>
                </template>
              </a-dropdown>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div class="work-item empty-state" @click="createNewPpt">
          <div class="empty-icon">
            <Icon name="add-circle" :size="48" />
          </div>
          <p class="empty-text">{{ t('slide.home.createNewWork') }}</p>
        </div>
      </div>
    </section>

  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import IIcon from '@/utils/slide/icon.js'
import { useI18n } from 'vue-i18n'
import { Message } from '@arco-design/web-vue'
import { presentationApi } from '@/api/presentation'
import { unwrapResponse } from '@/api/response'
import {
  deletePptGenerationRecord,
  hydratePptGenerationRecords,
  listPptGenerationRecords,
} from '@/utils/ppt-generation-store'

const Icon = IIcon
const router = useRouter()
const loading = ref(false)
const deletingWorkId = ref('')
const currentPage = ref(1)
const gridColumns = ref(4)

const { t } = useI18n()
const works = ref([])
const WORK_TYPE_PRESENTATION = 'presentation'
const WORK_TYPE_AIPPT = 'aippt-generation'
const GRID_ROWS = 2

const displayWorks = computed(() => {
  const page = Math.max(1, Math.min(currentPage.value, totalPages.value))
  const start = (page - 1) * worksPerPage.value
  const end = start + worksPerPage.value
  return works.value.slice(start, end)
})

const worksPerPage = computed(() => {
  const slots = Math.max(1, gridColumns.value * GRID_ROWS)
  return Math.max(1, slots - 1)
})

const totalPages = computed(() => Math.max(1, Math.ceil(works.value.length / worksPerPage.value)))

const mapLocalGenerationWorks = () => {
  return listPptGenerationRecords().map((record) => {
    const timeValue = record.updatedAt || record.createdAt
    const sortTimestamp = new Date(timeValue || 0).getTime() || 0
    return {
      id: `aippt_${record.id}`,
      workId: record.id,
      workType: WORK_TYPE_AIPPT,
      status: String(record.status || 'pending'),
      name: record.topic || '未命名 AI PPT',
      title: record.topic || '未命名 AI PPT',
      subtitle: record.progressText || 'AI PPT 工作流草稿',
      time: formatTime(timeValue),
      sortTimestamp,
      thumbnail: '',
    }
  })
}

const mergeWorks = (serverWorks) => {
  const localWorks = mapLocalGenerationWorks()
  return [...localWorks, ...serverWorks].sort((a, b) => (b.sortTimestamp || 0) - (a.sortTimestamp || 0))
}

const fetchPresentations = async () => {
  const hasJwt = !!localStorage.getItem('jwt_token')
  try {
    loading.value = true
    if (hasJwt) {
      await hydratePptGenerationRecords()
    }

    let serverWorks = []
    if (hasJwt) {
      const res = await presentationApi.getAll()
      const payload = unwrapResponse(res)
      if (payload?.data?.presentations && Array.isArray(payload.data.presentations)) {
        const presentations = payload.data.presentations
        serverWorks = presentations.map(p => ({
          id: p.id,
          workId: p.id,
          workType: WORK_TYPE_PRESENTATION,
          name: p.title || t('slide.home.untitledWork'),
          title: p.title || t('slide.home.untitledWork'),
          subtitle: p.description || '',
          time: formatTime(p.updatedAt || p.createdAt),
          sortTimestamp: new Date(p.updatedAt || p.createdAt || 0).getTime() || 0,
          thumbnail: p.thumbnail,
        }))
      }
    }
    works.value = mergeWorks(serverWorks)
  } catch (error) {
    console.error('Failed to fetch presentations:', error)
    works.value = mergeWorks([])
  } finally {
    loading.value = false
  }
}

const formatTime = (timestamp) => {
  if (!timestamp) return t('slide.home.justNow')

  const now = Date.now()
  const time = new Date(timestamp).getTime()
  const diff = now - time

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('slide.home.justNow')
  if (minutes < 60) return t('slide.home.minutesAgo', { n: minutes })
  if (hours < 24) return t('slide.home.hoursAgo', { n: hours })
  if (days < 30) return t('slide.home.daysAgo', { n: days })

  return new Date(timestamp).toLocaleDateString()
}

const resolveGridColumns = () => {
  const width = window.innerWidth
  if (width <= 768) return 1
  if (width <= 1024) return 2
  if (width <= 1536) return 3
  return 4
}

const updateGridColumns = () => {
  gridColumns.value = resolveGridColumns()
}

const prevPage = () => {
  currentPage.value = Math.max(1, currentPage.value - 1)
}

const nextPage = () => {
  currentPage.value = Math.min(totalPages.value, currentPage.value + 1)
}

watch(
  () => [works.value.length, worksPerPage.value],
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
  void fetchPresentations()
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('resize', updateGridColumns)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('resize', updateGridColumns)
})

const createNewPpt = () => {
  router.push({ name: 'AiCreate' })
}

const createNewAiPpt = () => {
  router.push({ name: 'AiCreate' })
}

const handleWindowFocus = () => {
  void fetchPresentations()
}

const handleDeleteWork = async (work) => {
  const targetId = String(work?.workId || work?.id || '')
  if (!targetId || deletingWorkId.value === targetId) {
    return
  }
  try {
    deletingWorkId.value = targetId
    if (work?.workType === WORK_TYPE_AIPPT) {
      const removed = await deletePptGenerationRecord(targetId)
      if (!removed) {
        throw new Error('aippt record not found')
      }
    } else {
      const res = await presentationApi.delete(targetId)
      unwrapResponse(res)
    }
    await fetchPresentations()
    Message.success('删除成功')
  } catch (error) {
    console.error('Failed to delete work:', error)
    Message.error('删除失败')
  } finally {
    deletingWorkId.value = ''
  }
}

const openWork = (work) => {
  if (work?.workType === WORK_TYPE_AIPPT) {
    const doneStatuses = new Set(['completed', 'generating'])
    if (doneStatuses.has(String(work.status || ''))) {
      router.push({
        name: 'AiCreateWorkspace',
        query: { recordId: work.workId },
      })
    } else {
      router.push({
        name: 'AiCreate',
        query: { recordId: work.workId },
      })
    }
    return
  }
  router.push({ name: 'Slide', params: { docId: work?.workId || work?.id } })
}
</script>

<style scoped>
.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}

.content-area::-webkit-scrollbar {
  display: none;
}

.section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

/* Quick Actions Grid */
.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
  transition: transform 0.2s;
  color: white;
}

.action-card:hover .card-icon {
  transform: scale(1.1);
}

.primary-icon {
  background: linear-gradient(135deg, #9333ea 0%, #2563eb 100%);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.card-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.ai-badge {
  padding: 2px 8px;
  background: #2563eb;
  color: white;
  font-size: 12px;
  font-weight: 700;
  border-radius: 4px;
}

.card-description {
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
  margin-bottom: 16px;
}

.card-action {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #2563eb;
  font-weight: 600;
  font-size: 14px;
}

/* Works Section */
.works-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 12px;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
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

/* Works Grid */
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

/* Empty State */
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

/* Loading State */
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

/* No Works State */
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

/* Responsive */
@media (max-width: 1536px) {
  .works-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1024px) {
  .quick-actions-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .works-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .works-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .quick-actions-grid {
    grid-template-columns: 1fr;
  }

  .works-grid {
    grid-template-columns: 1fr;
  }

  .works-pagination {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
