'use strict'
const { loadEnv } = require('./load-env')
const path = require('path')
loadEnv()

function resolveServerPath(value, fallback) {
  const raw = String(value || fallback || '').trim() || fallback
  if (!raw) return ''
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, raw)
}

function resolveOpenDraftBaseUrl() {
  return String(process.env.OPENDRAFT_SERVICE_BASE_URL || '').trim()
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue
  const text = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return defaultValue
}

function parseNonNegativeNumber(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function parseOverdraftLimit(value, fallback = -1) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  if (n < 0) return -1
  return n
}

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function parseStringList(value, fallback = []) {
  if (value === undefined || value === null || value === '') return [...fallback]
  return String(value)
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

module.exports = {
  // 后端 API 服务端口（默认 3001）
  port: parseInt(process.env.VITE_BACKEND_PORT || process.env.PORT || process.env.AIPPT_BACKEND_PORT || '3001', 10),
  host: process.env.HOST || process.env.AIPPT_BACKEND_BIND_HOST || '0.0.0.0',
  nodeEnv: process.env.SERVER_NODE_ENV || process.env.NODE_ENV || 'production',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',

  // MindUser SSO integration
  minduser: {
    jwtSecret: process.env.MINDUSER_JWT_SECRET || process.env.JWT_SECRET || 'change-this-secret-in-production',
    serviceKey: (process.env.MINDUSER_SERVICE_KEY || 'mindplus').toLowerCase(),
  },

  // Credits billing controls (single price per scene + overdraft)
  billing: {
    enabled: parseBoolean(process.env.BILLING_ENABLED, true),
    mindUserBaseUrl: String(
      process.env.VITE_MINDUSER_BASE_URL ||
      'http://127.0.0.1:3100'
    ).trim(),
    internalKey: String(
      process.env.BILLING_INTERNAL_KEY ||
      process.env.BILLING_INTERNAL_CONSUME_KEY ||
      process.env.INTERNAL_RECHARGE_KEY ||
      ''
    ).trim(),
    consumeWithWallet: parseBoolean(process.env.BILLING_CONSUME_WITH_WALLET, true),
    // < 0 表示无限欠费；= 0 表示不允许欠费；> 0 表示允许欠费额度
    overdraftLimit: parseOverdraftLimit(process.env.BILLING_OVERDRAFT_LIMIT, -1),
    prices: {
      aippt_outline: parseNonNegativeNumber(process.env.BILLING_PRICE_AIPPT_OUTLINE, 1),
      aippt_json2ppt: parseNonNegativeNumber(
        process.env.BILLING_PRICE_AIPPT_GENPPT || process.env.BILLING_PRICE_AIPPT_JSON2PPT,
        1
      ),
      literature_ocr: parseNonNegativeNumber(process.env.BILLING_PRICE_LITERATURE_OCR, 1),
      literature_translate: parseNonNegativeNumber(process.env.BILLING_PRICE_LITERATURE_TRANSLATE, 1),
      literature_assistant_generate: parseNonNegativeNumber(process.env.BILLING_PRICE_LITERATURE_ASSISTANT_GENERATE, 1),
      literature_assistant_research: parseNonNegativeNumber(process.env.BILLING_PRICE_LITERATURE_ASSISTANT_RESEARCH, 20),
      literature_assistant_bachelor: parseNonNegativeNumber(process.env.BILLING_PRICE_LITERATURE_ASSISTANT_BACHELOR, 33),
      literature_assistant_master: parseNonNegativeNumber(process.env.BILLING_PRICE_LITERATURE_ASSISTANT_MASTER, 50),
      literature_assistant_phd: parseNonNegativeNumber(process.env.BILLING_PRICE_LITERATURE_ASSISTANT_PHD, 100),
    },
  },

  // MySQL (MindPlus unified database)
  mysql: {
    host: String(process.env.MYSQL_HOST || '127.0.0.1').trim() || '127.0.0.1',
    port: parsePositiveInt(process.env.MYSQL_PORT, 3306),
    user: String(process.env.MYSQL_USER || 'root').trim() || 'root',
    password: String(process.env.MYSQL_PASSWORD || '').trim(),
    database: String(process.env.MYSQL_DATABASE || 'mindplus').trim() || 'mindplus',
    charset: String(process.env.MYSQL_CHARSET || 'utf8mb4').trim() || 'utf8mb4',
    // 默认使用上海时区；如需 UTC 可显式设置 MYSQL_TIMEZONE=Z
    timezone: String(process.env.MYSQL_TIMEZONE || '+08:00').trim() || '+08:00',
    connectionLimit: parsePositiveInt(process.env.MYSQL_CONNECTION_LIMIT, 10),
    waitForConnections: parseBoolean(process.env.MYSQL_WAIT_FOR_CONNECTIONS, true),
  },

  // Upload directory
  uploadDir: resolveServerPath(process.env.UPLOAD_DIR, './uploads'),

  // GitHub OAuth
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  },

  // Coze AI workflow proxy
  coze: {
    apiKey: process.env.COZE_API_KEY || '',
    baseUrl: process.env.COZE_BASE_URL || 'https://api.coze.cn/v1',
    workflowOutlineId: process.env.COZE_WORKFLOW_OUTLINE_ID || '',
    workflowPptId: process.env.COZE_WORKFLOW_PPT_ID || '',
  },

  // OpenAI-compatible AI proxy (for /ai/trial/stream)
  ai: {
    // 与前端统一：复用 VITE_OPENAI_BASE_URL，未配置时走官方地址
    baseUrl: process.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1',
    // Assistant 通道专用 key（与 OCR 分离）
    apiKey: process.env.ASSISTANT_AI_KEY || process.env.AI_API_KEY || '',
  },

  // Aliyun image generation
  aliyun: {
    apiKey: process.env.ALIYUN_API_KEY || '',
    baseUrl: process.env.ALIYUN_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1',
  },

  // Xunfei speech
  xunfei: {
    appId: process.env.XUNFEI_APP_ID || '',
    apiKey: process.env.XUNFEI_API_KEY || '',
    apiSecret: process.env.XUNFEI_API_SECRET || '',
  },

  // CORS allowed origins (* for all, or comma-separated list)
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // LINGINE AI (OCR/文献翻译)
  lingine: {
    // 与前端统一：默认使用 VITE_OPENAI_BASE_URL；兼容老变量 LINGINE_AI_BASE_URL
    baseUrl: process.env.VITE_OPENAI_BASE_URL || process.env.LINGINE_AI_BASE_URL || 'https://api.openai.com/v1',
    // OCR/文献翻译专用 key，不再回退 assistant key（避免串用）
    apiKey: process.env.OCR_AI_KEY || process.env.LINGINE_AI_KEY || '',
  },

  // 文献翻译专用 OpenAI 兼容配置（按用户要求走 VITE_FY_*）
  literatureTranslate: {
    baseUrl: String(
      process.env.VITE_FY_BASE_URL ||
      process.env.LITERATURE_TRANSLATE_BASE_URL ||
      'https://api.openai.com/v1'
    ).trim(),
    apiKey: String(
      process.env.VITE_FY_API_KEY ||
      process.env.LITERATURE_TRANSLATE_API_KEY ||
      ''
    ).trim(),
    model: String(
      process.env.VITE_FY_MODEL ||
      process.env.LITERATURE_TRANSLATE_MODEL ||
      'deepl-en'
    ).trim() || 'deepl-en',
    fallbackModels: parseStringList(
      process.env.VITE_FY_FALLBACK_MODELS ||
      process.env.LITERATURE_TRANSLATE_FALLBACK_MODELS ||
      'gpt-4o-mini,gpt-4.1-mini,deepseek-chat'
    ),
  },

  // OpenDraft backend service proxy
  opendraft: {
    baseUrl: resolveOpenDraftBaseUrl(),
  },
}
