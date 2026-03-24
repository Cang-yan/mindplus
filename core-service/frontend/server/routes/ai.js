'use strict'
const axios = require('axios')
const { db, ok, fail } = require('../db')
const config = require('../config')

// 试用配额固定为不限量（保留 usage 统计，不做拦截）
const TRIAL_DAILY_LIMIT = 0

module.exports = async function aiRoutes(fastify) {
  // GET /ai/trial/stats
  fastify.get('/trial/stats', async (req) => {
    const userId = req.headers['x-user-id'] || req.user?.id || 'anonymous'
    const today = new Date().toISOString().slice(0, 10)
    const row = await db.prepare('SELECT count FROM ai_trial_usage WHERE user_id = ? AND date = ?').get(userId, today)
    return ok({
      userId,
      date: today,
      used: row?.count || 0,
      limit: TRIAL_DAILY_LIMIT,
      remaining: TRIAL_DAILY_LIMIT === 0 ? 999 : Math.max(0, TRIAL_DAILY_LIMIT - (row?.count || 0)),
    })
  })

  // POST /ai/trial/stream  — OpenAI-compatible SSE proxy
  fastify.post('/trial/stream', async (req, reply) => {
    if (!config.ai.apiKey) {
      reply.code(501).send(fail('AI 服务未配置，请在 .env 中设置 ASSISTANT_AI_KEY（兼容 AI_API_KEY）'))
      return
    }

    const userId = req.headers['x-user-id'] || req.user?.id || 'anonymous'
    const today = new Date().toISOString().slice(0, 10)

    // Check daily limit
    if (TRIAL_DAILY_LIMIT > 0) {
      const row = await db.prepare('SELECT count FROM ai_trial_usage WHERE user_id = ? AND date = ?').get(userId, today)
      if ((row?.count || 0) >= TRIAL_DAILY_LIMIT) {
        return reply.code(429).send(fail('今日试用次数已用完', 429))
      }
    }

    const { model, messages, temperature } = req.body || {}

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')

    try {
      const upstream = await axios.post(
        `${config.ai.baseUrl}/chat/completions`,
        { model: model || 'gpt-3.5-turbo', messages, temperature: temperature ?? 0.7, stream: true },
        {
          headers: { Authorization: `Bearer ${config.ai.apiKey}`, 'Content-Type': 'application/json' },
          responseType: 'stream',
          timeout: 60000,
        }
      )

      // Increment usage counter
      await db.prepare(`
        INSERT INTO ai_trial_usage (user_id, date, count) VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE
          count = count + 1
      `).run(userId, today)

      upstream.data.on('data', chunk => { reply.raw.write(chunk) })
      upstream.data.on('end', () => reply.raw.end())
      upstream.data.on('error', () => reply.raw.end())
    } catch (e) {
      reply.raw.write(`data: ${JSON.stringify({ error: e.message })}\n\n`)
      reply.raw.end()
    }
  })

  // POST /ai/image/aliyun
  fastify.post('/image/aliyun', async (req, reply) => {
    if (!config.aliyun.apiKey) return reply.code(501).send(fail('阿里云图像服务未配置'))
    const { prompt } = req.body || {}
    try {
      const res = await axios.post(
        `${config.aliyun.baseUrl}/services/aigc/text2image/generation`,
        { model: 'wanx-v1', input: { prompt }, parameters: { size: '1024*1024', n: 1 } },
        { headers: { Authorization: `Bearer ${config.aliyun.apiKey}`, 'X-DashScope-Async': 'enable' } }
      )
      return ok(res.data)
    } catch (e) {
      return reply.code(500).send(fail(e.message))
    }
  })
}
