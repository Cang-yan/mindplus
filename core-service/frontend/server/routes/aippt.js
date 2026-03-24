'use strict'

const { randomUUID } = require('crypto')
const { db, ok } = require('../db')

module.exports = async function aipptRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] }
  // 与文献助手历史策略保持一致：每位用户仅保留最近 10 条 AIPPT 作品
  const HISTORY_LIMIT = 10

  function normalizeTimestamp(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) return Math.floor(n)
      const t = new Date(value).getTime()
      if (Number.isFinite(t) && t > 0) return Math.floor(t)
    }
    return Date.now()
  }

  function safeJsonParse(value, fallback = null) {
    try {
      if (!value) return fallback
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }

  function normalizeOptionalText(value) {
    if (value === null || value === undefined) return ''
    return String(value).trim()
  }

  function normalizeSlideCount(value) {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    const safe = Math.floor(n)
    return safe >= 0 ? safe : 0
  }

  function normalizeStatus(value) {
    const status = String(value || '').trim().toLowerCase()
    if (status === 'pending' || status === 'generating' || status === 'completed' || status === 'failed') {
      return status
    }
    return 'pending'
  }

  function normalizeHistoryInput(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null

    const recordId = String(rawItem.recordId || rawItem.id || '').trim()
    if (!recordId) return null

    const payload = rawItem.raw && typeof rawItem.raw === 'object'
      ? rawItem.raw
      : (rawItem.payload && typeof rawItem.payload === 'object' ? rawItem.payload : null)

    return {
      recordId,
      topic: normalizeOptionalText(rawItem.topic || rawItem.title || '未命名 AI PPT') || '未命名 AI PPT',
      outline: String(rawItem.outline || ''),
      templateId: normalizeOptionalText(rawItem.templateId),
      status: normalizeStatus(rawItem.status),
      progressText: String(rawItem.progressText || ''),
      pptId: normalizeOptionalText(rawItem.pptId),
      pptxProperty: String(rawItem.pptxProperty || ''),
      slideCount: normalizeSlideCount(rawItem.slideCount),
      errorMessage: String(rawItem.errorMessage || ''),
      timestamp: normalizeTimestamp(rawItem.timestamp, rawItem.updatedAt, rawItem.createdAt),
      payload,
    }
  }

  function mapHistoryRow(row) {
    return {
      id: row.record_id,
      recordId: row.record_id,
      topic: row.topic || '未命名 AI PPT',
      outline: row.outline || '',
      templateId: row.template_id || '',
      status: normalizeStatus(row.status),
      progressText: row.progress_text || '',
      pptId: row.ppt_id || '',
      pptxProperty: row.pptx_property || '',
      slideCount: normalizeSlideCount(row.slide_count),
      errorMessage: row.error_message || '',
      timestamp: normalizeTimestamp(row.timestamp, row.updated_at, row.created_at),
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      raw: safeJsonParse(row.payload, null),
    }
  }

  async function pruneHistoryOverflow(userId, limit = HISTORY_LIMIT) {
    const safeUserId = String(userId || '').trim()
    if (!safeUserId) return 0

    const parsedLimit = Number(limit)
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : HISTORY_LIMIT

    const overflowRows = await db.prepare(`
      SELECT record_id
      FROM aippt_generation_history
      WHERE user_id = ?
      ORDER BY timestamp DESC, updated_at DESC
      LIMIT 18446744073709551615 OFFSET ${safeLimit}
    `).all(safeUserId)

    if (!overflowRows.length) return 0

    const deleteStmt = db.prepare(`
      DELETE FROM aippt_generation_history
      WHERE user_id = ? AND record_id = ?
    `)

    for (const row of overflowRows) {
      const recordId = String(row?.record_id || '').trim()
      if (!recordId) continue
      await deleteStmt.run(safeUserId, recordId)
    }

    return overflowRows.length
  }

  const upsertStmt = db.prepare(`
    INSERT INTO aippt_generation_history (
      id,
      user_id,
      record_id,
      topic,
      outline,
      template_id,
      status,
      progress_text,
      ppt_id,
      pptx_property,
      slide_count,
      error_message,
      timestamp,
      payload,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      topic = VALUES(topic),
      outline = VALUES(outline),
      template_id = VALUES(template_id),
      status = VALUES(status),
      progress_text = VALUES(progress_text),
      ppt_id = VALUES(ppt_id),
      pptx_property = VALUES(pptx_property),
      slide_count = VALUES(slide_count),
      error_message = VALUES(error_message),
      timestamp = VALUES(timestamp),
      payload = VALUES(payload),
      updated_at = VALUES(updated_at)
  `)

  // GET /api/aippt/history
  fastify.get('/history', auth, async (req) => {
    const safeHistoryLimit = Number.isFinite(HISTORY_LIMIT) && HISTORY_LIMIT > 0
      ? Math.floor(HISTORY_LIMIT)
      : 10
    const rows = await db.prepare(`
      SELECT
        record_id,
        topic,
        outline,
        template_id,
        status,
        progress_text,
        ppt_id,
        pptx_property,
        slide_count,
        error_message,
        timestamp,
        payload,
        created_at,
        updated_at
      FROM aippt_generation_history
      WHERE user_id = ?
      ORDER BY timestamp DESC, updated_at DESC
      LIMIT ${safeHistoryLimit}
    `).all(req.user.id)

    return ok({ items: rows.map(mapHistoryRow) })
  })

  // GET /api/aippt/history/:recordId
  fastify.get('/history/:recordId', auth, async (req, reply) => {
    const recordId = String(req.params?.recordId || '').trim()
    if (!recordId) {
      return reply.code(400).send({ code: 400, data: null, message: 'recordId 不能为空' })
    }

    const row = await db.prepare(`
      SELECT
        record_id,
        topic,
        outline,
        template_id,
        status,
        progress_text,
        ppt_id,
        pptx_property,
        slide_count,
        error_message,
        timestamp,
        payload,
        created_at,
        updated_at
      FROM aippt_generation_history
      WHERE user_id = ? AND record_id = ?
      LIMIT 1
    `).get(req.user.id, recordId)

    if (!row) {
      return reply.code(404).send({ code: 404, data: null, message: '未找到对应记录' })
    }

    return ok({ item: mapHistoryRow(row) })
  })

  // POST /api/aippt/history/upsert
  fastify.post('/history/upsert', auth, async (req, reply) => {
    const item = normalizeHistoryInput(req.body || {})
    if (!item) {
      return reply.code(400).send({ code: 400, data: null, message: '无效记录：recordId 必填' })
    }

    const now = new Date().toISOString()
    await db.transaction(async () => {
      await upsertStmt.run(
        randomUUID(),
        req.user.id,
        item.recordId,
        item.topic,
        item.outline,
        item.templateId,
        item.status,
        item.progressText,
        item.pptId,
        item.pptxProperty,
        item.slideCount,
        item.errorMessage,
        item.timestamp,
        item.payload ? JSON.stringify(item.payload) : null,
        now,
        now
      )
      await pruneHistoryOverflow(req.user.id, HISTORY_LIMIT)
    })()

    const row = await db.prepare(`
      SELECT
        record_id,
        topic,
        outline,
        template_id,
        status,
        progress_text,
        ppt_id,
        pptx_property,
        slide_count,
        error_message,
        timestamp,
        payload,
        created_at,
        updated_at
      FROM aippt_generation_history
      WHERE user_id = ? AND record_id = ?
      LIMIT 1
    `).get(req.user.id, item.recordId)

    return ok({ item: row ? mapHistoryRow(row) : null })
  })

  // POST /api/aippt/history/sync
  fastify.post('/history/sync', auth, async (req) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    if (items.length === 0) {
      return ok({ synced: 0 })
    }

    const now = new Date().toISOString()
    let synced = 0

    await db.transaction(async () => {
      for (const rawItem of items) {
        const item = normalizeHistoryInput(rawItem)
        if (!item) continue
        await upsertStmt.run(
          randomUUID(),
          req.user.id,
          item.recordId,
          item.topic,
          item.outline,
          item.templateId,
          item.status,
          item.progressText,
          item.pptId,
          item.pptxProperty,
          item.slideCount,
          item.errorMessage,
          item.timestamp,
          item.payload ? JSON.stringify(item.payload) : null,
          now,
          now
        )
        synced += 1
      }
      await pruneHistoryOverflow(req.user.id, HISTORY_LIMIT)
    })()

    return ok({ synced })
  })

  // DELETE /api/aippt/history/:recordId
  fastify.delete('/history/:recordId', auth, async (req, reply) => {
    const recordId = String(req.params?.recordId || '').trim()
    if (!recordId) {
      return reply.code(400).send({ code: 400, data: null, message: 'recordId 不能为空' })
    }

    const result = await db.prepare(`
      DELETE FROM aippt_generation_history
      WHERE user_id = ? AND record_id = ?
    `).run(req.user.id, recordId)

    return ok({
      deleted: Number(result?.changes || 0) > 0,
      recordId,
    })
  })
}
