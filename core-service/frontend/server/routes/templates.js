'use strict'
const { randomUUID } = require('crypto')
const { db, ok, fail } = require('../db')

// Seed some default templates on first run
async function seedTemplates() {
  const countRow = await db.prepare('SELECT COUNT(*) as c FROM templates').get()
  const count = Number(countRow?.c || 0)
  if (count > 0) return
  const defaults = [
    { title: '商业计划书', category: 'business', thumbnail: '' },
    { title: '产品发布会', category: 'product', thumbnail: '' },
    { title: '年终总结', category: 'summary', thumbnail: '' },
    { title: '项目汇报', category: 'report', thumbnail: '' },
    { title: '教育课件', category: 'education', thumbnail: '' },
    { title: '简约白色', category: 'general', thumbnail: '' },
    { title: '深色商务', category: 'business', thumbnail: '' },
    { title: '创意设计', category: 'creative', thumbnail: '' },
  ]
  const stmt = db.prepare('INSERT INTO templates (id, title, category, source, thumbnail) VALUES (?, ?, ?, ?, ?)')
  await db.transaction(async () => {
    for (const t of defaults) {
      await stmt.run(randomUUID(), t.title, t.category, 'system', t.thumbnail)
    }
  })()
}

module.exports = async function templatesRoutes(fastify) {
  await seedTemplates()

  // GET /api/templates
  fastify.get('/', async (req) => {
    const { category, source } = req.query || {}
    const parsedPage = Number.parseInt(String(req.query?.page ?? '1'), 10)
    const parsedLimit = Number.parseInt(String(req.query?.limit ?? '20'), 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20
    const offset = (page - 1) * limit

    let sql = 'SELECT * FROM templates WHERE 1=1'
    const params = []
    if (category) { sql += ' AND category = ?'; params.push(category) }
    if (source)   { sql += ' AND source = ?';   params.push(source) }
    sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    const rows = await db.prepare(sql).all(...params)
    return ok({ templates: rows })
  })

  // GET /api/templates/:id
  fastify.get('/:id', async (req, reply) => {
    const row = await db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id)
    if (!row) return reply.code(404).send(fail('模板不存在', 404))
    return ok(row)
  })
}
