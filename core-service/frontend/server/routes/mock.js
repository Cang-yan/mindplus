'use strict'
const { randomUUID } = require('crypto')
const { ok } = require('../db')

// Minimal mock data for offline development
module.exports = async function mockRoutes(fastify) {
  // GET /mock/doc  — returns a sample doc JSON
  fastify.get('/doc', async () => ok({
    id: randomUUID(),
    type: 'doc',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '这是一份示例文档' }] }] },
  }))

  // GET /mock/mind  — returns a sample mind map JSON
  fastify.get('/mind', async () => ok({
    id: randomUUID(),
    type: 'mind',
    content: { root: { id: '1', label: '中心主题', children: [{ id: '2', label: '分支一' }, { id: '3', label: '分支二' }] } },
  }))

  // GET /mock/board  — returns a sample whiteboard JSON
  fastify.get('/board', async () => ok({
    id: randomUUID(),
    type: 'board',
    content: { elements: [] },
  }))
}
