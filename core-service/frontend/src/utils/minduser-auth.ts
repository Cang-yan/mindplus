import { getRuntimeConfig } from '@/utils/runtimeConfig'

const DEFAULT_MINDUSER_BASE_URL = 'http://127.0.0.1:3100'
const DEFAULT_SERVICE_KEY = 'mindplus'
const DEFAULT_PROFILE_PATH = `/${DEFAULT_SERVICE_KEY}/app`

function readFirst(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0] ?? '') : ''
  }
  return String(value ?? '')
}

function trimTrailingSlash(value: string): string {
  const text = String(value || '').trim()
  return text.replace(/\/+$/, '')
}

function normalizeServiceKey(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return DEFAULT_SERVICE_KEY
  return raw.replace(/[^a-z0-9_-]/g, '') || DEFAULT_SERVICE_KEY
}

function normalizeRoutePath(value: string, fallback: string): string {
  const text = String(value || '').trim() || fallback
  const withLeadingSlash = text.startsWith('/') ? text : `/${text}`
  const cleaned = withLeadingSlash.replace(/\/+$/, '')
  return cleaned || fallback
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeBasePath(value: string): string {
  const text = String(value || '/').trim()
  if (!text || text === '/') return '/'
  const withLeadingSlash = text.startsWith('/') ? text : `/${text}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export function getMindUserBaseUrl(): string {
  const configured =
    getRuntimeConfig('VITE_MINDUSER_BASE_URL') ||
    (import.meta.env.VITE_MINDUSER_BASE_URL as string) ||
    DEFAULT_MINDUSER_BASE_URL
  return trimTrailingSlash(configured) || DEFAULT_MINDUSER_BASE_URL
}

export function getMindUserServiceKey(): string {
  const configured =
    getRuntimeConfig('VITE_MINDUSER_SERVICE_KEY') ||
    (import.meta.env.VITE_MINDUSER_SERVICE_KEY as string) ||
    DEFAULT_SERVICE_KEY
  return normalizeServiceKey(configured)
}

export function getMindUserProfileTarget(): string {
  const serviceKey = getMindUserServiceKey()
  const configured =
    getRuntimeConfig('VITE_MINDUSER_PROFILE_URL') ||
    (import.meta.env.VITE_MINDUSER_PROFILE_URL as string) ||
    ''

  if (configured && isHttpUrl(configured)) {
    return configured
  }

  const profilePath = normalizeRoutePath(configured, `/${serviceKey}/app`)
  return new URL(profilePath, `${getMindUserBaseUrl()}/`).toString()
}

export function clearMindPlusLocalAuth() {
  localStorage.removeItem('jwt_token')
  localStorage.removeItem('uid')
  localStorage.removeItem('username')
  localStorage.removeItem('userColor')
  localStorage.removeItem('userRole')
}

export function normalizeAppRedirectPath(raw: unknown): string {
  const basePath = normalizeBasePath(import.meta.env.BASE_URL || '/')
  const baseNoTrailing = basePath === '/' ? '' : basePath.slice(0, -1)
  const rawValue = readFirst(raw).trim()
  if (!rawValue) return '/'

  let value = rawValue

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (url.origin !== window.location.origin) return '/'
      value = `${url.pathname}${url.search}${url.hash}`
    } catch {
      return '/'
    }
  }

  if (!value.startsWith('/')) return '/'

  if (baseNoTrailing && value === baseNoTrailing) return '/'
  if (baseNoTrailing && value.startsWith(`${baseNoTrailing}/`)) {
    const sliced = value.slice(baseNoTrailing.length)
    return sliced.startsWith('/') ? sliced : `/${sliced}`
  }

  return value
}

export function buildMindPlusCallbackUrl(redirectPath: string): string {
  const normalizedBasePath = normalizeBasePath(import.meta.env.BASE_URL || '/')
  const appBaseUrl = new URL(normalizedBasePath, window.location.origin)
  const callbackUrl = new URL('auth/callback', appBaseUrl)
  callbackUrl.searchParams.set('redirect', normalizeAppRedirectPath(redirectPath || '/'))
  return callbackUrl.toString()
}

export function buildMindUserLoginUrl(redirectPath = '/', options?: { logout?: boolean }): string {
  const serviceKey = getMindUserServiceKey()
  const loginPath = normalizeRoutePath(`/${serviceKey}/login`, `/${DEFAULT_SERVICE_KEY}/login`)
  const loginUrl = new URL(loginPath, `${getMindUserBaseUrl()}/`)
  loginUrl.searchParams.set('redirect', buildMindPlusCallbackUrl(redirectPath))
  if (options?.logout) {
    loginUrl.searchParams.set('logout', '1')
  }
  return loginUrl.toString()
}

export function buildMindUserProfileUrl(): string {
  const profileTarget = getMindUserProfileTarget()
  if (isHttpUrl(profileTarget)) {
    return profileTarget
  }
  const safePath = normalizeRoutePath(profileTarget, DEFAULT_PROFILE_PATH)
  return new URL(safePath, `${getMindUserBaseUrl()}/`).toString()
}

export function parseMindUserCallbackQuery(query: Record<string, unknown>) {
  const token = readFirst(query.token).trim()
  const uid = readFirst(query.uid || query.id).trim()
  const username = readFirst(query.username).trim()
  const role = readFirst(query.role).trim() || 'user'
  const service = readFirst(query.service).trim().toLowerCase()
  const redirect = normalizeAppRedirectPath(query.redirect)
  return { token, uid, username, role, service, redirect }
}

export const MINDUSER_SERVICE_KEY = getMindUserServiceKey()
