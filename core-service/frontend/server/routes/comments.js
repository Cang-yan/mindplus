'use strict'
const { randomUUID } = require('crypto')
const { db, ok, fail } = require('../db')

module.exports = async function commentsRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] }

  // POST /comments
  fastify.post('/', auth, async (req, reply) => {
    const { id, documentId, content, targetText } = req.body || {}
    if (!documentId || !content) return reply.code(400).send(fail('参数不完整'))
    const commentId = id || randomUUID()
    await db.prepare('INSERT INTO comments (id, document_id, user_id, content, target_text) VALUES (?, ?, ?, ?, ?)').run(commentId, documentId, req.user.id, content, targetText || null)
    return reply.code(201).send(ok({ id: commentId }))
  })

  // GET /comments?documentId=xxx
  fastify.get('/', auth, async (req, reply) => {
    const { documentId } = req.query
    if (!documentId) return reply.code(400).send(fail('documentId 不能为空'))
    const rows = await db.prepare('SELECT c.*, u.username FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.document_id = ? ORDER BY c.created_at ASC').all(documentId)
    return ok(rows)
  })

  // PUT /comments/:id
  fastify.put('/:id', auth, async (req, reply) => {
    const { content } = req.body || {}
    const comment = await db.prepare('SELECT * FROM comments WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!comment) return reply.code(404).send(fail('评论不存在', 404))
    await db.prepare('UPDATE comments SET content = ?, updated_at = ? WHERE id = ?').run(content, new Date().toISOString(), req.params.id)
    return ok(null, '更新成功')
  })

  // DELETE /comments/:id
  fastify.delete('/:id', auth, async (req, reply) => {
    const comment = await db.prepare('SELECT id FROM comments WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!comment) return reply.code(404).send(fail('评论不存在', 404))
    await db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id)
    return ok(null, '删除成功')
  })
}
