'use strict'
const axios = require('axios')
const config = require('../config')
const { BILLING_SCENES, chargeCreditsForScene, refundChargeById } = require('../services/billing')

function normalizeBaseUrl(raw) {
  const base = String(raw || '').trim()
  if (!base) return ''
  return base.replace(/\/+$/, '')
}

function normalizeTimeout(value, fallback) {
  if (value === 0 || value === '0') return 0
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  if (n === 0) return 0
  return Math.floor(n)
}

function makeErrorPayload(statusCode, message) {
  return {
    code: statusCode,
    message: String(message || 'OpenDraft 服务请求失败'),
    data: null,
  }
}

function parsePayloadFromBuffer(raw, statusCode) {
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw || '')
  if (!buffer.length) {
    return makeErrorPayload(statusCode, `OpenDraft 服务返回异常（${statusCode}）`)
  }

  const text = buffer.toString('utf-8')
  try {
    const payload = JSON.parse(text)
    if (payload && typeof payload === 'object') return payload
  } catch {}

  return makeErrorPayload(statusCode, text || `OpenDraft 服务返回异常（${statusCode}）`)
}

function normalizeStatusCode(value, fallback = 500) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 100 || n > 599) return fallback
  return Math.floor(n)
}

function asPlainObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input
}

function extractJobIdFromPayload(payload) {
  const source = asPlainObject(payload)
  const nested = asPlainObject(source.data)
  return String(
    source.job_id ||
    source.jobId ||
    source.id ||
    nested.job_id ||
    nested.jobId ||
    nested.id ||
    ''
  ).trim()
}

function extractErrorMessage(payload) {
  const source = asPlainObject(payload)
  const nested = asPlainObject(source.data)
  return String(
    source.error ||
    source.message ||
    source.detail ||
    nested.error ||
    nested.message ||
    ''
  ).trim()
}

function normalizeBillingMetaValue(value, maxLen = 160) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.slice(0, maxLen)
}

function buildGenerateBillingMeta(req) {
  const body = asPlainObject(req?.body)
  const rawFormats = Array.isArray(body.formats) ? body.formats : []
  const formats = rawFormats
    .map(item => normalizeBillingMetaValue(item, 24).toLowerCase())
    .filter(Boolean)
    .slice(0, 6)

  return {
    topic: normalizeBillingMetaValue(body.topic, 240),
    language: normalizeBillingMetaValue(body.language, 24),
    level: normalizeBillingMetaValue(body.level, 32),
    targetWords: normalizeBillingMetaValue(body.target_words, 24),
    targetCitations: normalizeBillingMetaValue(body.target_citations, 24),
    hasOutline: Boolean(normalizeBillingMetaValue(body.outline, 16_000)),
    formats,
  }
}

function normalizeAcademicLevel(rawLevel) {
  const raw = String(rawLevel || '').trim()
  const text = raw.toLowerCase()

  if (text === 'research_paper' || text === 'research' || raw === '研究' || raw === '研究论文') {
    return 'research_paper'
  }
  if (text === 'bachelor' || text === 'undergraduate' || raw === '本科') {
    return 'bachelor'
  }
  if (text === 'master' || raw === '硕士') {
    return 'master'
  }
  if (text === 'phd' || raw === '博士') {
    return 'phd'
  }
  return 'research_paper'
}

function resolveGeneratePriceByLevel(rawLevel) {
  const academicLevel = normalizeAcademicLevel(rawLevel)
  const prices = config.billing?.prices || {}
  const unitPriceByLevel = {
    research_paper: Number(prices.literature_assistant_research),
    bachelor: Number(prices.literature_assistant_bachelor),
    master: Number(prices.literature_assistant_master),
    phd: Number(prices.literature_assistant_phd),
  }

  const fallbackPriceByLevel = {
    research_paper: 20,
    bachelor: 33,
    master: 50,
    phd: 100,
  }

  const configuredUnitPrice = unitPriceByLevel[academicLevel]
  const unitPrice = Number.isFinite(configuredUnitPrice)
    ? configuredUnitPrice
    : fallbackPriceByLevel[academicLevel]

  return {
    academicLevel,
    unitPrice,
  }
}

