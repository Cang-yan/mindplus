'use strict'

const { ok, fail } = require('../db')
const { BILLING_SCENES, chargeCreditsForScene, refundChargeById } = require('../services/billing')

const VALID_SCENES = new Set(Object.values(BILLING_SCENES))

module.exports = async function billingRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.post('/charge', auth, async (req, reply) => {
    const scene = String(req.body?.scene || '').trim()
    if (!VALID_SCENES.has(scene)) {
      return reply.code(400).send(fail('无效的扣费场景', 400))
    }

    try {
      const data = await chargeCreditsForScene({
        req,
        scene,
        meta: req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {},
      })
      return ok(data, '扣费成功')
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500)
      const message = String(error?.message || '扣费失败')
      return reply.code(statusCode).send({
        code: statusCode,
        data: error?.data || null,
        message,
      })
    }
  })

  fastify.post('/refund', auth, async (req, reply) => {
    const chargeId = String(req.body?.chargeId || '').trim()
    if (!chargeId) {
      return reply.code(400).send(fail('缺少 chargeId', 400))
    }

    try {
      const data = await refundChargeById({
        req,
        chargeId,
        reason: String(req.body?.reason || 'credits退款，调用失败'),
        meta: req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {},
      })
      return ok(data, data?.alreadyRefunded ? '该扣费已退款' : '退款成功')
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500)
      const message = String(error?.message || '退款失败')
      return reply.code(statusCode).send({
        code: statusCode,
        data: error?.data || null,
        message,
      })
    }
  })
}
