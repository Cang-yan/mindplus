'use strict'
const { randomUUID } = require('crypto')
const bcrypt = require('bcryptjs')
const { db, ok, fail } = require('../db')

module.exports = async function userRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] }

  // POST /user/register  (alias for /api/auth/register — some older clients call this)
  fastify.post('/register', async (req, reply) => {
    const { email, password, name, username } = req.body || {}
    if (!email || !password) return reply.code(400).send(fail('邮箱和密码不能为空'))
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) return reply.code(400).send(fail('该邮箱已被注册'))
    const id = randomUUID()
    const hash = await bcrypt.hash(password, 10)
    const displayName = name || username || email.split('@')[0]
    await db.prepare('INSERT INTO users (id, email, username, password, role) VALUES (?, ?, ?, ?, ?)').run(id, email, displayName, hash, 'user')
    const token = fastify.jwt.sign({ id, email, username: displayName, role: 'user' })
    return reply.code(201).send(ok({ token, user_info: { id, email, username: displayName, role: 'user' } }))
  })

  // POST /user/login  (alias)
  fastify.post('/login', async (req, reply) => {
    const { email, password } = req.body || {}
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (!user) return reply.code(401).send(fail('邮箱或密码错误', 401))
    const valid = await bcrypt.compare(password, user.password || '')
    if (!valid) return reply.code(401).send(fail('邮箱或密码错误', 401))
    const token = fastify.jwt.sign({ id: user.id, email: user.email, username: user.username, role: user.role })
    return ok({ token, user_info: { id: user.id, email: user.email, username: user.username, role: user.role } })
  })

  // GET /user/me
  fastify.get('/me', auth, async (req) => {
    const user = await db.prepare('SELECT id, email, username, role, avatar, created_at FROM users WHERE id = ?').get(req.user.id)
    return ok(user)
  })

  // PUT /user/me  — update profile
  fastify.put('/me', auth, async (req) => {
    const { username, avatar } = req.body || {}
    await db.prepare('UPDATE users SET username = COALESCE(?, username), avatar = COALESCE(?, avatar), updated_at = ? WHERE id = ?')
      .run(username ?? null, avatar ?? null, new Date().toISOString(), req.user.id)
    return ok(null, '更新成功')
  })

  // ── Admin routes ─────────────────────────────────────────────────────────

  const adminAuth = {
    preHandler: [fastify.authenticate, async (req, reply) => {
      if (req.user.role !== 'admin') return reply.code(403).send(fail('需要管理员权限', 403))
    }],
  }

  // GET /admin/users
  fastify.get('/users', adminAuth, async (req) => {
    const parsedPage = Number.parseInt(String(req.query?.page ?? '1'), 10)
    const parsedLimit = Number.parseInt(String(req.query?.limit ?? '20'), 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20
    const offset = (page - 1) * limit

    const users = await db.prepare(
      `SELECT id, email, username, role, created_at FROM users ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    ).all()
    const totalRow = await db.prepare('SELECT COUNT(*) as c FROM users').get()
    const total = Number(totalRow?.c || 0)
    return ok({ users, total })
  })

  // PUT /admin/users/:id/role
  fastify.put('/users/:id/role', adminAuth, async (req, reply) => {
    const { role } = req.body || {}
    if (!['user', 'admin'].includes(role)) return reply.code(400).send(fail('无效角色'))
    await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id)
    return ok(null, '更新成功')
  })

  // DELETE /admin/users/:id
  fastify.delete('/users/:id', adminAuth, async (req, reply) => {
    if (req.params.id === req.user.id) return reply.code(400).send(fail('不能删除自己'))
    await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
    return ok(null, '删除成功')
  })
}