function resolveGenerateBillingSceneByLevel(academicLevel) {
  if (academicLevel === 'bachelor') {
    return BILLING_SCENES.LITERATURE_ASSISTANT_BACHELOR
  }
  if (academicLevel === 'master') {
    return BILLING_SCENES.LITERATURE_ASSISTANT_MASTER
  }
  if (academicLevel === 'phd') {
    return BILLING_SCENES.LITERATURE_ASSISTANT_PHD
  }
  return BILLING_SCENES.LITERATURE_ASSISTANT_RESEARCH
}

function getUserContext(req) {
  const user = req && typeof req === 'object' ? (req.user || {}) : {}
  const userId = String(user.id || user.uid || '').trim()
  const username = String(user.username || '').trim()
  const serviceKey = String(user.service_key || '').trim().toLowerCase()
  const authorization = String(req?.headers?.authorization || '').trim()

  return {
    userId,
    username,
    serviceKey,
    authorization,
  }
}

function getUpstreamHeaders(req, context, options = {}) {
  const headers = {
    'content-type': 'application/json',
  }

  const userContext = getUserContext(req)
  const serviceToken = String(context?.serviceToken || '').trim()
  const useUserAuthAsAuthorization = !!options.useUserAuthAsAuthorization

  if (useUserAuthAsAuthorization && userContext.authorization) {
    headers.authorization = userContext.authorization
  } else if (serviceToken) {
    headers.authorization = `Bearer ${serviceToken}`
  }

  if (userContext.userId) {
    headers['x-user-id'] = userContext.userId
    headers['x-user-uid'] = userContext.userId
  }
  if (userContext.username) {
    headers['x-user-name'] = userContext.username
  }
  if (userContext.serviceKey) {
    headers['x-service-key'] = userContext.serviceKey
  }
  if (userContext.authorization) {
    headers['x-mindplus-user-authorization'] = userContext.authorization
  }

  return headers
}

function stripTokenParam(input) {
  const source = input && typeof input === 'object' ? input : {}
  const clean = { ...source }
  delete clean.token
  return clean
}

function appendUserContextToParams(req, input) {
  const params = stripTokenParam(input)
  const userContext = getUserContext(req)
  if (userContext.userId && params.uid === undefined) params.uid = userContext.userId
  if (userContext.username && params.username === undefined) params.username = userContext.username
  if (userContext.serviceKey && params.service_key === undefined) params.service_key = userContext.serviceKey
  return params
}

function appendUserContextToData(req, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const userContext = getUserContext(req)
  const payload = { ...input }
  if (userContext.userId && payload.uid === undefined) payload.uid = userContext.userId
  if (userContext.username && payload.username === undefined) payload.username = userContext.username
  if (userContext.serviceKey && payload.service_key === undefined) payload.service_key = userContext.serviceKey
  return payload
}

function buildSseCorsHeaders(req) {
  const requestOrigin = String(req?.headers?.origin || '').trim()
  const configured = String(config.corsOrigin || '*').trim()
  const allowCredentials = 'true'

  if (!configured || configured === '*') {
    return {
      'access-control-allow-origin': requestOrigin || '*',
      'access-control-allow-credentials': allowCredentials,
      ...(requestOrigin ? { vary: 'Origin' } : {}),
    }
  }

  if (!requestOrigin) return {}
  const allowedOrigins = configured
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)

  if (allowedOrigins.includes(requestOrigin)) {
    return {
      'access-control-allow-origin': requestOrigin,
      'access-control-allow-credentials': allowCredentials,
      vary: 'Origin',
    }
  }

  return {}
}

