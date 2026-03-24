'use strict'
const path = require('path')
const fs = require('fs')
const Fastify = require('fastify')
const axios = require('axios')
const config = require('./config')
const { db } = require('./db')

const runtimeNodeEnv = process.env.SERVER_NODE_ENV || process.env.NODE_ENV || config.nodeEnv || 'production'

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: runtimeNodeEnv !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  trustProxy: true,
  bodyLimit: 50 * 1024 * 1024, // 50 MB
})

function normalizeTokenUser(rawUser) {
  const user = rawUser || {}
  const id = String(user.uid || user.id || '').trim()
  const username = String(user.username || user.email || '').trim() || (id ? `user_${id.slice(-6)}` : 'user')
  const email = String(user.email || '').trim()
  const role = user.role === 'admin' ? 'admin' : 'user'
  const serviceKey = String(user.service_key || '').trim().toLowerCase()

  return {
    id,
    uid: id,
    username,
    email: email || null,
    role,
    service_key: serviceKey || null,
  }
}

async function upsertUserFromToken(user) {
  if (!user || !user.id) return
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO users (id, email, username, password, role, created_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      email = COALESCE(VALUES(email), email),
      username = VALUES(username),
      role = VALUES(role),
      updated_at = VALUES(updated_at)
  `).run(user.id, user.email, user.username, user.role, now, now)
}

const mindUserAuthCache = new Map()
const MINDUSER_AUTH_CACHE_TTL_MS = Number.isFinite(Number.parseInt(process.env.MINDUSER_AUTH_CACHE_TTL_MS, 10))
  ? Math.max(Number.parseInt(process.env.MINDUSER_AUTH_CACHE_TTL_MS, 10), 1000)
  : 30000
const MINDUSER_AUTH_FAILURE_CACHE_TTL_MS = Number.isFinite(Number.parseInt(process.env.MINDUSER_AUTH_FAILURE_CACHE_TTL_MS, 10))
  ? Math.max(Number.parseInt(process.env.MINDUSER_AUTH_FAILURE_CACHE_TTL_MS, 10), 1000)
  : 5000
const MINDUSER_AUTH_CACHE_MAX_ENTRIES = 2000

function parseBearerToken(authHeader) {
  const raw = String(authHeader || '').trim()
  if (!raw) return ''
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match && match[1] ? String(match[1]).trim() : ''
}

function resolveMindUserAuthUrl() {
  const baseUrl = String(config.billing?.mindUserBaseUrl || '').trim().replace(/\/+$/, '')
  if (!baseUrl) return ''
  const serviceKey = String(config.minduser?.serviceKey || 'mindplus').trim().toLowerCase() || 'mindplus'
  return `${baseUrl}/api/${encodeURIComponent(serviceKey)}/auth/me`
}

const mindUserAuthUrl = resolveMindUserAuthUrl()

function getCachedMindUserAuth(token) {
  const cached = mindUserAuthCache.get(token)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    mindUserAuthCache.delete(token)
    return null
  }
  return cached.result
}

function setCachedMindUserAuth(token, result) {
  if (!token) return
  if (mindUserAuthCache.size >= MINDUSER_AUTH_CACHE_MAX_ENTRIES) {
    const oldest = mindUserAuthCache.keys().next()
    if (!oldest.done) {
      mindUserAuthCache.delete(oldest.value)
    }
  }
  const ttl = result?.ok ? MINDUSER_AUTH_CACHE_TTL_MS : MINDUSER_AUTH_FAILURE_CACHE_TTL_MS
  mindUserAuthCache.set(token, { result, expiresAt: Date.now() + ttl })
}

function classifyMindUserAuthFailure(statusCode, payload) {
  const rawMessage = String(payload?.message || payload?.msg || '').trim()
  const messageLower = rawMessage.toLowerCase()

  const isDisabled =
    statusCode === 403 ||
    rawMessage.includes('停用') ||
    rawMessage.includes('禁用') ||
    (rawMessage.includes('账号') && rawMessage.includes('异常')) ||
    messageLower.includes('disabled')
  if (isDisabled) {
    return {
      ok: false,
      statusCode: 403,
      errorCode: 'USER_DISABLED',
      message: '账号存在异常，请联系管理员',
    }
  }

  const isUnregistered =
    statusCode === 401 ||
    statusCode === 404 ||
    rawMessage.includes('未注册') ||
    rawMessage.includes('不存在') ||
    messageLower.includes('not found') ||
    messageLower.includes('not registered')
  if (isUnregistered) {
    return {
      ok: false,
      statusCode: 401,
      errorCode: 'USER_NOT_REGISTERED',
      message: '用户未注册',
    }
  }

  const safeStatusCode =
    Number.isFinite(Number(statusCode)) && Number(statusCode) >= 400 && Number(statusCode) <= 599
      ? Number(statusCode)
      : 502
  return {
    ok: false,
    statusCode: safeStatusCode,
    errorCode: 'MINDUSER_AUTH_CHECK_FAILED',
    message: rawMessage || '账号状态校验失败，请稍后重试',
  }
}

function applyMindUserProfileToNormalized(normalized, profile) {
  if (!normalized || !profile || typeof profile !== 'object') return normalized
  const username = String(profile.username || '').trim()
  const email = String(profile.email || '').trim()
  const serviceKey = String(profile.service_key || '').trim().toLowerCase()

  if (username) normalized.username = username
  normalized.email = email || null
  normalized.role = profile.role === 'admin' ? 'admin' : 'user'
  if (serviceKey) normalized.service_key = serviceKey
  return normalized
}

async function validateMindUserAccount(authHeader) {
  if (!mindUserAuthUrl) {
    return { ok: true, profile: null }
  }

  const token = parseBearerToken(authHeader)
  if (!token) {
    return {
      ok: false,
      statusCode: 401,
      errorCode: 'AUTH_TOKEN_INVALID',
      message: '未登录或 token 已过期',
    }
  }

  const cached = getCachedMindUserAuth(token)
  if (cached) return cached

  try {
    const response = await axios.get(mindUserAuthUrl, {
      headers: { Authorization: `Bearer ${token}` },
      proxy: false,
      timeout: 10000,
      validateStatus: () => true,
    })
    const payload = response?.data || {}

    if (response.status >= 200 && response.status < 300 && Number(payload?.code) === 200) {
      const result = {
        ok: true,
        profile: payload?.data || null,
      }
      setCachedMindUserAuth(token, result)
      return result
    }

    const failed = classifyMindUserAuthFailure(response?.status, payload)
    setCachedMindUserAuth(token, failed)
    return failed
  } catch {
    const failed = {
      ok: false,
      statusCode: 502,
      errorCode: 'MINDUSER_AUTH_CHECK_FAILED',
      message: '账号状态校验失败，请稍后重试',
    }
    setCachedMindUserAuth(token, failed)
    return failed
  }
}

// ─── Plugins ─────────────────────────────────────────────────────────────────

fastify.register(require('@fastify/cors'), {
  origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map(s => s.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
})

fastify.register(require('@fastify/jwt'), {
  secret: config.minduser.jwtSecret,
  sign: { expiresIn: config.jwtExpiry },
})

fastify.register(require('@fastify/multipart'), {
  limits: { fileSize: 50 * 1024 * 1024 },
})

fastify.register(require('@fastify/rate-limit'), {
  max: 300,
  timeWindow: '1 minute',
  skipOnError: true,
})

// Serve uploaded files as static assets
const uploadDir = path.resolve(config.uploadDir)
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
fastify.register(require('@fastify/static'), {
  root: uploadDir,
  prefix: '/uploads/',
})

// Serve built frontend static files at /slide/
const slideBuildDir = path.resolve(__dirname, '..', 'slide')
if (fs.existsSync(slideBuildDir)) {
  fastify.register(require('@fastify/static'), {
    root: slideBuildDir,
    prefix: '/slide/',
    decorateReply: false,
    wildcard: false,
  })
  // SPA fallback: serve index.html for any /slide/* that doesn't match a file
  fastify.get('/slide/*', (req, reply) => {
    reply.sendFile('index.html', slideBuildDir)
  })
  fastify.get('/slide', (req, reply) => {
    reply.redirect('/slide/')
  })
}

// ─── Auth decorator ──────────────────────────────────────────────────────────

fastify.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify()
    const normalized = normalizeTokenUser(req.user)
    if (!normalized.id) {
      return reply.code(401).send({ code: 401, data: null, message: '登录态无效：缺少 uid' })
    }

    const mindUserValidation = await validateMindUserAccount(req.headers?.authorization)
    if (!mindUserValidation.ok) {
      return reply.code(mindUserValidation.statusCode).send({
        code: mindUserValidation.statusCode,
        data: null,
        message: mindUserValidation.message,
        errorCode: mindUserValidation.errorCode,
      })
    }

    const remoteUid = String(
      mindUserValidation?.profile?.id || mindUserValidation?.profile?.uid || ''
    ).trim()
    if (remoteUid && remoteUid !== normalized.id) {
      return reply.code(401).send({
        code: 401,
        data: null,
        message: '登录态无效，请重新登录',
        errorCode: 'AUTH_UID_MISMATCH',
      })
    }

    applyMindUserProfileToNormalized(normalized, mindUserValidation.profile)
    if (normalized.service_key && normalized.service_key !== config.minduser.serviceKey) {
      return reply.code(403).send({ code: 403, data: null, message: '无权访问当前服务数据' })
    }
    await upsertUserFromToken(normalized)
    req.user = { ...(req.user || {}), ...normalized, id: normalized.id, uid: normalized.id }
  } catch (err) {
    return reply.code(401).send({ code: 401, data: null, message: '未登录或 token 已过期' })
  }
})

// Optional auth: attach user if token present, but don't reject
fastify.decorate('optionalAuth', async (req) => {
  try {
    await req.jwtVerify()
    const normalized = normalizeTokenUser(req.user)
    if (!normalized.id) return
    const mindUserValidation = await validateMindUserAccount(req.headers?.authorization)
    if (!mindUserValidation.ok) return
    applyMindUserProfileToNormalized(normalized, mindUserValidation.profile)
    if (normalized.service_key && normalized.service_key !== config.minduser.serviceKey) return
    await upsertUserFromToken(normalized)
    req.user = { ...(req.user || {}), ...normalized, id: normalized.id, uid: normalized.id }
  } catch {}
})

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
fastify.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }))

// Auth routes: /api/auth/*
fastify.register(require('./routes/auth'),          { prefix: '/api/auth' })

// Presentations: /api/presentations/*
fastify.register(require('./routes/presentations'), { prefix: '/api/presentations' })

// Versions: /api/presentations/:docId/versions/*
fastify.register(
  async (instance) => {
    instance.register(require('./routes/versions'), { prefix: '/:docId/versions' })
  },
  { prefix: '/api/presentations' }
)

// Templates: /api/templates/*
fastify.register(require('./routes/templates'),     { prefix: '/api/templates' })

// Coze AI proxy: /api/coze/*
fastify.register(require('./routes/coze'),          { prefix: '/api/coze' })

// Speech: /api/speech/*
fastify.register(require('./routes/speech'),        { prefix: '/api/speech' })

// Documents: /documents/*  (no /api prefix — frontend calls these directly)
fastify.register(require('./routes/documents'),     { prefix: '/documents' })

// Comments: /comments/*
fastify.register(require('./routes/comments'),      { prefix: '/comments' })

// AI trial: /ai/*
fastify.register(require('./routes/ai'),            { prefix: '/ai' })

// File upload: /upload/*
fastify.register(require('./routes/files'),         { prefix: '/upload' })

// Parse endpoints: /parse/*
fastify.register(
  async (instance) => {
    instance.register(require('./routes/files'), { prefix: '' })
  },
  { prefix: '/parse' }
)

// Mock data: /mock/*
fastify.register(require('./routes/mock'),          { prefix: '/mock' })

// User & Admin: /user/* and /admin/*
fastify.register(require('./routes/user'),          { prefix: '/user' })
fastify.register(require('./routes/user'),          { prefix: '/admin' })

// Credits billing: /api/billing/*
fastify.register(require('./routes/billing'),       { prefix: '/api/billing' })

// Platform notices: /api/notices/*
fastify.register(require('./routes/notices'),       { prefix: '/api/notices' })

// Literature tools: /api/literature/* (LINGINE OCR via glm-4v + translation via deepl-en)
fastify.register(require('./routes/literature'),    { prefix: '/api/literature' })

// AIPPT history: /api/aippt/* (MySQL persistence for "我的作品")
fastify.register(require('./routes/aippt'),         { prefix: '/api/aippt' })

// OpenDraft tools: /api/opendraft/*
fastify.register(require('./routes/opendraft'),     { prefix: '/api/opendraft' })

// ─── Global error handler ────────────────────────────────────────────────────

fastify.setErrorHandler((err, req, reply) => {
  fastify.log.error({ err, url: req.url }, 'Unhandled error')
  if (err.validation) {
    return reply.code(400).send({ code: 400, data: null, message: err.message })
  }
  if (err.statusCode === 429) {
    return reply.code(429).send({ code: 429, data: null, message: '请求太频繁，请稍后再试' })
  }
  reply.code(err.statusCode || 500).send({ code: err.statusCode || 500, data: null, message: err.message || '服务器内部错误' })
})

fastify.setNotFoundHandler((req, reply) => {
  reply.code(404).send({ code: 404, data: null, message: `接口不存在: ${req.method} ${req.url}` })
})

// ─── Start ───────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    await db.init()
    await fastify.listen({ port: config.port, host: config.host })
    fastify.log.info(`Server running on http://${config.host}:${config.port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => { await fastify.close(); process.exit(0) })
process.on('SIGINT',  async () => { await fastify.close(); process.exit(0) })

start()
