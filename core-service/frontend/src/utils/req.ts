import axios from "axios"
import { Message } from "@arco-design/web-vue"

interface HTTP_RESPONSE {
    success: 1 | 0
    data: any
    msg: string
}

function normalizeBaseApiUrl(raw: unknown): string {
    const text = String(raw || '').trim()
    if (!text) return ''
    // 统一把末尾 `/api` 去掉，避免请求路径自身也带 `/api` 时出现 `/api/api/*`。
    const noTrailingSlash = text.replace(/\/+$/, '')
    return noTrailingSlash.replace(/\/api$/i, '')
}

function resolveBaseApiUrl() {
    try {
        const g: any = (globalThis as any)
        const fromGlobal = g && g.__PX_BASE_API_URL__
        const forceProxyFromGlobal = g && g.__PX_FORCE_VITE_PROXY__
        const fromLS = typeof localStorage !== 'undefined' ? localStorage.getItem('px_base_api_url') : null
        const forceProxyFromLS = typeof localStorage !== 'undefined' ? localStorage.getItem('px_force_vite_proxy') : null
        const forceProxyFromEnv = (import.meta as any)?.env?.VITE_DEV_FORCE_PROXY
        const apiUrl = normalizeBaseApiUrl(fromGlobal || fromLS || process.env.BASE_API_URL)

        // 仅在显式开启时才走 Vite 代理，避免服务器移植时出现代理转发异常。
        const forceProxyRaw = String(forceProxyFromGlobal || forceProxyFromLS || forceProxyFromEnv || '').trim().toLowerCase()
        const forceProxy = forceProxyRaw === '1' || forceProxyRaw === 'true' || forceProxyRaw === 'yes'
        if (forceProxy) {
            return ''
        }

        return apiUrl
    } catch {
        return normalizeBaseApiUrl(process.env.BASE_API_URL)
    }
}

const instance = axios.create({
    baseURL: resolveBaseApiUrl(),
    timeout: 60000,
})

let accountAnomalyRedirecting = false

function clearLocalAuthState() {
    try {
        localStorage.removeItem('jwt_token')
        localStorage.removeItem('uid')
        localStorage.removeItem('username')
        localStorage.removeItem('userRole')
        localStorage.removeItem('userColor')
    } catch {}
}

function redirectToLogin() {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)
    window.location.href = `${import.meta.env.BASE_URL}login?force=1&redirect=` + redirect
}

function resolveAccountAnomaly(data: any): '' | 'unregistered' | 'disabled' {
    const errorCode = String(data?.errorCode || data?.error_code || '').trim().toUpperCase()
    const message = String(data?.message || data?.msg || '').trim()
    const lowerMessage = message.toLowerCase()

    if (
        errorCode === 'USER_NOT_REGISTERED' ||
        message.includes('未注册') ||
        message.includes('用户不存在') ||
        lowerMessage.includes('not registered') ||
        lowerMessage.includes('not found')
    ) {
        return 'unregistered'
    }

    if (
        errorCode === 'USER_DISABLED' ||
        message.includes('停用') ||
        message.includes('账号存在异常') ||
        lowerMessage.includes('disabled')
    ) {
        return 'disabled'
    }

    return ''
}

function handleAccountAnomaly(kind: 'unregistered' | 'disabled') {
    if (accountAnomalyRedirecting) return
    accountAnomalyRedirecting = true

    const alertText = kind === 'unregistered'
        ? '用户未注册'
        : '账号存在异常，请联系管理员'

    try {
        window.alert(alertText)
    } catch {}

    clearLocalAuthState()
    redirectToLogin()
}

instance.interceptors.request.use(
  function (config: any) {
    config.baseURL = resolveBaseApiUrl()
    config.headers = {
      ...(config.headers || {}),
      // 空字符串让后端使用默认的 /public/uploads 目录
      'x-requested-with': '',
      ...(localStorage.getItem('jwt_token') ? { 'Authorization': `Bearer ${localStorage.getItem('jwt_token')}` } : {}),
    }
    return config
  },
    function (error) {
        return Promise.reject(error)
    }
)

instance.interceptors.response.use(
    function (response) {
        return response.data
    },
    function (error) {
        console.error('API请求错误:', error)

        if (error && error.response) {
            const { status, data } = error.response
            const reqUrl = String(error?.config?.url || '')
            const isAuthEndpoint = reqUrl.includes('/auth/login') || reqUrl.includes('/auth/register')
            console.error(`HTTP ${status}:`, data)

            if (!isAuthEndpoint && (status === 401 || status === 403)) {
                const anomaly = resolveAccountAnomaly(data)
                if (anomaly) {
                    handleAccountAnomaly(anomaly)
                    return Promise.reject(error)
                }
            }

            switch (status) {
                case 400:
                    if (!isAuthEndpoint) Message.error(data.message || '请求参数错误')
                    break
                case 401:
                    // 401 = 身份验证失败（token 过期、无效、缺失等），需要重新登录
                    if (!isAuthEndpoint) {
                        // Demo 模式（无 token 的本地 guest）不强制跳转登录
                        const isDemoMode = !!localStorage.getItem('uid') && !localStorage.getItem('jwt_token')
                        if (isDemoMode) break

                        // 清除所有用户相关信息
                        clearLocalAuthState()

                        Message.error('登录已过期，请重新登录')
                        setTimeout(() => {
                            redirectToLogin()
                        }, 500)
                    }
                    break
                case 403:
                    break
                case 404:
                    break
                case 429:
                    if (!isAuthEndpoint) Message.error(data?.message || '请求过于频繁')
                    break
                case 500:
                case 503:
                    break
                case 501:
                    window && (location.href = `${import.meta.env.BASE_URL}login`)
                    break
                default:
                    if (!isAuthEndpoint) Message.error(`请求失败 (${status})`)
            }
        } else if (error.code === 'NETWORK_ERROR' || error.message.includes('Network Error')) {
            Message.error('网络连接失败，请检查网络设置')
        } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            Message.error('请求超时，请稍后重试')
        } else {
            Message.error('请求失败：' + (error.message || '未知错误'))
        }

        return Promise.reject(error)
    }
)

export const request = instance
export default instance