async function readStreamAsString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

function buildProxyContext({
  name,
  baseUrl,
  authToken,
  requestTimeout,
  downloadTimeout,
}) {
  const upstreamBaseUrl = normalizeBaseUrl(baseUrl)
  const NO_TIMEOUT_MS = 0
  return {
    name: String(name || 'OpenDraft'),
    upstreamBaseUrl,
    serviceToken: String(authToken || '').trim(),
    requestTimeout: normalizeTimeout(requestTimeout, NO_TIMEOUT_MS),
    downloadTimeout: normalizeTimeout(downloadTimeout, NO_TIMEOUT_MS),
    client: axios.create({
      baseURL: upstreamBaseUrl,
      // Force direct connection to upstream; avoid host proxy env hijacking localhost/127.0.0.1 traffic.
      proxy: false,
      timeout: normalizeTimeout(requestTimeout, NO_TIMEOUT_MS),
      validateStatus: () => true,
    }),
  }
}

module.exports = async function opendraftRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] }
  const NO_TIMEOUT_MS = 0

  async function injectQueryTokenToAuthorization(req) {
    const hasHeaderAuth = String(req.headers?.authorization || '').trim()
    if (hasHeaderAuth) return

    const queryToken = String(req.query?.token || '').trim()
    if (!queryToken) return

    req.headers.authorization = `Bearer ${queryToken}`
  }

  const tokenAuth = { preHandler: [injectQueryTokenToAuthorization, fastify.authenticate] }

  const primaryProxyContext = buildProxyContext({
    name: 'OpenDraft',
    baseUrl: config.opendraft?.baseUrl,
    requestTimeout: NO_TIMEOUT_MS,
    downloadTimeout: NO_TIMEOUT_MS,
  })
  const legacyProxyContext = buildProxyContext({
    name: 'OpenDraft legacy',
    baseUrl: config.opendraft?.baseUrl,
    requestTimeout: NO_TIMEOUT_MS,
    downloadTimeout: NO_TIMEOUT_MS,
  })
  const legacyProxyOptions = {
    context: legacyProxyContext,
    includeUserContext: true,
    useUserAuthAsAuthorization: true,
  }
  const directProxyOptions = {
    context: primaryProxyContext,
    includeUserContext: true,
    useUserAuthAsAuthorization: true,
  }

  async function tryRefundGenerateCharge({ req, chargeResult, billingScene, billingMeta, reason, errorMessage }) {
    if (!chargeResult?.charged || !chargeResult?.chargeId) return null
    try {
      return await refundChargeById({
        req,
        chargeId: chargeResult.chargeId,
        reason: String(reason || 'credits退款，调用失败'),
        meta: {
          scene: String(billingScene || chargeResult?.scene || BILLING_SCENES.LITERATURE_ASSISTANT_RESEARCH),
          phase: 'opendraft_generate',
          error: normalizeBillingMetaValue(errorMessage, 500),
          ...billingMeta,
        },
      })
    } catch (refundError) {
      fastify.log.error(
        {
          err: refundError,
          chargeId: chargeResult?.chargeId,
        },
        'OpenDraft generate refund failed'
      )
      return null
    }
  }

  function createGenerateProxyHandler(proxyOptions) {
    return async function generateWithBilling(req, reply) {
      const billingMeta = buildGenerateBillingMeta(req)
      const levelPricing = resolveGeneratePriceByLevel(req?.body?.level || billingMeta.level)
      const billingScene = resolveGenerateBillingSceneByLevel(levelPricing.academicLevel)
      const enrichedBillingMeta = {
        ...billingMeta,
        level: levelPricing.academicLevel,
        academicLevel: levelPricing.academicLevel,
        unitPrice: levelPricing.unitPrice,
        billingScene,
      }
      let chargeResult = null
      try {
        chargeResult = await chargeCreditsForScene({
          req,
          scene: billingScene,
          amount: levelPricing.unitPrice,
          meta: enrichedBillingMeta,
        })
      } catch (error) {
        const statusCode = normalizeStatusCode(error?.statusCode, 500)
        return reply.code(statusCode).send({
          error: String(error?.message || '文献辅助编撰扣费失败'),
          code: String(error?.code || 'BILLING_FAILED'),
          data: error?.data || null,
        })
      }

      return proxyJson(req, reply, 'POST', '/api/generate', {
        ...proxyOptions,
        fallbackPaths: ['/generate'],
        async transformResponse({ upstream, payload }) {
          const upstreamStatus = normalizeStatusCode(upstream?.status, 502)
          const success = upstreamStatus >= 200 && upstreamStatus < 300 && Boolean(extractJobIdFromPayload(payload))
          if (success) {
            if (payload && typeof payload === 'object') {
              return { payload: { ...payload, billing: chargeResult } }
            }
            return { payload }
          }

          const upstreamMessage = extractErrorMessage(payload) || `HTTP ${upstreamStatus}`
          const refundResult = await tryRefundGenerateCharge({
            req,
            chargeResult,
            billingScene,
            billingMeta: enrichedBillingMeta,
            reason: 'credits退款，调用失败',
            errorMessage: upstreamMessage,
          })

          const failBody = payload && typeof payload === 'object'
            ? { ...payload }
            : makeErrorPayload(upstreamStatus, `${proxyOptions?.context?.name || 'OpenDraft'} 生成失败（${upstreamStatus}）`)
          failBody.billing = {
            charge: chargeResult,
            refund: refundResult,
          }

          return {
            statusCode: upstreamStatus,
            body: failBody,
          }
        },
        async onRequestError({ error }) {
          const refundResult = await tryRefundGenerateCharge({
            req,
            chargeResult,
            billingScene,
            billingMeta: enrichedBillingMeta,
            reason: 'credits退款，调用失败',
            errorMessage: String(error?.message || ''),
          })

          return {
            statusCode: 502,
            body: {
              ...makeErrorPayload(502, `${proxyOptions?.context?.name || 'OpenDraft'} 服务不可用，请稍后重试`),
              billing: {
                charge: chargeResult,
                refund: refundResult,
              },
            },
          }
        },
      })
    }
  }

  fastify.log.info(
    {
      primaryUpstream: primaryProxyContext.upstreamBaseUrl || null,
      legacyUpstream: legacyProxyContext.upstreamBaseUrl || null,
    },
    'OpenDraft proxy upstream resolved'
  )

  if (!primaryProxyContext.upstreamBaseUrl) {
    fastify.log.warn('OpenDraft proxy disabled: OPENDRAFT_SERVICE_BASE_URL is empty')
  }
  if (!legacyProxyContext.upstreamBaseUrl) {
    fastify.log.warn('OpenDraft legacy proxy disabled: OPENDRAFT_SERVICE_BASE_URL is empty')
  }

  async function proxyJson(req, reply, method, targetPath, options = {}) {
    const context = options.context || primaryProxyContext
    if (!context.upstreamBaseUrl) {
      return reply.code(503).send(makeErrorPayload(503, `${context.name} 服务未配置`))
    }

    try {
      const sourceParams = options.params !== undefined ? options.params : (req.query || {})
      const sourceData = options.data !== undefined ? options.data : req.body
      const fallbackPaths = Array.isArray(options.fallbackPaths)
        ? options.fallbackPaths.filter(Boolean).map(p => String(p))
        : []
      const triedPaths = [String(targetPath), ...fallbackPaths]
      let upstream = null

      for (let i = 0; i < triedPaths.length; i += 1) {
        const currentPath = triedPaths[i]
        upstream = await context.client.request({
          method,
          url: currentPath,
          params: options.includeUserContext
            ? appendUserContextToParams(req, sourceParams)
            : stripTokenParam(sourceParams),
          data: options.includeUserContext
            ? appendUserContextToData(req, sourceData)
            : sourceData,
          headers: getUpstreamHeaders(req, context, options),
          timeout: normalizeTimeout(options.timeout, context.requestTimeout),
        })

        const shouldFallback = upstream.status === 404 && i < triedPaths.length - 1
        if (!shouldFallback) break

        fastify.log.warn(
          {
            upstream: context.name,
            method,
            attemptedPath: currentPath,
            nextPath: triedPaths[i + 1],
          },
          'OpenDraft upstream path returned 404, trying fallback path'
        )
      }

      let payload = upstream?.data && typeof upstream.data === 'object'
        ? upstream.data
        : makeErrorPayload(upstream.status, `${context.name} 服务返回异常（${upstream.status}）`)

      if (typeof options.transformResponse === 'function') {
        const transformed = await options.transformResponse({
          req,
          reply,
          context,
          method,
          targetPath,
          upstream,
          payload,
        })

        if (transformed && typeof transformed === 'object') {
          if (Object.prototype.hasOwnProperty.call(transformed, 'statusCode') || Object.prototype.hasOwnProperty.call(transformed, 'body')) {
            const statusCode = normalizeStatusCode(transformed.statusCode, normalizeStatusCode(upstream?.status, 502))
            return reply.code(statusCode).send(transformed.body)
          }
          if (Object.prototype.hasOwnProperty.call(transformed, 'payload')) {
            payload = transformed.payload
          }
        }
      }

      return reply.code(upstream.status).send(payload)
    } catch (error) {
      if (typeof options.onRequestError === 'function') {
        try {
          const handled = await options.onRequestError({
            req,
            reply,
            context,
            method,
            targetPath,
            error,
          })
          if (handled && typeof handled === 'object') {
            const statusCode = normalizeStatusCode(handled.statusCode, 502)
            return reply.code(statusCode).send(handled.body)
          }
        } catch (hookError) {
          fastify.log.error(
            {
              err: hookError,
              url: targetPath,
              method,
              upstream: context.name,
            },
            'OpenDraft proxy request error hook failed'
          )
        }
      }

      fastify.log.error(
        {
          err: error,
          url: targetPath,
          method,
          upstream: context.name,
        },
        'OpenDraft proxy request failed'
      )
      return reply.code(502).send(makeErrorPayload(502, `${context.name} 服务不可用，请稍后重试`))
    }
  }

  async function proxyBinary(req, reply, method, targetPath, options = {}) {
    const context = options.context || primaryProxyContext
    if (!context.upstreamBaseUrl) {
      return reply.code(503).send(makeErrorPayload(503, `${context.name} 服务未配置`))
    }

    try {
      const sourceParams = options.params !== undefined ? options.params : (req.query || {})
      const sourceData = options.data !== undefined ? options.data : req.body
      const upstream = await context.client.request({
        method,
        url: targetPath,
        params: options.includeUserContext
          ? appendUserContextToParams(req, sourceParams)
          : stripTokenParam(sourceParams),
        data: options.includeUserContext
          ? appendUserContextToData(req, sourceData)
          : sourceData,
        responseType: 'arraybuffer',
        headers: getUpstreamHeaders(req, context, options),
        timeout: normalizeTimeout(options.timeout, context.downloadTimeout),
      })

      if (upstream.status < 200 || upstream.status >= 300) {
        const payload = parsePayloadFromBuffer(upstream.data, upstream.status)
        return reply.code(upstream.status).send(payload)
      }

      const contentType = upstream.headers?.['content-type'] || options.defaultContentType || 'application/octet-stream'
      const disposition = upstream.headers?.['content-disposition']
      const length = upstream.headers?.['content-length']

      reply.code(upstream.status)
      reply.header('content-type', contentType)
      if (disposition) reply.header('content-disposition', disposition)
      if (length) reply.header('content-length', length)

      return reply.send(Buffer.from(upstream.data))
    } catch (error) {
      fastify.log.error(
        {
          err: error,
          url: targetPath,
          method,
          upstream: context.name,
        },
        'OpenDraft binary proxy failed'
      )
      return reply.code(502).send(makeErrorPayload(502, `${context.name} 文件服务不可用，请稍后重试`))
    }
  }

  async function proxySse(req, reply, targetPath, options = {}) {
    const context = options.context || primaryProxyContext
    if (!context.upstreamBaseUrl) {
      return reply.code(503).send(makeErrorPayload(503, `${context.name} 服务未配置`))
    }

    try {
      const sourceParams = req.query || {}
      const upstream = await axios.request({
        method: 'GET',
        baseURL: context.upstreamBaseUrl,
        // Keep SSE on direct socket path, same as JSON/Binary proxy client.
        proxy: false,
        url: targetPath,
        params: options.includeUserContext
          ? appendUserContextToParams(req, sourceParams)
          : stripTokenParam(sourceParams),
        responseType: 'stream',
        headers: getUpstreamHeaders(req, context, options),
        timeout: 0,
        validateStatus: () => true,
      })

      if (upstream.status < 200 || upstream.status >= 300) {
        const text = await readStreamAsString(upstream.data)
        const payload = parsePayloadFromBuffer(Buffer.from(text || ''), upstream.status)
        return reply.code(upstream.status).send(payload)
      }

      const headers = {
        'content-type': upstream.headers?.['content-type'] || 'text/event-stream',
        'cache-control': upstream.headers?.['cache-control'] || 'no-cache',
        connection: upstream.headers?.connection || 'keep-alive',
        'x-accel-buffering': upstream.headers?.['x-accel-buffering'] || 'no',
        ...buildSseCorsHeaders(req),
      }

      reply.hijack()
      reply.raw.writeHead(200, headers)
      upstream.data.pipe(reply.raw)

      let cleaned = false
      const cleanupUpstream = () => {
        if (cleaned) return
        cleaned = true
        try {
          upstream.data.unpipe(reply.raw)
        } catch {}
        try {
          upstream.data.destroy()
        } catch {}
      }

      // `req.raw.close` may fire right after request body is consumed for GET,
      // which would prematurely destroy SSE upstream. We only clean up on
      // actual downstream socket close/abort.
      reply.raw.on('close', cleanupUpstream)
      req.raw.on('aborted', cleanupUpstream)
    } catch (error) {
      fastify.log.error(
        {
          err: error,
          url: targetPath,
          method: 'GET',
          upstream: context.name,
        },
        'OpenDraft stream proxy failed'
      )
      return reply.code(502).send(makeErrorPayload(502, `${context.name} 流式服务不可用，请稍后重试`))
    }
  }

  fastify.get('/health', auth, async (req, reply) => {
    return proxyJson(req, reply, 'GET', '/api/opendraft/health')
  })

  fastify.get('/jobs', auth, async (req, reply) => {
    return proxyJson(req, reply, 'GET', '/api/opendraft/jobs')
  })

  fastify.get('/jobs/stats', auth, async (req, reply) => {
    return proxyJson(req, reply, 'GET', '/api/opendraft/jobs/stats')
  })

  fastify.post('/jobs', auth, async (req, reply) => {
    return proxyJson(req, reply, 'POST', '/api/opendraft/jobs')
  })

  fastify.get('/jobs/:jobId', auth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/opendraft/jobs/${jobId}`)
  })

  fastify.get('/jobs/:jobId/logs', auth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/opendraft/jobs/${jobId}/logs`)
  })

  fastify.get('/jobs/:jobId/files', auth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/opendraft/jobs/${jobId}/files`)
  })

  fastify.post('/jobs/:jobId/cancel', auth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'POST', `/api/opendraft/jobs/${jobId}/cancel`, { data: {} })
  })

  fastify.post('/jobs/:jobId/retry', auth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'POST', `/api/opendraft/jobs/${jobId}/retry`, { data: {} })
  })

  fastify.get('/jobs/:jobId/download/:format', auth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    const format = encodeURIComponent(String(req.params?.format || '').trim().toLowerCase())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    if (!format) return reply.code(400).send(makeErrorPayload(400, 'format 不能为空'))
    return proxyBinary(req, reply, 'GET', `/api/opendraft/jobs/${jobId}/download/${format}`)
  })

  fastify.get('/jobs/:jobId/stream', auth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxySse(req, reply, `/api/opendraft/jobs/${jobId}/stream`)
  })

  // OpenDraft project API proxy (preferred, no legacy prefix)
  fastify.get('/papers', tokenAuth, async (req, reply) => {
    return proxyJson(req, reply, 'GET', '/api/papers', { ...directProxyOptions })
  })

  fastify.delete('/papers/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'DELETE', `/api/papers/${jobId}`, { ...directProxyOptions })
  })

  fastify.post('/outline', tokenAuth, async (req, reply) => {
    return proxyJson(req, reply, 'POST', '/api/outline', {
      ...directProxyOptions,
      fallbackPaths: ['/outline'],
    })
  })

  fastify.post('/generate', tokenAuth, createGenerateProxyHandler(directProxyOptions))

  fastify.post('/approve/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'POST', `/api/approve/${jobId}`, {
      ...directProxyOptions,
      fallbackPaths: [`/approve/${jobId}`],
    })
  })

  fastify.get('/status/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/status/${jobId}`, {
      ...directProxyOptions,
      fallbackPaths: [`/status/${jobId}`],
    })
  })

  fastify.post('/cancel/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'POST', `/api/cancel/${jobId}`, {
      ...directProxyOptions,
      data: req.body || {},
      fallbackPaths: [`/cancel/${jobId}`],
    })
  })

  fastify.get('/stream/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxySse(req, reply, `/api/stream/${jobId}`, { ...directProxyOptions })
  })

  fastify.get('/md/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/md/${jobId}`, {
      ...directProxyOptions,
      fallbackPaths: [`/md/${jobId}`],
    })
  })

  fastify.post('/save/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'POST', `/api/save/${jobId}`, {
      ...directProxyOptions,
      fallbackPaths: [`/save/${jobId}`],
    })
  })

  fastify.post('/chat', tokenAuth, async (req, reply) => {
    return proxyJson(req, reply, 'POST', '/api/chat', {
      ...directProxyOptions,
      fallbackPaths: ['/chat'],
    })
  })

  fastify.get('/preview/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyBinary(req, reply, 'GET', `/api/preview/${jobId}`, {
      ...directProxyOptions,
      defaultContentType: 'text/html; charset=utf-8',
      timeout: primaryProxyContext.downloadTimeout,
    })
  })

  fastify.get('/download/:jobId/:format', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    const format = encodeURIComponent(String(req.params?.format || '').trim().toLowerCase())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    if (!format) return reply.code(400).send(makeErrorPayload(400, 'format 不能为空'))
    return proxyBinary(req, reply, 'GET', `/api/download/${jobId}/${format}`, {
      ...directProxyOptions,
      timeout: primaryProxyContext.downloadTimeout,
    })
  })

  fastify.get('/sections/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/sections/${jobId}`, { ...directProxyOptions })
  })

  fastify.get('/sections/:jobId/:sectionName', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    const sectionName = encodeURIComponent(String(req.params?.sectionName || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    if (!sectionName) return reply.code(400).send(makeErrorPayload(400, 'sectionName 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/sections/${jobId}/${sectionName}`, { ...directProxyOptions })
  })

  fastify.put('/sections/:jobId/:sectionName', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    const sectionName = encodeURIComponent(String(req.params?.sectionName || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    if (!sectionName) return reply.code(400).send(makeErrorPayload(400, 'sectionName 不能为空'))
    return proxyJson(req, reply, 'PUT', `/api/sections/${jobId}/${sectionName}`, { ...directProxyOptions })
  })

  // Legacy-compatible OpenDraft API proxy (from opendraft-project/static/index.html)
  fastify.get('/legacy/papers', tokenAuth, async (req, reply) => {
    return proxyJson(req, reply, 'GET', '/api/papers', { ...legacyProxyOptions })
  })

  fastify.delete('/legacy/papers/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'DELETE', `/api/papers/${jobId}`, { ...legacyProxyOptions })
  })

  fastify.post('/legacy/outline', tokenAuth, async (req, reply) => {
    return proxyJson(req, reply, 'POST', '/api/outline', { ...legacyProxyOptions })
  })

  fastify.post('/legacy/generate', tokenAuth, createGenerateProxyHandler(legacyProxyOptions))

  fastify.post('/legacy/approve/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'POST', `/api/approve/${jobId}`, { ...legacyProxyOptions })
  })

  fastify.get('/legacy/status/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/status/${jobId}`, { ...legacyProxyOptions })
  })

  fastify.post('/legacy/cancel/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'POST', `/api/cancel/${jobId}`, {
      ...legacyProxyOptions,
      data: req.body || {},
      fallbackPaths: [`/cancel/${jobId}`],
    })
  })

  fastify.get('/legacy/stream/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxySse(req, reply, `/api/stream/${jobId}`, { ...legacyProxyOptions })
  })

  fastify.get('/legacy/md/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/md/${jobId}`, { ...legacyProxyOptions })
  })

  fastify.post('/legacy/save/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'POST', `/api/save/${jobId}`, { ...legacyProxyOptions })
  })

  fastify.post('/legacy/chat', tokenAuth, async (req, reply) => {
    return proxyJson(req, reply, 'POST', '/api/chat', { ...legacyProxyOptions })
  })

  fastify.get('/legacy/preview/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyBinary(req, reply, 'GET', `/api/preview/${jobId}`, {
      ...legacyProxyOptions,
      defaultContentType: 'text/html; charset=utf-8',
      timeout: legacyProxyContext.downloadTimeout,
    })
  })

  fastify.get('/legacy/download/:jobId/:format', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    const format = encodeURIComponent(String(req.params?.format || '').trim().toLowerCase())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    if (!format) return reply.code(400).send(makeErrorPayload(400, 'format 不能为空'))
    return proxyBinary(req, reply, 'GET', `/api/download/${jobId}/${format}`, {
      ...legacyProxyOptions,
      timeout: legacyProxyContext.downloadTimeout,
    })
  })

  fastify.get('/legacy/sections/:jobId', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/sections/${jobId}`, { ...legacyProxyOptions })
  })

  fastify.get('/legacy/sections/:jobId/:sectionName', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    const sectionName = encodeURIComponent(String(req.params?.sectionName || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    if (!sectionName) return reply.code(400).send(makeErrorPayload(400, 'sectionName 不能为空'))
    return proxyJson(req, reply, 'GET', `/api/sections/${jobId}/${sectionName}`, { ...legacyProxyOptions })
  })

  fastify.put('/legacy/sections/:jobId/:sectionName', tokenAuth, async (req, reply) => {
    const jobId = encodeURIComponent(String(req.params?.jobId || '').trim())
    const sectionName = encodeURIComponent(String(req.params?.sectionName || '').trim())
    if (!jobId) return reply.code(400).send(makeErrorPayload(400, 'jobId 不能为空'))
    if (!sectionName) return reply.code(400).send(makeErrorPayload(400, 'sectionName 不能为空'))
    return proxyJson(req, reply, 'PUT', `/api/sections/${jobId}/${sectionName}`, { ...legacyProxyOptions })
  })
}
