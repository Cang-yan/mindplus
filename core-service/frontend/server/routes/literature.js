'use strict'
const axios = require('axios')
const config = require('../config')
const { randomUUID } = require('crypto')
const { db, ok } = require('../db')
const { BILLING_SCENES, chargeCreditsForScene, refundChargeById } = require('../services/billing')

module.exports = async function literatureRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] }
  const HISTORY_LIMIT = 10

  function normalizeSourceType(value) {
    const sourceType = String(value || '').trim().toLowerCase()
    if (sourceType === 'translation' || sourceType === 'assistant') {
      return sourceType
    }
    return null
  }

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
    const text = String(value || '').trim()
    return text || null
  }

  function normalizeOptionalInteger(value) {
    if (value === null || value === undefined || value === '') return null
    const n = Number(value)
    if (!Number.isFinite(n)) return null
    const safe = Math.floor(n)
    return safe >= 0 ? safe : null
  }

  function normalizeResultInput(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null
    const sourceType = normalizeSourceType(rawItem.sourceType || 'translation')
    if (!sourceType) return null

    const recordId = String(rawItem.recordId || rawItem.docId || rawItem.result?.id || '').trim()
    if (!recordId) return null

    const docId = String(rawItem.docId || recordId).trim()
    const title = String(rawItem.title || rawItem.result?.name || '未命名记录').trim() || '未命名记录'
    const subtitle = String(rawItem.subtitle || '').trim()
    const timestamp = normalizeTimestamp(
      rawItem.timestamp,
      rawItem.result?.time,
      rawItem.updatedAt,
      rawItem.createdAt
    )

    const payload = rawItem.result && typeof rawItem.result === 'object'
      ? rawItem.result
      : (rawItem.payload && typeof rawItem.payload === 'object' ? rawItem.payload : null)

    if (!payload) return null

    const id = String(rawItem.id || `${sourceType}_${recordId}`).trim() || randomUUID()
    const fileName = normalizeOptionalText(rawItem.fileName || payload.name)
    const fileSize = normalizeOptionalInteger(rawItem.fileSize ?? payload.size)
    const fileType = normalizeOptionalText(rawItem.fileType || payload.fileType)
    const targetLanguage = normalizeOptionalText(rawItem.targetLanguage || payload.targetLanguage)
    const translationModelName = normalizeOptionalText(rawItem.translationModelName || payload.translationModelName)
    const translationModelId = normalizeOptionalText(rawItem.translationModelId || payload.translationModelId)

    return {
      id,
      sourceType,
      recordId,
      docId,
      title,
      subtitle,
      timestamp,
      fileName,
      fileSize,
      fileType,
      targetLanguage,
      translationModelName,
      translationModelId,
      payload,
    }
  }

  function normalizeAssistantRole(value) {
    const role = String(value || '').trim().toLowerCase()
    if (role === 'user' || role === 'assistant' || role === 'system' || role === 'tool') {
      return role
    }
    return null
  }

  function normalizeAssistantMessageInput(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null

    const role = normalizeAssistantRole(rawItem.role)
    if (!role) return null

    const timestamp = normalizeTimestamp(rawItem.timestamp, rawItem.createdAt, rawItem.metadata?.timestamp)
    const id = String(rawItem.id || randomUUID()).trim() || randomUUID()

    const metadata = rawItem.metadata && typeof rawItem.metadata === 'object'
      ? rawItem.metadata
      : null

    const rawContent = rawItem.content
    let content = ''
    let contentJson = 0
    if (typeof rawContent === 'string') {
      content = rawContent
    } else {
      content = JSON.stringify(rawContent ?? '')
      contentJson = 1
    }

    return {
      id,
      role,
      content,
      contentJson,
      metadata,
      timestamp,
    }
  }

  function normalizeHistoryInput(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null
    const sourceType = normalizeSourceType(rawItem.sourceType)
    if (!sourceType) return null
    const recordId = String(rawItem.recordId || rawItem.docId || '').trim()
    if (!recordId) return null
    const docId = String(rawItem.docId || recordId).trim()
    const title = String(rawItem.title || '未命名记录').trim() || '未命名记录'
    const subtitle = String(rawItem.subtitle || '').trim()
    const timestamp = normalizeTimestamp(rawItem.timestamp, rawItem.updatedAt, rawItem.createdAt)
    const payload = rawItem.raw && typeof rawItem.raw === 'object' ? rawItem.raw : null
    const id = String(rawItem.id || `${sourceType}_${recordId}`).trim() || randomUUID()
    return {
      id,
      sourceType,
      recordId,
      docId,
      title,
      subtitle,
      timestamp,
      payload,
    }
  }

  function mapHistoryRow(row) {
    return {
      id: row.id,
      sourceType: row.source_type,
      recordId: row.record_id,
      docId: row.doc_id || row.record_id,
      title: row.title || '未命名记录',
      subtitle: row.subtitle || '',
      timestamp: normalizeTimestamp(row.timestamp, row.updated_at, row.created_at),
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      raw: safeJsonParse(row.payload, null),
    }
  }

  function mapResultRow(row) {
    const rawSize = row.file_size
    const normalizedSize = rawSize === null || rawSize === undefined || rawSize === ''
      ? null
      : Number(rawSize)

    return {
      id: row.id,
      sourceType: row.source_type,
      recordId: row.record_id,
      docId: row.doc_id || row.record_id,
      title: row.title || '未命名记录',
      subtitle: row.subtitle || '',
      timestamp: normalizeTimestamp(row.timestamp, row.updated_at, row.created_at),
      fileName: row.file_name || '',
      fileSize: Number.isFinite(normalizedSize) ? Math.floor(normalizedSize) : null,
      fileType: row.file_type || '',
      targetLanguage: row.target_language || '',
      translationModelName: row.translation_model_name || '',
      translationModelId: row.translation_model_id || '',
      result: safeJsonParse(row.payload, null),
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }
  }

  function mapAssistantMessageRow(row) {
    const parsedContent = row.content_json
      ? safeJsonParse(row.content, row.content || '')
      : row.content
    return {
      id: row.id,
      role: row.role,
      content: parsedContent,
      metadata: safeJsonParse(row.metadata, {}),
      timestamp: normalizeTimestamp(row.timestamp, row.created_at),
      createdAt: row.created_at,
    }
  }

  function extractAssistantTitleFromDocId(docId) {
    const raw = String(docId || '').trim()
    if (!raw) return '未命名记录'
    const pieces = raw.split('_')
    if (pieces.length >= 4) {
      const maybeLenPart = pieces.slice(-3)
      const allNumeric = maybeLenPart.every(v => /^\d+$/.test(v))
      if (allNumeric) {
        const name = pieces.slice(0, -3).join('_').trim()
        if (name) return name
      }
    }
    return raw
  }

  async function pruneHistoryOverflow(userId, limit = HISTORY_LIMIT) {
    const safeUserId = String(userId || '').trim()
    if (!safeUserId) return 0
    const parsedLimit = Number(limit)
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : HISTORY_LIMIT

    const overflowRows = await db.prepare(`
      SELECT source_type, record_id, COALESCE(doc_id, record_id) AS safe_doc_id
      FROM literature_history
      WHERE user_id = ?
      ORDER BY timestamp DESC, updated_at DESC
      LIMIT 18446744073709551615 OFFSET ${safeLimit}
    `).all(safeUserId)

    if (!overflowRows.length) return 0

    const deleteHistoryStmt = db.prepare(`
      DELETE FROM literature_history
      WHERE user_id = ? AND source_type = ? AND record_id = ?
    `)
    const deleteResultStmt = db.prepare(`
      DELETE FROM literature_results
      WHERE user_id = ? AND source_type = ? AND record_id = ?
    `)
    const deleteAssistantMsgStmt = db.prepare(`
      DELETE FROM literature_assistant_messages
      WHERE user_id = ? AND doc_id = ?
    `)

    for (const row of overflowRows) {
      const sourceType = normalizeSourceType(row?.source_type)
      const recordId = String(row?.record_id || '').trim()
      const safeDocId = String(row?.safe_doc_id || recordId).trim()
      if (!sourceType || !recordId) continue

      await deleteHistoryStmt.run(safeUserId, sourceType, recordId)

      if (sourceType === 'assistant') {
        if (safeDocId) {
          await deleteAssistantMsgStmt.run(safeUserId, safeDocId)
        }
        continue
      }

      await deleteResultStmt.run(safeUserId, sourceType, recordId)
    }

    return overflowRows.length
  }

  async function upsertAssistantHistorySummary(userId, docId, title, timestamp) {
    const safeDocId = String(docId || '').trim()
    if (!userId || !safeDocId) return

    const summary = await db.prepare(`
      SELECT
        COUNT(*) AS message_count,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS user_message_count
      FROM literature_assistant_messages
      WHERE user_id = ? AND doc_id = ?
    `).get(userId, safeDocId) || { message_count: 0, user_message_count: 0 }

    const messageCount = normalizeOptionalInteger(summary.message_count) || 0
    const userMessageCount = normalizeOptionalInteger(summary.user_message_count) || 0
    const finalTitle = String(title || '').trim() || extractAssistantTitleFromDocId(safeDocId)
    const subtitle = `共 ${messageCount} 条对话（用户提问 ${userMessageCount} 次）`

    const now = new Date().toISOString()
    await db.prepare(`
      INSERT INTO literature_history (
        id, user_id, source_type, record_id, doc_id, title, subtitle, timestamp, payload, created_at, updated_at
      ) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        doc_id = VALUES(doc_id),
        title = VALUES(title),
        subtitle = VALUES(subtitle),
        timestamp = VALUES(timestamp),
        payload = VALUES(payload),
        updated_at = VALUES(updated_at)
    `).run(
      `assistant_${safeDocId}`,
      userId,
      safeDocId,
      safeDocId,
      finalTitle,
      subtitle,
      timestamp,
      JSON.stringify({
        docId: safeDocId,
        messageCount,
        userMessageCount,
      }),
      now,
      now
    )

    await pruneHistoryOverflow(userId, HISTORY_LIMIT)
  }

  // GET /api/literature/history
  // 统一返回文献历史记录（translation + assistant）
  fastify.get('/history', auth, async (req, reply) => {
    const sourceType = normalizeSourceType(req.query?.sourceType)
    const safeHistoryLimit = Number.isFinite(HISTORY_LIMIT) && HISTORY_LIMIT > 0
      ? Math.floor(HISTORY_LIMIT)
      : 10

    let rows = []
    if (sourceType) {
      rows = await db.prepare(`
        SELECT
          id, source_type, record_id, doc_id, title, subtitle, timestamp, payload, created_at, updated_at
        FROM literature_history
        WHERE user_id = ? AND source_type = ?
        ORDER BY timestamp DESC, updated_at DESC
        LIMIT ${safeHistoryLimit}
      `).all(req.user.id, sourceType)
    } else {
      rows = await db.prepare(`
        SELECT
          id, source_type, record_id, doc_id, title, subtitle, timestamp, payload, created_at, updated_at
        FROM literature_history
        WHERE user_id = ?
        ORDER BY timestamp DESC, updated_at DESC
        LIMIT ${safeHistoryLimit}
      `).all(req.user.id)
    }

    return ok({ items: rows.map(mapHistoryRow) })
  })

  // POST /api/literature/history/sync
  // 将前端侧历史记录（迁移窗口）同步到后端表，后续读取统一走后端 API
  fastify.post('/history/sync', auth, async (req, reply) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    if (items.length === 0) {
      return ok({ synced: 0 })
    }

    const now = new Date().toISOString()
    const upsertStmt = db.prepare(`
      INSERT INTO literature_history (
        id, user_id, source_type, record_id, doc_id, title, subtitle, timestamp, payload, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        doc_id = VALUES(doc_id),
        title = VALUES(title),
        subtitle = VALUES(subtitle),
        timestamp = VALUES(timestamp),
        payload = VALUES(payload),
        updated_at = VALUES(updated_at)
    `)

    let synced = 0
    await db.transaction(async () => {
      for (const rawItem of items) {
        const item = normalizeHistoryInput(rawItem)
        if (!item) continue
        await upsertStmt.run(
          item.id,
          req.user.id,
          item.sourceType,
          item.recordId,
          item.docId,
          item.title,
          item.subtitle,
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

  // GET /api/literature/assistant/history/:docId
  // 读取某个文档会话的聊天历史（按 user_id + doc_id 隔离）
  fastify.get('/assistant/history/:docId', auth, async (req, reply) => {
    const docId = String(req.params?.docId || '').trim()
    if (!docId) {
      return reply.code(400).send({ code: 400, data: null, message: 'docId 不能为空' })
    }

    const rows = await db.prepare(`
      SELECT
        id, role, content, content_json, metadata, timestamp, created_at
      FROM literature_assistant_messages
      WHERE user_id = ? AND doc_id = ?
      ORDER BY timestamp ASC, created_at ASC, id ASC
    `).all(req.user.id, docId)

    return ok({
      docId,
      messages: rows.map(mapAssistantMessageRow),
    })
  })

  // POST /api/literature/assistant/history/:docId
  // 追加一条聊天消息，并同步更新 assistant 历史摘要
  fastify.post('/assistant/history/:docId', auth, async (req, reply) => {
    const docId = String(req.params?.docId || '').trim()
    if (!docId) {
      return reply.code(400).send({ code: 400, data: null, message: 'docId 不能为空' })
    }

    const item = normalizeAssistantMessageInput(req.body || {})
    if (!item) {
      return reply.code(400).send({ code: 400, data: null, message: '无效消息格式：role/content 必填' })
    }

    const now = new Date().toISOString()
    const title = normalizeOptionalText(req.body?.title) || extractAssistantTitleFromDocId(docId)

    await db.transaction(async () => {
      await db.prepare(`
        INSERT INTO literature_assistant_messages (
          id, user_id, doc_id, role, content, content_json, metadata, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.id,
        req.user.id,
        docId,
        item.role,
        item.content,
        item.contentJson,
        item.metadata ? JSON.stringify(item.metadata) : null,
        item.timestamp,
        now
      )

      await upsertAssistantHistorySummary(req.user.id, docId, title, item.timestamp)
    })()

    return ok({
      docId,
      id: item.id,
      timestamp: item.timestamp,
    })
  })

  // PUT /api/literature/assistant/history/:docId
  // 用完整 history 覆盖会话（用于批量同步、编辑消息后重建）
  fastify.put('/assistant/history/:docId', auth, async (req, reply) => {
    const docId = String(req.params?.docId || '').trim()
    if (!docId) {
      return reply.code(400).send({ code: 400, data: null, message: 'docId 不能为空' })
    }

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : []
    const normalized = messages
      .map(normalizeAssistantMessageInput)
      .filter(Boolean)

    const title = normalizeOptionalText(req.body?.title) || extractAssistantTitleFromDocId(docId)
    const now = new Date().toISOString()
    const latestTimestamp = normalized.length
      ? Math.max(...normalized.map(msg => msg.timestamp))
      : Date.now()

    await db.transaction(async () => {
      await db.prepare(`
        DELETE FROM literature_assistant_messages
        WHERE user_id = ? AND doc_id = ?
      `).run(req.user.id, docId)

      const insertStmt = db.prepare(`
        INSERT INTO literature_assistant_messages (
          id, user_id, doc_id, role, content, content_json, metadata, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const item of normalized) {
        await insertStmt.run(
          item.id,
          req.user.id,
          docId,
          item.role,
          item.content,
          item.contentJson,
          item.metadata ? JSON.stringify(item.metadata) : null,
          item.timestamp,
          now
        )
      }

      if (normalized.length) {
        await upsertAssistantHistorySummary(req.user.id, docId, title, latestTimestamp)
      } else {
        await db.prepare(`
          DELETE FROM literature_history
          WHERE user_id = ? AND source_type = 'assistant' AND record_id = ?
        `).run(req.user.id, docId)
      }
    })()

    return ok({
      docId,
      replaced: normalized.length,
      timestamp: latestTimestamp,
    })
  })

  // DELETE /api/literature/assistant/history/:docId
  // 清空会话消息并移除 assistant 历史摘要
  fastify.delete('/assistant/history/:docId', auth, async (req, reply) => {
    const docId = String(req.params?.docId || '').trim()
    if (!docId) {
      return reply.code(400).send({ code: 400, data: null, message: 'docId 不能为空' })
    }

    await db.transaction(async () => {
      await db.prepare(`
        DELETE FROM literature_assistant_messages
        WHERE user_id = ? AND doc_id = ?
      `).run(req.user.id, docId)

      await db.prepare(`
        DELETE FROM literature_history
        WHERE user_id = ? AND source_type = 'assistant' AND record_id = ?
      `).run(req.user.id, docId)
    })()

    return ok({ docId, cleared: true })
  })

  // POST /api/literature/results/upsert
  // 保存完整翻译结果，并同步更新 history 摘要。所有记录按 user_id 隔离。
  fastify.post('/results/upsert', auth, async (req, reply) => {
    const item = normalizeResultInput(req.body || {})
    if (!item) {
      return reply.code(400).send({ code: 400, data: null, message: '无效参数：请提供 sourceType、recordId 和 result 对象' })
    }

    const now = new Date().toISOString()
    const historyPayload = {
      targetLanguage: item.targetLanguage || '',
      fileType: item.fileType || '',
      translationModelName: item.translationModelName || '',
    }

    const upsertResultStmt = db.prepare(`
      INSERT INTO literature_results (
        id,
        user_id,
        source_type,
        record_id,
        doc_id,
        title,
        subtitle,
        timestamp,
        file_name,
        file_size,
        file_type,
        target_language,
        translation_model_name,
        translation_model_id,
        payload,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        doc_id = VALUES(doc_id),
        title = VALUES(title),
        subtitle = VALUES(subtitle),
        timestamp = VALUES(timestamp),
        file_name = VALUES(file_name),
        file_size = VALUES(file_size),
        file_type = VALUES(file_type),
        target_language = VALUES(target_language),
        translation_model_name = VALUES(translation_model_name),
        translation_model_id = VALUES(translation_model_id),
        payload = VALUES(payload),
        updated_at = VALUES(updated_at)
    `)

    const upsertHistoryStmt = db.prepare(`
      INSERT INTO literature_history (
        id, user_id, source_type, record_id, doc_id, title, subtitle, timestamp, payload, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        doc_id = VALUES(doc_id),
        title = VALUES(title),
        subtitle = VALUES(subtitle),
        timestamp = VALUES(timestamp),
        payload = VALUES(payload),
        updated_at = VALUES(updated_at)
    `)

    await db.transaction(async () => {
      await upsertResultStmt.run(
        item.id,
        req.user.id,
        item.sourceType,
        item.recordId,
        item.docId,
        item.title,
        item.subtitle,
        item.timestamp,
        item.fileName,
        item.fileSize,
        item.fileType,
        item.targetLanguage,
        item.translationModelName,
        item.translationModelId,
        JSON.stringify(item.payload),
        now,
        now
      )

      await upsertHistoryStmt.run(
        `${item.sourceType}_${item.recordId}`,
        req.user.id,
        item.sourceType,
        item.recordId,
        item.docId,
        item.title,
        item.subtitle,
        item.timestamp,
        JSON.stringify(historyPayload),
        now,
        now
      )

      await pruneHistoryOverflow(req.user.id, HISTORY_LIMIT)
    })()

    return ok({
      id: item.id,
      sourceType: item.sourceType,
      recordId: item.recordId,
      updatedAt: now,
    })
  })

  // GET /api/literature/results/:recordId
  // 读取单条完整翻译结果（按 user_id + source_type + record_id）
  fastify.get('/results/:recordId', auth, async (req, reply) => {
    const recordId = String(req.params?.recordId || '').trim()
    if (!recordId) {
      return reply.code(400).send({ code: 400, data: null, message: 'recordId 不能为空' })
    }

    const sourceType = normalizeSourceType(req.query?.sourceType || 'translation')
    if (!sourceType) {
      return reply.code(400).send({ code: 400, data: null, message: '无效的 sourceType' })
    }

    const row = await db.prepare(`
      SELECT
        id,
        source_type,
        record_id,
        doc_id,
        title,
        subtitle,
        timestamp,
        file_name,
        file_size,
        file_type,
        target_language,
        translation_model_name,
        translation_model_id,
        payload,
        created_at,
        updated_at
      FROM literature_results
      WHERE user_id = ? AND source_type = ? AND record_id = ?
      LIMIT 1
    `).get(req.user.id, sourceType, recordId)

    if (!row) {
      return reply.code(404).send({ code: 404, data: null, message: '记录不存在' })
    }

    return ok(mapResultRow(row))
  })

  // DELETE /api/literature/results/:recordId
  // 删除单条翻译结果及其 history 摘要（按 user_id + source_type + record_id）
  fastify.delete('/results/:recordId', auth, async (req, reply) => {
    const recordId = String(req.params?.recordId || '').trim()
    if (!recordId) {
      return reply.code(400).send({ code: 400, data: null, message: 'recordId 不能为空' })
    }

    const sourceType = normalizeSourceType(req.query?.sourceType || 'translation')
    if (!sourceType) {
      return reply.code(400).send({ code: 400, data: null, message: '无效的 sourceType' })
    }

    const deleted = await db.transaction(async () => {
      const resultInfo = await db.prepare(`
        DELETE FROM literature_results
        WHERE user_id = ? AND source_type = ? AND record_id = ?
      `).run(req.user.id, sourceType, recordId)

      await db.prepare(`
        DELETE FROM literature_history
        WHERE user_id = ? AND source_type = ? AND record_id = ?
      `).run(req.user.id, sourceType, recordId)

      const changes = Number(resultInfo?.changes || 0)
      return changes > 0
    })()

    return ok({
      sourceType,
      recordId,
      deleted,
    })
  })

  // POST /api/literature/ocr
  // 接收前端渲染好的页面图片(base64)，调用 glm-4v 进行 OCR，返回 markdown 文本
  fastify.post('/ocr', auth, async (req, reply) => {
    if (!config.lingine.apiKey) {
      return reply.code(501).send({ error: 'LINGINE OCR 服务未配置，请在 .env 中设置 OCR_AI_KEY（兼容 LINGINE_AI_KEY）' })
    }

    const { images, fileName, pageOffset } = req.body || {}

    if (!images || !Array.isArray(images) || images.length === 0) {
      return reply.code(400).send({ error: '请提供至少一张页面图片 (images 数组)' })
    }

    const maxPages = 50
    const pagesToProcess = images.slice(0, maxPages)
    const baseOffsetRaw = Number(pageOffset)
    const baseOffset = Number.isFinite(baseOffsetRaw) && baseOffsetRaw >= 0
      ? Math.floor(baseOffsetRaw)
      : 0

    const billingMeta = {
      fileName: String(fileName || ''),
      pageCount: pagesToProcess.length,
    }

    let chargeResult = null
    try {
      chargeResult = await chargeCreditsForScene({
        req,
        scene: BILLING_SCENES.LITERATURE_OCR,
        meta: billingMeta,
      })
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500)
      return reply.code(statusCode).send({
        error: String(error?.message || 'OCR 扣费失败'),
        code: error?.code || 'BILLING_FAILED',
      })
    }

    try {
      const pageTexts = []

      for (let i = 0; i < pagesToProcess.length; i++) {
        const imageData = pagesToProcess[i]

        // 支持 data URL 或纯 base64
        const base64 = imageData.startsWith('data:')
          ? imageData
          : `data:image/png;base64,${imageData}`

        const response = await axios.post(
          `${config.lingine.baseUrl}/chat/completions`,
          {
            model: 'glm-4v',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: { url: base64 }
                  },
                  {
                    type: 'text',
                    text: '请将图片中的全部文字内容完整提取为 Markdown 格式文本。保留原有的标题层级、表格、公式（用 LaTeX 包裹）和段落结构。只输出提取的文本内容，不要添加任何解释或注释。'
                  }
                ]
              }
            ],
            max_tokens: 4096,
            temperature: 0
          },
          {
            headers: {
              Authorization: `Bearer ${config.lingine.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 180000
          }
        )

        const text = response.data?.choices?.[0]?.message?.content || ''
        if (text.trim()) {
          pageTexts.push(`<!-- Page ${baseOffset + i + 1} -->\n${text.trim()}`)
        }
      }

      return {
        success: true,
        markdown: pageTexts.join('\n\n'),
        pageCount: pageTexts.length,
        billing: chargeResult,
      }
    } catch (err) {
      fastify.log.error({ err }, '[Literature OCR] glm-4v 调用失败')
      const message = err.response?.data?.error?.message || err.message || '未知错误'
      let refundResult = null
      if (chargeResult?.charged && chargeResult?.chargeId) {
        try {
          refundResult = await refundChargeById({
            req,
            chargeId: chargeResult.chargeId,
            reason: 'credits退款，调用失败',
            meta: {
              scene: BILLING_SCENES.LITERATURE_OCR,
              error: String(message || ''),
              ...billingMeta,
            },
          })
        } catch (refundError) {
          fastify.log.error({ refundError }, '[Literature OCR] 退款失败')
        }
      }
      return reply.code(502).send({
        error: `OCR 处理失败: ${message}`,
        billing: {
          charge: chargeResult,
          refund: refundResult,
        },
      })
    }
  })

  // POST /api/literature/translate
  // 接收文本，调用 deepl-en 进行翻译，返回翻译结果
  fastify.post('/translate', auth, async (req, reply) => {
    const translateBaseUrl = String(config.literatureTranslate?.baseUrl || '').trim()
    const translateApiKey = String(config.literatureTranslate?.apiKey || '').trim()
    if (!translateApiKey) {
      return reply.code(501).send({ error: '翻译服务未配置，请在 .env 中设置 VITE_FY_API_KEY' })
    }
    if (!translateBaseUrl) {
      return reply.code(501).send({ error: '翻译服务未配置，请在 .env 中设置 VITE_FY_BASE_URL' })
    }

    const { text, systemPrompt, targetLang } = req.body || {}

    if (!text || typeof text !== 'string') {
      return reply.code(400).send({ error: '请提供待翻译的文本 (text 字段)' })
    }

    const billingMeta = {
      textLength: text.length,
      targetLang: String(targetLang || '中文'),
    }

    let chargeResult = null
    try {
      chargeResult = await chargeCreditsForScene({
        req,
        scene: BILLING_SCENES.LITERATURE_TRANSLATE,
        meta: billingMeta,
      })
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500)
      return reply.code(statusCode).send({
        error: String(error?.message || '翻译扣费失败'),
        code: error?.code || 'BILLING_FAILED',
      })
    }

    const sysMsg = systemPrompt || `你是一名专业翻译。将用户提供的文本翻译为${targetLang || '中文'}，保留原有的 Markdown 格式、公式和专业术语。只输出翻译结果，不添加任何解释。`
    const normalizedBase = translateBaseUrl.replace(/\/+$/, '')
    const chatCompletionsUrl = /\/v\d+$/i.test(normalizedBase)
      ? `${normalizedBase}/chat/completions`
      : `${normalizedBase}/v1/chat/completions`
    const primaryModel = String(config.literatureTranslate?.model || 'deepl-en').trim() || 'deepl-en'
    const configuredFallbacks = Array.isArray(config.literatureTranslate?.fallbackModels)
      ? config.literatureTranslate.fallbackModels
      : []
    const modelCandidates = [...new Set([primaryModel, ...configuredFallbacks].map(v => String(v || '').trim()).filter(Boolean))]
    if (!modelCandidates.length) {
      modelCandidates.push('deepl-en')
    }

    function extractUpstreamMessage(error) {
      return String(
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        '未知错误'
      ).trim() || '未知错误'
    }

    function shouldFallbackModel(error, message) {
      const status = Number(error?.response?.status)
      const text = String(message || '').toLowerCase()
      if (status === 456) return true
      if (status === 503) return true
      if (text.includes('quota exceeded')) return true
      if (text.includes('insufficient')) return true
      if (text.includes('无可用渠道')) return true
      if (text.includes('模型') && text.includes('不存在')) return true
      return false
    }

    try {
      let translated = ''
      let usedModel = ''
      let lastError = null

      for (let i = 0; i < modelCandidates.length; i += 1) {
        const model = modelCandidates[i]
        try {
          const response = await axios.post(
            chatCompletionsUrl,
            {
              model,
              messages: [
                { role: 'system', content: sysMsg },
                { role: 'user', content: text }
              ],
              temperature: 0.3,
              max_tokens: 8192
            },
            {
              headers: {
                Authorization: `Bearer ${translateApiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 120000
            }
          )
          translated = String(response.data?.choices?.[0]?.message?.content || '')
          usedModel = model
          break
        } catch (error) {
          lastError = error
          const message = extractUpstreamMessage(error)
          const hasNext = i < modelCandidates.length - 1
          if (hasNext && shouldFallbackModel(error, message)) {
            fastify.log.warn({
              model,
              message,
              statusCode: Number(error?.response?.status || 0),
              nextModel: modelCandidates[i + 1],
            }, '[Literature Translate] 当前模型不可用，尝试降级模型')
            continue
          }
          throw error
        }
      }

      if (!usedModel) {
        throw lastError || new Error('翻译失败：无可用模型')
      }

      return {
        success: true,
        result: translated,
        model: usedModel,
        billing: chargeResult,
      }
    } catch (err) {
      fastify.log.error({ err }, '[Literature Translate] 模型调用失败')
      const message = extractUpstreamMessage(err)
      let refundResult = null
      if (chargeResult?.charged && chargeResult?.chargeId) {
        try {
          refundResult = await refundChargeById({
            req,
            chargeId: chargeResult.chargeId,
            reason: 'credits退款，调用失败',
            meta: {
              scene: BILLING_SCENES.LITERATURE_TRANSLATE,
              error: String(message || ''),
              ...billingMeta,
            },
          })
        } catch (refundError) {
          fastify.log.error({ refundError }, '[Literature Translate] 退款失败')
        }
      }
      return reply.code(502).send({
        error: `翻译失败: ${message}`,
        billing: {
          charge: chargeResult,
          refund: refundResult,
        },
      })
    }
  })
}
