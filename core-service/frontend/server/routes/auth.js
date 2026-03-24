'use strict'
const { randomUUID } = require('crypto')
const bcrypt = require('bcryptjs')
const { db, ok, fail } = require('../db')
const config = require('../config')

// Verification codes are persisted to DB and printed to server logs.
async function sendVerificationCode(fastify, email) {
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await db.prepare(`
    INSERT INTO verification_codes (email, code, expires_at, used)
    VALUES (?, ?, ?, 0)
    ON DUPLICATE KEY UPDATE
      expires_at = VALUES(expires_at),
      used = 0
  `).run(email, code, expiresAt)

  fastify.log.info(`[VerificationCode] ${email}: ${code}`)
  return code
}

module.exports = async function authRoutes(fastify) {
  // POST /api/auth/send-verification
  fastify.post('/send-verification', async (req, reply) => {
    const { email, username } = req.body || {}
    if (!email) return reply.code(400).send(fail('邮箱不能为空'))
    await sendVerificationCode(fastify, email)
    return ok(null, '验证码已发送')
  })

  // POST /api/auth/register
  fastify.post('/register', async (req, reply) => {
    const { email, password, username, name, verificationCode } = req.body || {}
    if (!email || !password) return reply.code(400).send(fail('邮箱和密码不能为空'))

    // Check if email already exists
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) return reply.code(400).send(fail('该邮箱已被注册'))

    // Verify code when provided.
    if (verificationCode) {
      const now = new Date().toISOString()
      const codeRow = await db.prepare(
        'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > ?'
      ).get(email, verificationCode, now)
      if (!codeRow) return reply.code(400).send(fail('验证码无效或已过期'))
      await db.prepare('UPDATE verification_codes SET used = 1 WHERE email = ? AND code = ?').run(email, verificationCode)
    }

    const id = randomUUID()
    const hash = await bcrypt.hash(password, 10)
    const displayName = name || username || email.split('@')[0]

    await db.prepare(`
      INSERT INTO users (id, email, username, password, role)
      VALUES (?, ?, ?, ?, 'user')
    `).run(id, email, displayName, hash)

    const token = fastify.jwt.sign({
      id,
      uid: id,
      email,
      username: displayName,
      role: 'user',
      service_key: config.minduser.serviceKey,
    })
    return ok({ token, user_info: { id, email, username: displayName, role: 'user' } }, '注册成功')
  })

  // POST /api/auth/login
  fastify.post('/login', async (req, reply) => {
    const { email, password } = req.body || {}
    if (!email || !password) return reply.code(400).send(fail('邮箱和密码不能为空'))

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (!user) return reply.code(401).send(fail('邮箱或密码错误', 401))

    const valid = await bcrypt.compare(password, user.password || '')
    if (!valid) return reply.code(401).send(fail('邮箱或密码错误', 401))

    const token = fastify.jwt.sign({
      id: user.id,
      uid: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      service_key: config.minduser.serviceKey,
    })
    return ok({
      token,
      user_info: { id: user.id, email: user.email, username: user.username, role: user.role },
    }, '登录成功')
  })

  // GET /api/auth/me  (requires auth)
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const uid = String(req.user?.id || req.user?.uid || '').trim()
    if (!uid) {
      return reply.code(401).send(fail('登录态无效：缺少 uid', 401))
    }

    const user = await db
      .prepare('SELECT id, email, username, role, avatar, created_at FROM users WHERE id = ?')
      .get(uid)
    if (!user) {
      return reply.code(404).send(fail('用户不存在', 404))
    }

    return ok({
      ...user,
      uid: user.id,
      service_key: req.user.service_key || config.minduser.serviceKey,
    })
  })

  // POST /api/auth/github/callback
  fastify.post('/github/callback', async (req, reply) => {
    const { code, state } = req.body || {}
    if (!config.github.clientId) return reply.code(501).send(fail('GitHub OAuth 未配置'))

    try {
      const axios = require('axios')
      // Exchange code for access token
      const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        state,
      }, { headers: { Accept: 'application/json' } })

      const accessToken = tokenRes.data.access_token
      if (!accessToken) return reply.code(400).send(fail('GitHub OAuth 失败'))

      // Get user info
      const userRes = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const ghUser = userRes.data
      const email = ghUser.email || `gh_${ghUser.id}@github.local`

      let user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      if (!user) {
        const id = randomUUID()
        await db.prepare('INSERT INTO users (id, email, username, role) VALUES (?, ?, ?, ?)').run(
          id, email, ghUser.login || ghUser.name || email.split('@')[0], 'user'
        )
        user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id)
      }

      const token = fastify.jwt.sign({
        id: user.id,
        uid: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        service_key: config.minduser.serviceKey,
      })
      return ok({ token, user_info: { id: user.id, email: user.email, username: user.username, role: user.role } })
    } catch (e) {
      fastify.log.error('GitHub OAuth error:', e.message)
      return reply.code(500).send(fail('GitHub OAuth 请求失败'))
    }
  })
}
