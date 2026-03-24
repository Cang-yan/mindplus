'use strict'
const axios = require('axios')
const { ok, fail } = require('../db')
const config = require('../config')

async function callCozeWorkflow(workflowId, parameters) {
  if (!config.coze.apiKey || !workflowId) {
    throw new Error('Coze API 未配置，请在 .env 中设置 COZE_API_KEY 和工作流 ID')
  }
  const res = await axios.post(
    `${config.coze.baseUrl}/workflows/${workflowId}/run`,
    { workflow_id: workflowId, parameters },
    {
      headers: { Authorization: `Bearer ${config.coze.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 120000,
    }
  )
  return res.data
}

module.exports = async function cozeRoutes(fastify) {
  // POST /api/coze/generate-outline-only
  fastify.post('/generate-outline-only', async (req, reply) => {
    const { keyword, model, pageCount, textAmount, language, style } = req.body || {}
    try {
      const data = await callCozeWorkflow(config.coze.workflowOutlineId, { keyword, model, page_count: pageCount, text_amount: textAmount, language, style })
      return ok({ outline: data.outline || data.data?.outline, title: data.title || data.data?.title, log_id: data.log_id, message: '大纲生成成功' })
    } catch (e) {
      return reply.code(500).send(fail(e.message))
    }
  })

  // POST /api/coze/generate-ppt
  fastify.post('/generate-ppt', async (req, reply) => {
    const { outline, title, keyword, style } = req.body || {}
    try {
      const data = await callCozeWorkflow(config.coze.workflowPptId, { outline, title, keyword, style })
      return ok({ formatted_markdown: data.formatted_markdown || data.data?.formatted_markdown, title: data.title || data.data?.title, message: '生成成功' })
    } catch (e) {
      return reply.code(500).send(fail(e.message))
    }
  })

  // POST /api/coze/generate-outline  (legacy one-shot)
  fastify.post('/generate-outline', async (req, reply) => {
    const { keyword, model, pageCount, textAmount, language, style } = req.body || {}
    try {
      const data = await callCozeWorkflow(config.coze.workflowOutlineId, { keyword, model, page_count: pageCount, text_amount: textAmount, language, style })
      return ok({ outline: data.outline || data.data?.outline, formatted_markdown: data.formatted_markdown, title: data.title, log_id: data.log_id })
    } catch (e) {
      return reply.code(500).send(fail(e.message))
    }
  })

  // GET /api/coze/workflow-status/:logId
  fastify.get('/workflow-status/:logId', async (req, reply) => {
    if (!config.coze.apiKey) return reply.code(501).send(fail('Coze 未配置'))
    try {
      const res = await axios.get(`${config.coze.baseUrl}/workflows/runs/${req.params.logId}`, {
        headers: { Authorization: `Bearer ${config.coze.apiKey}` },
      })
      return ok(res.data)
    } catch (e) {
      return reply.code(500).send(fail(e.message))
    }
  })

  // GET /api/coze/generate-outline-stream  (SSE)
  fastify.get('/generate-outline-stream', async (req, reply) => {
    const { keyword, model, pageCount, textAmount, language, style } = req.query

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')

    const send = (type, data) => reply.raw.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)

    if (!config.coze.apiKey) {
      send('error', { message: 'Coze API 未配置' })
      reply.raw.end()
      return
    }

    try {
      send('progress', { message: '正在生成大纲...', percent: 10 })
      const data = await callCozeWorkflow(config.coze.workflowOutlineId, { keyword, model, page_count: pageCount, text_amount: textAmount, language, style })
      send('progress', { message: '大纲生成完成', percent: 100 })
      send('complete', { outline: data.outline || data.data?.outline, title: data.title || data.data?.title, log_id: data.log_id })
    } catch (e) {
      send('error', { message: e.message })
    }
    reply.raw.end()
  })
}
