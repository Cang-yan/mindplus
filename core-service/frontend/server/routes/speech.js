'use strict'
const crypto = require('crypto')
const { ok, fail } = require('../db')
const config = require('../config')

// Xunfei (iFlytek) WebSocket URL for speech recognition
function buildXunfeiUrl() {
  const { appId, apiKey, apiSecret } = config.xunfei
  if (!appId || !apiKey || !apiSecret) return null

  const host = 'iat-api.xfyun.cn'
  const path = '/v2/iat'
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64')
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`
  const authorization = Buffer.from(authorizationOrigin).toString('base64')
  return `wss://${host}${path}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`
}

module.exports = async function speechRoutes(fastify) {
  // GET /api/speech/xunfei-url  — returns a signed WebSocket URL
  fastify.get('/xunfei-url', async (req, reply) => {
    const wsUrl = buildXunfeiUrl()
    if (!wsUrl) return reply.code(501).send(fail('讯飞语音服务未配置，请在 .env 中设置 XUNFEI_* 变量'))
    return ok({ url: wsUrl })
  })
}
