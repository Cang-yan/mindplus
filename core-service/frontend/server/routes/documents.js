'use strict'
const { randomUUID } = require('crypto')
const { db, ok, fail } = require('../db')

function getUserPermission(doc, userId) {
  if (!userId) {
    return { canAccess: doc.public_permission !== 'private', canEdit: doc.public_permission === 'edit', canComment: doc.public_permission !== 'private', isOwner: false, isAdmin: false }
  }
  if (doc.owner_id === userId) {
    return { canAccess: true, canEdit: true, canComment: true, isOwner: true, isAdmin: false }
  }
  return {
    canAccess: doc.public_permission !== 'private',
    canEdit: doc.public_permission === 'edit',
    canComment: doc.public_permission !== 'private',
    isOwner: false, isAdmin: false,
  }
}

module.exports = async function documentsRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] }

  // GET /documents
  fastify.get('/', auth, async (req) => {
    const filter = req.query.filter || 'active'
    const scope = req.query.scope || 'mine'

    let whereClause = 'owner_id = ?'
    if (filter === 'deleted') whereClause += ' AND is_deleted = 1'
    else if (filter === 'active') whereClause += ' AND is_deleted = 0'

    const rows = await db.prepare(
      `SELECT id, name, type, owner_id, public_permission, collaboration_enabled, is_deleted, deleted_at, page_settings, created_at, updated_at FROM documents WHERE ${whereClause} ORDER BY updated_at DESC`
    ).all(req.user.id)

    const result = rows.map(r => ({
      ...r,
      _userPermission: getUserPermission(r, req.user.id),
    }))
    return ok(result)
  })

  // GET /documents/stats  (must be before /:id)
  fastify.get('/stats', auth, async (req) => {
    const filter = req.query.filter || 'active'
    let where = 'owner_id = ?'
    if (filter === 'deleted') where += ' AND is_deleted = 1'
    else if (filter === 'active') where += ' AND is_deleted = 0'

    const totalRow = await db.prepare(`SELECT COUNT(*) as c FROM documents WHERE ${where}`).get(req.user.id)
    const total = Number(totalRow?.c || 0)
    return ok({ total, filter })
  })

  // GET /documents/:id
  fastify.get('/:id', async (req, reply) => {
    const userId = req.user?.id || null
    const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))

    const perm = getUserPermission(doc, userId)
    if (!perm.canAccess) return reply.code(403).send(fail('无访问权限', 403))

    const { content_slide, content_mindmap, content_sheet, ...meta } = doc
    return ok({ ...meta, _userPermission: perm })
  })

  // POST /documents
  fastify.post('/', auth, async (req, reply) => {
    const { name, type } = req.body || {}
    const id = randomUUID()
    await db.prepare('INSERT INTO documents (id, owner_id, name, type) VALUES (?, ?, ?, ?)').run(id, req.user.id, name || '未命名', type || 'doc')
    const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').get(id)
    return reply.code(201).send(ok({ ...doc, _userPermission: getUserPermission(doc, req.user.id) }))
  })

  // PUT /documents/:id  (rename)
  fastify.put('/:id', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    const { name } = req.body || {}
    await db.prepare('UPDATE documents SET name = COALESCE(?, name), updated_at = ? WHERE id = ?').run(name ?? null, new Date().toISOString(), req.params.id)
    return ok(null, '更新成功')
  })

  // PUT /documents/:id/slide
  fastify.put('/:id/slide', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    const perm = getUserPermission(doc, req.user.id)
    if (!perm.canEdit) return reply.code(403).send(fail('无编辑权限', 403))
    const { content } = req.body || {}
    await db.prepare('UPDATE documents SET content_slide = ?, updated_at = ? WHERE id = ?').run(content ?? null, new Date().toISOString(), req.params.id)
    return ok(null)
  })

  // GET /documents/:id/slide
  fastify.get('/:id/slide', async (req, reply) => {
    const doc = await db.prepare('SELECT content_slide, owner_id, public_permission FROM documents WHERE id = ?').get(req.params.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    const perm = getUserPermission(doc, req.user?.id)
    if (!perm.canAccess) return reply.code(403).send(fail('无访问权限', 403))
    return ok({ content: doc.content_slide })
  })

  // PUT /documents/:id/mindmap
  fastify.put('/:id/mindmap', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    if (!getUserPermission(doc, req.user.id).canEdit) return reply.code(403).send(fail('无编辑权限', 403))
    const { content } = req.body || {}
    await db.prepare('UPDATE documents SET content_mindmap = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(content), new Date().toISOString(), req.params.id)
    return ok(null)
  })

  // GET /documents/:id/mindmap
  fastify.get('/:id/mindmap', async (req, reply) => {
    const doc = await db.prepare('SELECT content_mindmap, owner_id, public_permission FROM documents WHERE id = ?').get(req.params.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    if (!getUserPermission(doc, req.user?.id).canAccess) return reply.code(403).send(fail('无访问权限', 403))
    return ok({ content: doc.content_mindmap ? JSON.parse(doc.content_mindmap) : null })
  })

  // PUT /documents/:id/sheet
  fastify.put('/:id/sheet', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    if (!getUserPermission(doc, req.user.id).canEdit) return reply.code(403).send(fail('无编辑权限', 403))
    const { snapshot } = req.body || {}
    await db.prepare('UPDATE documents SET content_sheet = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(snapshot), new Date().toISOString(), req.params.id)
    return ok(null)
  })

  // GET /documents/:id/sheet
  fastify.get('/:id/sheet', async (req, reply) => {
    const doc = await db.prepare('SELECT content_sheet, owner_id, public_permission FROM documents WHERE id = ?').get(req.params.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    if (!getUserPermission(doc, req.user?.id).canAccess) return reply.code(403).send(fail('无访问权限', 403))
    return ok({ snapshot: doc.content_sheet ? JSON.parse(doc.content_sheet) : null })
  })

  // PUT /documents/:id/page-settings
  fastify.put('/:id/page-settings', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    const { pageSettings } = req.body || {}
    await db.prepare('UPDATE documents SET page_settings = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(pageSettings), new Date().toISOString(), req.params.id)
    return ok(null)
  })

  // PUT /documents/:id/collaboration
  fastify.put('/:id/collaboration', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT id FROM documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    const { enabled } = req.body || {}
    await db.prepare('UPDATE documents SET collaboration_enabled = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, new Date().toISOString(), req.params.id)
    return ok(null)
  })

  // PUT /documents/:id/permission
  fastify.put('/:id/permission', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT id FROM documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    const { publicPermission } = req.body || {}
    if (!['edit', 'read', 'private'].includes(publicPermission)) return reply.code(400).send(fail('无效的权限值'))
    await db.prepare('UPDATE documents SET public_permission = ?, updated_at = ? WHERE id = ?').run(publicPermission, new Date().toISOString(), req.params.id)
    return ok(null)
  })

  // DELETE /documents/:id  (soft delete)
  fastify.delete('/:id', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT id FROM documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    await db.prepare('UPDATE documents SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?').run(new Date().toISOString(), new Date().toISOString(), req.params.id)
    return ok(null, '已移至回收站')
  })

  // PUT /documents/:id/restore
  fastify.put('/:id/restore', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT id FROM documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    await db.prepare('UPDATE documents SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id)
    return ok(null, '恢复成功')
  })

  // DELETE /documents/:id/permanent
  fastify.delete('/:id/permanent', auth, async (req, reply) => {
    const doc = await db.prepare('SELECT id FROM documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id)
    if (!doc) return reply.code(404).send(fail('文档不存在', 404))
    await db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id)
    return ok(null, '永久删除成功')
  })

  // POST /documents/batch-delete
  fastify.post('/batch-delete', auth, async (req) => {
    const { ids } = req.body || {}
    if (!Array.isArray(ids) || ids.length === 0) return fail('ids 不能为空')
    const now = new Date().toISOString()
    const stmt = db.prepare('UPDATE documents SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    await db.transaction(async () => {
      for (const id of ids) {
        await stmt.run(now, now, id, req.user.id)
      }
    })()
    return ok(null, '批量删除成功')
  })
}
