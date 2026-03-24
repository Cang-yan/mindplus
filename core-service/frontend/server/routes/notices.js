'use strict'

const { randomUUID } = require('crypto')
const { db, ok, fail } = require('../db')

module.exports = async function noticeRoutes(fastify) {
  const adminAuth = {
    preHandler: [fastify.authenticate, async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send(fail('需要管理员权限', 403))
      }
    }],
  }

  function toSafeInteger(value, fallback = 0, min = -2147483648, max = 2147483647) {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    const safe = Math.floor(n)
    if (safe < min) return min
    if (safe > max) return max
    return safe
  }

  function toBooleanFlag(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'number') return value > 0 ? 1 : 0
    const text = String(value).trim().toLowerCase()
    if (text === '1' || text === 'true' || text === 'yes' || text === 'on') return 1
    if (text === '0' || text === 'false' || text === 'no' || text === 'off') return 0
    return fallback
  }

  function normalizeDateTime(value) {
    if (value === undefined || value === null || value === '') return null
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return null
    return date.toISOString()
  }

  function mapNoticeRow(row) {
    return {
      id: row.id,
      title: row.title || '',
      content: row.content || '',
      pinned: Number(row.pinned || 0) > 0,
      sortOrder: Number(row.sort_order || 0),
      isActive: Number(row.is_active || 0) > 0,
      startAt: row.start_at || null,
      endAt: row.end_at || null,
      createdBy: row.created_by || null,
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
    }
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key)
  }

  function hasAnyOwn(obj, keys) {
    return keys.some((key) => hasOwn(obj, key))
  }

  function pickFirstDefined(obj, keys) {
    for (const key of keys) {
      if (hasOwn(obj, key)) return obj[key]
    }
    return undefined
  }

  async function getNoticeById(id) {
    return db.prepare(`
      SELECT
        id, title, content, pinned, sort_order, is_active,
        start_at, end_at, created_by, created_at, updated_at
      FROM platform_notices
      WHERE id = ?
      LIMIT 1
    `).get(id)
  }

  // GET /api/notices/public
  // 公开通知列表（仅返回当前生效通知）
  fastify.get('/public', async (req) => {
    const parsedLimit = Number.parseInt(String(req.query?.limit ?? '10'), 10)
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 50)
      : 10
    const now = new Date().toISOString()

    const rows = await db.prepare(`
      SELECT
        id, title, content, pinned, sort_order, is_active,
        start_at, end_at, created_by, created_at, updated_at
      FROM platform_notices
      WHERE is_active = 1
        AND (start_at IS NULL OR start_at <= ?)
        AND (end_at IS NULL OR end_at >= ?)
      ORDER BY pinned DESC, sort_order DESC, created_at DESC
      LIMIT ${limit}
    `).all(now, now)

    return ok({ items: rows.map(mapNoticeRow) })
  })

  // POST /api/notices/admin
  // 管理员新增通知（供 minduser 管理后台对接）
  fastify.post('/admin', adminAuth, async (req, reply) => {
    const title = String(req.body?.title || '').trim()
    const content = String(req.body?.content || '').trim()
    if (!title) {
      return reply.code(400).send(fail('title 不能为空'))
    }
    if (!content) {
      return reply.code(400).send(fail('content 不能为空'))
    }

    const startAt = normalizeDateTime(req.body?.startAt ?? req.body?.start_at)
    const endAt = normalizeDateTime(req.body?.endAt ?? req.body?.end_at)
    if ((req.body?.startAt || req.body?.start_at) && !startAt) {
      return reply.code(400).send(fail('startAt 时间格式无效'))
    }
    if ((req.body?.endAt || req.body?.end_at) && !endAt) {
      return reply.code(400).send(fail('endAt 时间格式无效'))
    }
    if (startAt && endAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
      return reply.code(400).send(fail('endAt 不能早于 startAt'))
    }

    const id = String(req.body?.id || randomUUID()).trim() || randomUUID()
    const pinned = toBooleanFlag(req.body?.pinned, 0)
    const isActive = toBooleanFlag(req.body?.isActive ?? req.body?.is_active, 1)
    const sortOrder = toSafeInteger(req.body?.sortOrder ?? req.body?.sort_order, 0, -1000000, 1000000)
    const createdBy = String(req.user?.id || req.user?.uid || '').trim() || null

    await db.prepare(`
      INSERT INTO platform_notices (
        id, title, content, pinned, sort_order, is_active, start_at, end_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title.slice(0, 255),
      content,
      pinned,
      sortOrder,
      isActive,
      startAt,
      endAt,
      createdBy
    )

    const row = await db.prepare(`
      SELECT
        id, title, content, pinned, sort_order, is_active,
        start_at, end_at, created_by, created_at, updated_at
      FROM platform_notices
      WHERE id = ?
      LIMIT 1
    `).get(id)

    return ok({ item: row ? mapNoticeRow(row) : null }, '通知发布成功')
  })

  // PUT /api/notices/admin/:id
  // 管理员修改通知
  fastify.put('/admin/:id', adminAuth, async (req, reply) => {
    const noticeId = String(req.params?.id || '').trim()
    if (!noticeId) {
      return reply.code(400).send(fail('通知 id 不能为空'))
    }

    const existing = await getNoticeById(noticeId)
    if (!existing) {
      return reply.code(404).send(fail('通知不存在', 404))
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {}

    let title = String(existing.title || '').trim()
    if (hasAnyOwn(body, ['title'])) {
      title = String(body.title || '').trim()
      if (!title) {
        return reply.code(400).send(fail('title 不能为空'))
      }
    }

    let content = String(existing.content || '').trim()
    if (hasAnyOwn(body, ['content'])) {
      content = String(body.content || '').trim()
      if (!content) {
        return reply.code(400).send(fail('content 不能为空'))
      }
    }

    let pinned = Number(existing.pinned || 0) > 0 ? 1 : 0
    if (hasAnyOwn(body, ['pinned'])) {
      pinned = toBooleanFlag(body.pinned, pinned)
    }

    let sortOrder = toSafeInteger(existing.sort_order, 0, -1000000, 1000000)
    if (hasAnyOwn(body, ['sortOrder', 'sort_order'])) {
      sortOrder = toSafeInteger(body.sortOrder ?? body.sort_order, sortOrder, -1000000, 1000000)
    }

    let isActive = Number(existing.is_active || 0) > 0 ? 1 : 0
    if (hasAnyOwn(body, ['isActive', 'is_active'])) {
      isActive = toBooleanFlag(body.isActive ?? body.is_active, isActive)
    }

    let startAt = existing.start_at || null
    if (hasAnyOwn(body, ['startAt', 'start_at'])) {
      const rawStart = pickFirstDefined(body, ['startAt', 'start_at'])
      startAt = normalizeDateTime(rawStart)
      if (rawStart !== undefined && rawStart !== null && rawStart !== '' && !startAt) {
        return reply.code(400).send(fail('startAt 时间格式无效'))
      }
    }

    let endAt = existing.end_at || null
    if (hasAnyOwn(body, ['endAt', 'end_at'])) {
      const rawEnd = pickFirstDefined(body, ['endAt', 'end_at'])
      endAt = normalizeDateTime(rawEnd)
      if (rawEnd !== undefined && rawEnd !== null && rawEnd !== '' && !endAt) {
        return reply.code(400).send(fail('endAt 时间格式无效'))
      }
    }

    if (startAt && endAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
      return reply.code(400).send(fail('endAt 不能早于 startAt'))
    }

    await db.prepare(`
      UPDATE platform_notices
      SET
        title = ?,
        content = ?,
        pinned = ?,
        sort_order = ?,
        is_active = ?,
        start_at = ?,
        end_at = ?
      WHERE id = ?
    `).run(
      title.slice(0, 255),
      content,
      pinned,
      sortOrder,
      isActive,
      startAt,
      endAt,
      noticeId
    )

    const row = await getNoticeById(noticeId)
    return ok({ item: row ? mapNoticeRow(row) : null }, '通知更新成功')
  })

  // DELETE /api/notices/admin/:id
  // 管理员下线通知（软删除：is_active = 0）
  fastify.delete('/admin/:id', adminAuth, async (req, reply) => {
    const noticeId = String(req.params?.id || '').trim()
    if (!noticeId) {
      return reply.code(400).send(fail('通知 id 不能为空'))
    }

    const existing = await getNoticeById(noticeId)
    if (!existing) {
      return reply.code(404).send(fail('通知不存在', 404))
    }

    if (Number(existing.is_active || 0) > 0) {
      await db.prepare(`
        UPDATE platform_notices
        SET is_active = 0
        WHERE id = ?
      `).run(noticeId)
    }

    const row = await getNoticeById(noticeId)
    return ok({ item: row ? mapNoticeRow(row) : null }, '通知已下线')
  })
}
