<template>
  <div class="app-layout">
    <!-- Left Sidebar -->
    <aside class="sidebar">
      <!-- Logo -->
      <div class="sidebar-header">
        <button class="logo-wrapper" type="button" @click="goPortalHome">
          <div class="logo-icon">
            <Icon name="sidebar-magic-wand" :size="20" />
          </div>
          <span class="logo-text">{{ t('slide.home.appTitle') }}</span>
        </button>
      </div>

      <!-- Navigation Menu -->
      <nav class="nav-menu">
        <a href="#" class="nav-item" :class="{ active: isPortalActive }" @click.prevent="router.push({ name: 'PortalHome' })">
          <Icon name="layers" :size="20" />
          <span>首页</span>
        </a>
        <div class="nav-divider"></div>

        <a href="#" class="nav-item" :class="{ active: isHomeActive }" @click.prevent="router.push({ name: 'Home' })">
          <Icon name="layers" :size="20" />
          <span>{{ t('slide.home.aiPpt') }}</span>
        </a>
        <div class="nav-divider"></div>

        <a href="#" class="nav-item" :class="{ active: isLiteratureActive }" @click.prevent="router.push({ name: 'LiteratureHome' })">
          <Icon name="document-text" :size="20" />
          <span>文献助手</span>
        </a>
        <div class="nav-divider account-divider"></div>
        <section class="nav-account-block">
          <section class="account-card">
            <div class="user-avatar">
              <Icon name="user" :size="20" />
            </div>
            <p class="account-line">
              <span class="account-label">用户名：</span>
              <span class="account-value">{{ username || t('slide.home.demoUser') }}</span>
            </p>
            <div class="credits-row">
              <span class="credits-text">
                <span class="account-label">剩余credits：</span>
                <span class="account-value">{{ creditsLabel }}</span>
              </span>
              <button
                class="refresh-btn"
                type="button"
                :disabled="creditsLoading"
                @click="refreshCredits(true)"
              >
                {{ creditsLoading ? '刷新中' : '刷新' }}
              </button>
            </div>
            <div class="account-actions">
              <button class="account-btn secondary" type="button" @click="openMindUserProfile">
                查看详情
              </button>
              <button class="account-btn danger" type="button" @click="handleLogout">
                注销登录
              </button>
            </div>
          </section>
        </section>
      </nav>

      <!-- Footer -->
      <div class="sidebar-footer">
        <div class="powered-by">
          {{ t('slide.home.poweredBy') }} <span class="brand">{{ t('slide.home.brandName') }}</span>
        </div>
      </div>
    </aside>

    <!-- Right: header + content -->
    <div class="main-wrapper">
      <!-- Top Header -->
      <header class="top-header">
        <div class="header-left">
          <button
            v-if="showHeaderBackButton"
            class="header-back-btn"
            type="button"
            @click="handleHeaderBack"
          >
            &lt;
          </button>
          <h1 class="page-title">{{ pageTitle }}</h1>
        </div>
      </header>

      <!-- Child Route Content -->
      <div class="router-content">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import IIcon from '@/utils/slide/icon.js'
import { useI18n } from 'vue-i18n'
import { Message } from '@arco-design/web-vue'
import { CREDITS_CHANGED_EVENT } from '@/utils/credits-events'
import {
  buildMindUserLoginUrl,
  buildMindUserProfileUrl,
  clearMindPlusLocalAuth,
  getMindUserBaseUrl,
  getMindUserServiceKey,
} from '@/utils/minduser-auth'

const Icon = IIcon
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const username = ref('')
const credits = ref('--')
const creditsLoading = ref(false)
let creditsRefreshTimer = null

const isPortalActive = computed(() => route.name === 'PortalHome')
const isHomeActive = computed(() =>
  route.name === 'Home' ||
  route.name === 'AiCreate' ||
  route.name === 'AiCreateWorkspace'
)
const isLiteratureActive = computed(() =>
  route.name === 'LiteratureHome' ||
  route.name === 'LiteratureEmbed' ||
  route.name === 'LiteratureCompare'
)
const showHeaderBackButton = computed(() =>
  route.name === 'AiCreate' ||
  route.name === 'AiCreateWorkspace' ||
  route.name === 'LiteratureEmbed' ||
  route.name === 'LiteratureCompare'
)

const pageTitle = computed(() => {
  if (route.name === 'PortalHome') return '首页'
  if (route.name === 'LiteratureHome') return '文献助手'
  if (route.name === 'LiteratureEmbed') {
    const entry = String(route.query?.entry || '').toLowerCase()
    if (entry === 'assistant') return '文献辅助编撰'
    if (entry === 'translation') return '文献智能翻译'
    return '文献助手'
  }
  if (route.name === 'LiteratureCompare') {
    return '在线对比阅读'
  }
  if (route.name === 'AiCreate') return 'AI智能生成PPT'
  if (route.name === 'AiCreateWorkspace') return 'AI PPT 生成工作区'
  return t('slide.home.workspace')
})

