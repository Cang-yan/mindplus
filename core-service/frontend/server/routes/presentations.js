'use strict'
const { randomUUID } = require('crypto')
const { db, ok, fail } = require('../db')

module.exports = async function presentationsRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] }

  // GET /api/presentations
  fastify.get('/', auth, async (req) => {
    const rows = await db.prepare(
      'SELECT id, title, description, thumbnail, is_public, created_at, updated_at FROM presentations WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(req.user.id)
    return ok({ presentations: rows })
  })

  // POST /api/presentations
  fastify.post('/', auth, async (req, reply) => {
    const { title, description, content, thumbnail, isPublic } = req.body || {}
    const id = randomUUID()
    await db.prepare(`
      INSERT INTO presentations (id, user_id, title, description, content, thumbnail, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, title || '未命名演示', description || null, content || null, thumbnail || null, isPublic ? 1 : 0)
    const row = await db.prepare('SELECT * FROM presentations WHERE id = ?').get(id)
    return reply.code(201).send(ok(row, '创建成功'))
  })

  // GET /api/presentations/:id
  fastify.get('/:id', auth, async (req, reply) => {
    const row = await db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!row) return reply.code(404).send(fail('演示不存在', 404))
    return ok(row)
  })

  // PUT /api/presentations/:id
  fastify.put('/:id', auth, async (req, reply) => {
    const row = await db.prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!row) return reply.code(404).send(fail('演示不存在', 404))

    const { title, description, content, thumbnail, isPublic } = req.body || {}
    const now = new Date().toISOString()

    await db.prepare(`
      UPDATE presentations
      SET title       = COALESCE(?, title),
          description = COALESCE(?, description),
          content     = COALESCE(?, content),
          thumbnail   = COALESCE(?, thumbnail),
          is_public   = COALESCE(?, is_public),
          updated_at  = ?
      WHERE id = ?
    `).run(
      title ?? null, description ?? null, content ?? null, thumbnail ?? null,
      isPublic !== undefined ? (isPublic ? 1 : 0) : null,
      now, req.params.id
    )
    return ok(await db.prepare('SELECT * FROM presentations WHERE id = ?').get(req.params.id))
  })

  // DELETE /api/presentations/:id
  fastify.delete('/:id', auth, async (req, reply) => {
    const row = await db.prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!row) return reply.code(404).send(fail('演示不存在', 404))
    await db.prepare('DELETE FROM presentations WHERE id = ?').run(req.params.id)
    return ok(null, '删除成功')
  })

  // POST /api/presentations/:id/duplicate
  fastify.post('/:id/duplicate', auth, async (req, reply) => {
    const row = await db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!row) return reply.code(404).send(fail('演示不存在', 404))
    const newId = randomUUID()
    await db.prepare(`
      INSERT INTO presentations (id, user_id, title, description, content, thumbnail, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(newId, req.user.id, `${row.title} (副本)`, row.description, row.content, row.thumbnail, row.is_public)
    return reply.code(201).send(ok(await db.prepare('SELECT * FROM presentations WHERE id = ?').get(newId)))
  })
}
