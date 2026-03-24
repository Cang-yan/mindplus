import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 登录页（独立，无 AppLayout）
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/login-bridge.vue'),
    },
    // MindUser 登录回调
    {
      path: '/auth/callback',
      name: 'MindUserAuthCallback',
      component: () => import('@/views/auth-callback.vue'),
    },
    // 文献辅助编撰（独立新标签页）
    {
      path: '/literature-assistant',
      name: 'LiteratureAssistantStandalone',
      component: () => import('@/views/literature-assistant-workspace.vue'),
      meta: { requiresAuth: true },
    },

    // 主应用布局（共享侧边栏 + 顶部状态栏）
    {
      path: '/',
      component: () => import('@/views/layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: { name: 'PortalHome' }
        },
        {
          path: 'portal',
          name: 'PortalHome',
          component: () => import('@/views/portal-home.vue'),
        },
        {
          path: 'aippt',
          name: 'Home',
          component: () => import('@/views/home.vue'),
        },
        {
          path: 'ai-create',
          name: 'AiCreate',
          component: () => import('@/views/ai-create.vue'),
        },
        {
          path: 'ai-create/workspace',
          name: 'AiCreateWorkspace',
          component: () => import('@/views/ai-create-workspace.vue'),
        },
        {
          path: 'literature',
          name: 'LiteratureHome',
          component: () => import('@/views/literature-home.vue'),
        },
        {
          path: 'literature/workspace',
          name: 'LiteratureEmbed',
          component: () => import('@/views/literature-workspace.vue'),
        },
        {
          path: 'literature/compare/:recordId?',
          name: 'LiteratureCompare',
          component: () => import('@/views/literature-compare-reader.vue'),
        },
      ]
    },

    // 独立页面（无 AppLayout，保持原有行为）
    {
      path: '/workspace',
      name: 'Workspace',
      component: () => import('@/views/home-redirect.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/slide/:docId',
      name: 'Slide',
      component: () => import('@/views/slide-page/slide-page.vue'),
      meta: { requiresAuth: true }
    },
    // 旧路由重定向保持兼容
    {
      path: '/literature-reader',
      redirect: { name: 'LiteratureEmbed', query: { entry: 'translation' } }
    },
    {
      path: '/literature-history',
      redirect: { name: 'LiteratureEmbed', query: { panel: 'history' } }
    },
    {
      path: '/literature-settings',
      redirect: { name: 'LiteratureEmbed', query: { panel: 'settings' } }
    },

    // 通配符路由 - 必须放在最后，用于文档编辑
    {
      path: '/:pathMatch(.*)*',
      name: 'notion',
      component: () => import('@/views/slide-page/slide-page.vue'),
      meta: { requiresAuth: true }
    },
  ]
})

router.beforeEach((to, from, next) => {
  // 调试日志：确认路由匹配
  console.log('[Router] 路由导航:', {
    toPath: to.path,
    toName: to.name,
    fromPath: from.path,
    fromName: from.name,
    fullPath: to.fullPath
  })

  const isAuthenticated = localStorage.getItem('uid')

  if (to.name === 'Login') {
    const force = to.query?.force === '1'
    if (isAuthenticated && !force) {
      next({ path: '/' })
    } else {
      next()
    }
    return
  }

  if (to.name === 'MindUserAuthCallback') {
    next()
    return
  }

  if (to.name === 'LiteratureHome') {
    const hasWorkspaceQuery = !!(to.query?.panel || to.query?.entry || to.query?.recordId || to.query?.docId)
    if (hasWorkspaceQuery) {
      next({ name: 'LiteratureEmbed', query: to.query })
      return
    }
  }

  if (to.name === 'LiteratureEmbed') {
    const entry = String(to.query?.entry || '').trim().toLowerCase()
    if (entry === 'assistant') {
      const nextQuery = { ...to.query }
      delete nextQuery.entry
      const hasJobTarget = String(nextQuery.jobId || '').trim().length > 0
      if (!hasJobTarget && nextQuery.fresh === undefined) {
        nextQuery.fresh = '1'
      }
      next({ name: 'LiteratureAssistantStandalone', query: nextQuery })
      return
    }
  }

  if (!isAuthenticated && to.meta.requiresAuth) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  next()
})

export default router