function scheduleCreditsRefresh() {
  if (creditsRefreshTimer) return
  creditsRefreshTimer = window.setTimeout(() => {
    creditsRefreshTimer = null
    void refreshCredits(false)
  }, 300)
}

onMounted(() => {
  username.value = localStorage.getItem('username') || ''
  void refreshCredits(false)
  window.addEventListener(CREDITS_CHANGED_EVENT, scheduleCreditsRefresh)
})

onBeforeUnmount(() => {
  window.removeEventListener(CREDITS_CHANGED_EVENT, scheduleCreditsRefresh)
  if (creditsRefreshTimer) {
    clearTimeout(creditsRefreshTimer)
    creditsRefreshTimer = null
  }
})

const goPortalHome = () => {
  router.push({ name: 'PortalHome' })
}

const handleHeaderBack = () => {
  if (route.name === 'LiteratureCompare') {
    router.push({ name: 'LiteratureEmbed', query: { entry: 'translation' } })
    return
  }
  if (route.name === 'LiteratureEmbed') {
    router.push({ name: 'LiteratureHome' })
    return
  }
  router.push({ name: 'Home' })
}

const openMindUserProfile = () => {
  const profileUrl = buildMindUserProfileUrl()
  const newTab = window.open(profileUrl, '_blank')
  if (!newTab) {
    Message.warning('浏览器拦截了新标签页，请允许弹窗后重试')
    return
  }
  try {
    newTab.opener = null
  } catch (error) {
    console.warn('set opener failed:', error)
  }
}

const creditsLabel = computed(() => (creditsLoading.value ? '查询中...' : credits.value))

const refreshCredits = async (notify = false) => {
  const token = String(localStorage.getItem('jwt_token') || '').trim()
  if (!token) {
    credits.value = '--'
    return
  }

  const baseUrl = getMindUserBaseUrl()
  const serviceKey = getMindUserServiceKey()
  const summaryUrl = new URL(`/api/${serviceKey}/wallet/summary`, `${baseUrl}/`).toString()

  creditsLoading.value = true
  try {
    const response = await fetch(summaryUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || Number(payload?.code) !== 200) {
      const message = String(payload?.message || `请求失败 (${response.status})`)
      throw new Error(message)
    }

    const rawCredits = payload?.data?.credits
    const numericCredits = Number(rawCredits)
    credits.value = Number.isFinite(numericCredits) ? `${numericCredits}` : String(rawCredits || '--')
    if (notify) {
      Message.success('credits 已刷新')
    }
  } catch (error) {
    console.error('fetch wallet summary failed:', error)
    credits.value = '--'
    if (notify) {
      Message.error(String(error?.message || '查询 credits 失败'))
    }
  } finally {
    creditsLoading.value = false
  }
}

const handleLogout = () => {
  try {
    clearMindPlusLocalAuth()
    Message.success(t('auth.logoutSuccess') || 'Logged out successfully')
    window.location.href = buildMindUserLoginUrl('/', { logout: true })
  } catch (error) {
    console.error('Logout error:', error)
    Message.error(t('auth.logoutFailed') || 'Logout failed')
  }
}
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  background: #f8fafc;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 240px;
  background: white;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
}

.logo-wrapper {
  appearance: none;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 0;
}

.logo-wrapper:hover {
  opacity: 0.85;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: #2563eb;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #1e293b;
}

.nav-menu {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.nav-menu::-webkit-scrollbar {
  display: none;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  color: #64748b;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.nav-item:hover {
  background: #f8fafc;
  color: #0f172a;
}

.nav-item.active {
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}

.nav-divider {
  margin: 16px 0;
  padding-top: 16px;
  border-top: 1px solid #f1f5f9;
}

.sidebar-footer {
  padding: 12px 16px 16px;
}

.account-divider {
  margin: 12px 0 0;
  padding-top: 12px;
}

.nav-account-block {
  margin-top: 0;
}

.account-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #dbeafe;
  border: 2px solid #bfdbfe;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2563eb;
  flex-shrink: 0;
}

.account-line {
  margin: 0;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #334155;
  line-height: 1.4;
}

.account-label {
  width: 76px;
  flex-shrink: 0;
}

.account-value {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.credits-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.credits-text {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #334155;
  line-height: 1.4;
}

.refresh-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

.refresh-btn:hover:not(:disabled) {
  border-color: #94a3b8;
}

.refresh-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.account-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.account-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  height: 30px;
  font-size: 12px;
  cursor: pointer;
}

.account-btn.secondary:hover {
  border-color: #94a3b8;
}

.account-btn.danger {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fef2f2;
}

.account-btn.danger:hover {
  border-color: #fca5a5;
}

.powered-by {
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}

.powered-by .brand {
  font-weight: 600;
  color: #64748b;
}

/* Main Wrapper */
.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.router-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* Top Header */
.top-header {
  height: 64px;
  background: white;
  border-bottom: 1px solid #f1f5f9;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-back-btn {
  appearance: none;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 1px;
}

.header-back-btn:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
}
</style>
