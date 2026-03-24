import { getModels, getProvider, type ProviderKey } from './providers'
import { getRuntimeConfig } from '../runtimeConfig'

export interface AISettings {
  provider: ProviderKey
  model: string
  apiKey?: string
  baseUrl?: string // legacy: custom provider base url
  temperature?: number
  // Per-provider API keys (saved by user in UI)
  apiKeys?: Partial<Record<ProviderKey, string>>
  // Per-provider base URL overrides (saved by user in UI)
  baseUrls?: Partial<Record<ProviderKey, string>>
}

const STORAGE_KEY = 'pxdoc_ai_settings'

const DEFAULTS: AISettings = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: '',
  temperature: 0.7,
  apiKeys: {},
  baseUrls: {},
}

/** 各 provider 对应的运行时 API Key 配置键名 */
const PROVIDER_ENV_KEY: Partial<Record<ProviderKey, string>> = {
  deepseek: 'VITE_DEEPSEEK_API_KEY',
  minimax:  'VITE_MINIMAX_API_KEY',
  kimi:     'VITE_KIMI_API_KEY',
  glm:      'VITE_GLM_API_KEY',
  qwen:     'VITE_QWEN_API_KEY',
  doubao:   'VITE_DOUBAO_API_KEY',
  openai:   'VITE_OPENAI_API_KEY',
  claude:   'VITE_CLAUDE_API_KEY',
  gemini:   'VITE_GEMINI_API_KEY',
  grok:     'VITE_GROK_API_KEY',
}

/** 各 provider 对应的运行时 Base URL 配置键名 */
const PROVIDER_ENV_BASE_URL: Partial<Record<ProviderKey, string>> = {
  deepseek: 'VITE_DEEPSEEK_BASE_URL',
  minimax:  'VITE_MINIMAX_BASE_URL',
  kimi:     'VITE_KIMI_BASE_URL',
  glm:      'VITE_GLM_BASE_URL',
  qwen:     'VITE_QWEN_BASE_URL',
  doubao:   'VITE_DOUBAO_BASE_URL',
  openai:   'VITE_OPENAI_BASE_URL',
  claude:   'VITE_CLAUDE_BASE_URL',
  gemini:   'VITE_GEMINI_BASE_URL',
  grok:     'VITE_GROK_BASE_URL',
  custom:   'VITE_CUSTOM_BASE_URL',
}

/**
 * Get API key for a specific provider
 * Priority:
 *   1. Provider-specific key saved in localStorage settings (user UI input)
 *   2. Runtime config (window.__APP_CONFIG__) or Vite env (local dev fallback)
 *   3. Generic apiKey field (backward compatibility)
 */
export function getProviderApiKey(provider: ProviderKey, settings: AISettings): string {
  // 1. User-saved key in settings
  if (settings.apiKeys?.[provider]) {
    return settings.apiKeys[provider] as string
  }

  // 2. Runtime config injected from server environment variables
  const envKey = PROVIDER_ENV_KEY[provider]
  if (envKey) {
    const value = getRuntimeConfig(envKey)
    if (value) return value
  }

  // 3. Fallback to generic apiKey (backward compatibility)
  return settings.apiKey || ''
}

/**
 * Get base URL for a specific provider
 * Priority:
 *   1. Provider-specific base URL saved in localStorage settings (user UI input)
 *   2. Runtime config (window.__APP_CONFIG__) or Vite env (local dev fallback)
 *   3. Provider default base URL from providers.ts
 *
 * 使用中转服务时，在 runtime-config.js 中设置对应的 VITE_<PROVIDER>_BASE_URL 即可。
 */
export function getProviderBaseUrl(provider: ProviderKey, settings: AISettings): string {
  // 1. User-saved base URL in settings
  if (settings.baseUrls?.[provider]) {
    return settings.baseUrls[provider] as string
  }

  // legacy: custom provider used settings.baseUrl
  if (provider === 'custom' && settings.baseUrl) {
    return settings.baseUrl
  }

  // 2. Runtime config
  const envKey = PROVIDER_ENV_BASE_URL[provider]
  if (envKey) {
    const value = getRuntimeConfig(envKey)
    if (value) return value
  }

  // 3. Hardcoded provider default
  return getProvider(provider).baseUrl
}

export function getAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    let settings: AISettings

    if (!raw) {
      settings = { ...DEFAULTS }
    } else {
      const parsed = JSON.parse(raw)
      settings = { ...DEFAULTS, ...parsed }
    }

    if (!settings.apiKeys)  settings.apiKeys  = {}
    if (!settings.baseUrls) settings.baseUrls = {}

    // Backward compatibility: migrate generic apiKey to provider-specific if needed
    if (settings.apiKey && !settings.apiKeys[settings.provider]) {
      settings.apiKeys[settings.provider] = settings.apiKey
    }

    return settings
  } catch {
    return { ...DEFAULTS, apiKeys: {}, baseUrls: {} }
  }
}

export function setAISettings(next: Partial<AISettings>) {
  const merged = { ...getAISettings(), ...next }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
}

export function getAvailableModels(provider: ProviderKey): Array<{label: string; value: string}> {
  return getModels(provider)
}
