'use strict'
const { randomUUID } = require('crypto')
const { db, ok, fail } = require('../db')

module.exports = async function versionsRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] }

  // GET /api/presentations/:docId/versions
  fastify.get('/', auth, async (req) => {
    const { docId } = req.params
    const parsedPage = Number.parseInt(String(req.query?.page ?? '1'), 10)
    const parsedLimit = Number.parseInt(String(req.query?.limit ?? '20'), 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(100, parsedLimit) : 20
    const offset = (page - 1) * limit

    // Verify ownership
    const pres = await db.prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?').get(docId, req.user.id)
    if (!pres) return fail('演示不存在', 404)

    const totalRow = await db.prepare('SELECT COUNT(*) as c FROM presentation_versions WHERE presentation_id = ?').get(docId)
    const total = Number(totalRow?.c || 0)
    const versions = await db.prepare(
      `SELECT id, title, description, is_auto_save, author, created_at FROM presentation_versions WHERE presentation_id = ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    ).all(docId)

    return ok({ versions, total, page, limit })
  })

  // POST /api/presentations/:docId/versions
  fastify.post('/', auth, async (req, reply) => {
    const { docId } = req.params
    const pres = await db.prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?').get(docId, req.user.id)
    if (!pres) return reply.code(404).send(fail('演示不存在', 404))

    const { content, title, description, isAutoSave, author } = req.body || {}
    const id = randomUUID()
    await db.prepare(`
      INSERT INTO presentation_versions (id, presentation_id, user_id, title, description, content, is_auto_save, author)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, docId, req.user.id, title || null, description || null, content || null, isAutoSave ? 1 : 0, author || req.user.username)

    // Keep only latest 50 auto-save versions to avoid DB bloat
    await db.prepare(`
      DELETE FROM presentation_versions
      WHERE presentation_id = ? AND is_auto_save = 1
        AND id NOT IN (
          SELECT id FROM (
            SELECT id FROM presentation_versions
            WHERE presentation_id = ? AND is_auto_save = 1
            ORDER BY created_at DESC LIMIT 50
          ) AS keep_rows
        )
    `).run(docId, docId)

    return reply.code(201).send(ok({ id }))
  })

  // GET /api/presentations/:docId/versions/:versionId
  fastify.get('/:versionId', auth, async (req, reply) => {
    const v = await db.prepare('SELECT * FROM presentation_versions WHERE id = ? AND presentation_id = ?').get(req.params.versionId, req.params.docId)
    if (!v) return reply.code(404).send(fail('版本不存在', 404))
    return ok(v)
  })

  // PUT /api/presentations/:docId/versions/:versionId
  fastify.put('/:versionId', auth, async (req, reply) => {
    const { title, description } = req.body || {}
    const v = await db.prepare('SELECT id FROM presentation_versions WHERE id = ? AND presentation_id = ?').get(req.params.versionId, req.params.docId)
    if (!v) return reply.code(404).send(fail('版本不存在', 404))
    await db.prepare('UPDATE presentation_versions SET title = COALESCE(?, title), description = COALESCE(?, description) WHERE id = ?')
      .run(title ?? null, description ?? null, req.params.versionId)
    return ok(null, '更新成功')
  })

  // DELETE /api/presentations/:docId/versions/:versionId
  fastify.delete('/:versionId', auth, async (req, reply) => {
    const v = await db.prepare('SELECT id FROM presentation_versions WHERE id = ? AND presentation_id = ?').get(req.params.versionId, req.params.docId)
    if (!v) return reply.code(404).send(fail('版本不存在', 404))
    await db.prepare('DELETE FROM presentation_versions WHERE id = ?').run(req.params.versionId)
    return ok(null, '删除成功')
  })

  // GET /api/presentations/:docId/versions/:versionId/compare/:versionId2
  fastify.get('/:versionId/compare/:versionId2', auth, async (req, reply) => {
    const v1 = await db.prepare('SELECT * FROM presentation_versions WHERE id = ? AND presentation_id = ?').get(req.params.versionId, req.params.docId)
    const v2 = await db.prepare('SELECT * FROM presentation_versions WHERE id = ? AND presentation_id = ?').get(req.params.versionId2, req.params.docId)
    if (!v1 || !v2) return reply.code(404).send(fail('版本不存在', 404))
    return ok({ v1, v2 })
  })
}
