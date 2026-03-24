import { request } from '@/utils/req'
import { unwrapResponse } from '@/api/response'
import { emitCreditsChanged } from '@/utils/credits-events'

export async function chargeCredits(scene, meta) {
  const safeScene = String(scene || '').trim()
  if (!safeScene) {
    throw new Error('缺少扣费场景')
  }
  const res = await request.post('/api/billing/charge', {
    scene: safeScene,
    meta: meta && typeof meta === 'object' ? meta : {},
  })
  const payload = unwrapResponse(res)
  const data = payload?.data || null
  if (data?.charged) {
    emitCreditsChanged({
      action: 'charge',
      scene: safeScene,
      chargeId: data?.chargeId || '',
    })
  }
  return data
}

export async function refundCredits(chargeId, options = {}) {
  const safeChargeId = String(chargeId || '').trim()
  if (!safeChargeId) {
    throw new Error('缺少 chargeId，无法退款')
  }

  const reason = String(options?.reason || 'credits退款，调用失败')
  const meta = options?.meta && typeof options.meta === 'object' ? options.meta : {}

  const res = await request.post('/api/billing/refund', {
    chargeId: safeChargeId,
    reason,
    meta,
  })
  const payload = unwrapResponse(res)
  const data = payload?.data || null
  if (data?.refunded || data?.alreadyRefunded) {
    emitCreditsChanged({
      action: 'refund',
      chargeId: safeChargeId,
      reason,
    })
  }
  return data
}
