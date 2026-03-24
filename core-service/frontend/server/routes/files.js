'use strict'
const path = require('path')
const fs = require('fs')
const { randomUUID } = require('crypto')
const { ok, fail } = require('../db')
const config = require('../config')

// Ensure upload dir exists
const uploadDir = path.resolve(config.uploadDir)
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

module.exports = async function filesRoutes(fastify) {
  // POST /upload  — multipart file upload
  fastify.post('/', async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.code(400).send(fail('未收到文件'))

    const ext = path.extname(data.filename) || ''
    const fileName = `${randomUUID()}${ext}`
    const filePath = path.join(uploadDir, fileName)

    const buffer = await data.toBuffer()
    fs.writeFileSync(filePath, buffer)

    const publicUrl = `/uploads/${fileName}`
    return ok({ url: publicUrl, filename: fileName, size: buffer.length, mimetype: data.mimetype })
  })

  // POST /parse/doc2html  — convert uploaded doc to HTML (stub)
  fastify.post('/doc2html', async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.code(400).send(fail('未收到文件'))
    const buffer = await data.toBuffer()
    // Stub: return plaintext wrapped in <p> tags
    const text = buffer.toString('utf8').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = `<div>${text.split('\n').map(l => `<p>${l}</p>`).join('')}</div>`
    return ok({ html })
  })

  // POST /parse/pdf2html  — convert PDF to HTML (stub)
  fastify.post('/pdf2html', async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.code(400).send(fail('未收到文件'))
    return ok({ html: '<div><p>PDF 解析功能需要配置第三方服务</p></div>' })
  })
}
