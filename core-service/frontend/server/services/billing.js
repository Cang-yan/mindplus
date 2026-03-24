'use strict'

const axios = require('axios')
const { randomUUID } = require('crypto')
const config = require('../config')
const { db } = require('../db')

const BILLING_SCENES = Object.freeze({
  AIPPT_OUTLINE: 'aippt_outline',
  AIPPT_JSON2PPT: 'aippt_json2ppt',
  LITERATURE_OCR: 'literature_ocr',
  LITERATURE_TRANSLATE: 'literature_translate',
  LITERATURE_ASSISTANT_GENERATE: 'literature_assistant_generate',
  LITERATURE_ASSISTANT_RESEARCH: 'literature_assistant_research',
  LITERATURE_ASSISTANT_BACHELOR: 'literature_assistant_bachelor',
  LITERATURE_ASSISTANT_MASTER: 'literature_assistant_master',
  LITERATURE_ASSISTANT_PHD: 'literature_assistant_phd',
})

const VALID_SCENES = new Set(Object.values(BILLING_SCENES))
const SCENE_DISPLAY_NAMES = Object.freeze({
  [BILLING_SCENES.AIPPT_OUTLINE]: 'PPT大纲生成',
  [BILLING_SCENES.AIPPT_JSON2PPT]: 'ppt智能生成',
  [BILLING_SCENES.LITERATURE_OCR]: '文献OCR服务',
  [BILLING_SCENES.LITERATURE_TRANSLATE]: '文献翻译服务',
  [BILLING_SCENES.LITERATURE_ASSISTANT_GENERATE]: '文献编撰服务',
  [BILLING_SCENES.LITERATURE_ASSISTANT_RESEARCH]: '文献编撰-研究',
  [BILLING_SCENES.LITERATURE_ASSISTANT_BACHELOR]: '文献编撰-本科',
  [BILLING_SCENES.LITERATURE_ASSISTANT_MASTER]: '文献编撰-硕士',
  [BILLING_SCENES.LITERATURE_ASSISTANT_PHD]: '文献编撰-博士',
})

function resolveAssistantLevelScene(rawLevel) {
  const level = String(rawLevel || '').trim().toLowerCase()
  if (level === 'research_paper' || level === 'research' || level === '研究' || level === '研究论文') {
    return BILLING_SCENES.LITERATURE_ASSISTANT_RESEARCH
  }
  if (level === 'bachelor' || level === 'undergraduate' || level === '本科') {
    return BILLING_SCENES.LITERATURE_ASSISTANT_BACHELOR
  }
  if (level === 'master' || level === '硕士') {
    return BILLING_SCENES.LITERATURE_ASSISTANT_MASTER
  }
  if (level === 'phd' || level === '博士') {
    return BILLING_SCENES.LITERATURE_ASSISTANT_PHD
  }
  return ''
}

function resolveSceneDisplayName(scene, meta) {
  const safeScene = String(scene || '').trim()

  if (safeScene === BILLING_SCENES.LITERATURE_ASSISTANT_GENERATE) {
    const inferredSceneFromLevel = resolveAssistantLevelScene(
      meta?.academicLevel || meta?.level || meta?.rawLevel || ''
    )
    if (inferredSceneFromLevel) {
      return SCENE_DISPLAY_NAMES[inferredSceneFromLevel]
    }
  }

  return SCENE_DISPLAY_NAMES[safeScene] || safeScene
}

function roundCredits(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}

function createBillingError(message, statusCode = 500, code = 'BILLING_FAILED', extra = {}) {
  const err = new Error(String(message || '扣费失败'))
  err.statusCode = Number(statusCode) || 500
  err.code = code
  Object.assign(err, extra || {})
  return err
}

function parseBearerToken(authHeader) {
  const raw = String(authHeader || '').trim()
  if (!raw) return ''
  const match = raw.match(/^Bearer\s+(.+)$/i)
  if (match && match[1]) return String(match[1]).trim()
  return ''
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {}
  return meta
}

function getScenePrice(scene) {
  const prices = config.billing?.prices || {}
  const n = Number(prices?.[scene])
  if (!Number.isFinite(n) || n <= 0) return 0
  return roundCredits(n)
}

function resolveOverdraftLimit() {
  const n = Number(config.billing?.overdraftLimit)
  if (!Number.isFinite(n) || n < 0) return null
  return roundCredits(n)
}

function resolveBillingServiceKey() {
  return String(config.minduser?.serviceKey || 'mindplus').trim() || 'mindplus'
}

function resolveMindUserBaseUrl() {
  const baseUrl = String(config.billing?.mindUserBaseUrl || '').trim()
  if (!baseUrl) {
    throw createBillingError('扣费服务配置不完整：缺少 MindUser 地址', 500, 'BILLING_CONFIG_ERROR')
  }
  return baseUrl.replace(/\/+$/, '')
}

function buildMindUserUrl(pathname) {
  return new URL(pathname, `${resolveMindUserBaseUrl()}/`).toString()
}

function getInternalHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }
  const internalKey = String(config.billing?.internalKey || '').trim()
  if (internalKey) {
    headers['x-internal-key'] = internalKey
  }
  return headers
}

async function getCurrentDebt(userId) {
  const row = await db.prepare(`
    SELECT debt
    FROM credit_overdraft_accounts
    WHERE user_id = ?
    LIMIT 1
  `).get(userId)
  const debt = Number(row?.debt || 0)
  if (!Number.isFinite(debt) || debt < 0) return 0
  return roundCredits(debt)
}

async function setCurrentDebt(userId, debtAmount) {
  const nextDebt = roundCredits(Math.max(0, Number(debtAmount) || 0))
  const now = new Date().toISOString()
  if (nextDebt <= 0) {
    await db.prepare(`
      DELETE FROM credit_overdraft_accounts
      WHERE user_id = ?
    `).run(userId)
    return 0
  }

  await db.prepare(`
    INSERT INTO credit_overdraft_accounts (user_id, debt, updated_at)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      debt = VALUES(debt),
      updated_at = VALUES(updated_at)
  `).run(userId, nextDebt, now)
  return nextDebt
}

async function fetchWalletCredits(token) {
  const serviceKey = resolveBillingServiceKey()
  const url = buildMindUserUrl(`/api/${serviceKey}/wallet/summary`)

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    // Avoid proxy hijacking localhost calls (same fix pattern as OpenDraft proxy).
    proxy: false,
    timeout: 12000,
    validateStatus: () => true,
  })

  const payload = response?.data || {}
  if (response.status < 200 || response.status >= 300 || Number(payload?.code) !== 200) {
    const message = String(payload?.message || `查询钱包失败（HTTP ${response.status}）`)
    const statusCode = Number(response?.status)
    const safeStatusCode = Number.isFinite(statusCode) && statusCode >= 400 && statusCode <= 599
      ? statusCode
      : 502
    throw createBillingError(message, safeStatusCode, 'BILLING_WALLET_SUMMARY_FAILED')
  }

  const credits = Number(payload?.data?.credits)
  if (!Number.isFinite(credits)) {
    throw createBillingError('钱包余额返回异常，无法完成扣费', 502, 'BILLING_WALLET_SUMMARY_INVALID')
  }

  return roundCredits(credits)
}

function isWalletInsufficient(response) {
  const payload = response?.data || {}
  const message = String(payload?.message || '').toLowerCase()
  return response?.status === 400 && message.includes('余额不足')
}

async function consumeWalletCredits({ userId, amount, reason, sourceRef, meta }) {
  const consumeAmount = roundCredits(amount)
  if (!Number.isFinite(consumeAmount) || consumeAmount <= 0) return 0

  const serviceKey = resolveBillingServiceKey()
  const url = buildMindUserUrl(`/api/${serviceKey}/open/consume`)

  const response = await axios.post(
    url,
    {
      uid: userId,
      amount: consumeAmount,
      reason: String(reason || 'consume'),
      sourceRef: String(sourceRef || ''),
      meta: normalizeMeta(meta),
    },
    {
      headers: getInternalHeaders(),
      // MindUser runs on local network; bypass environment HTTP proxy.
      proxy: false,
      timeout: 12000,
      validateStatus: () => true,
    }
  )

  const payload = response?.data || {}
  if (response.status >= 200 && response.status < 300 && Number(payload?.code) === 200) {
    const spent = Number(payload?.data?.consume_amount)
    if (Number.isFinite(spent) && spent > 0) {
      return roundCredits(spent)
    }
    return consumeAmount
  }

  if (isWalletInsufficient(response)) {
    return 0
  }

  const message = String(payload?.message || `扣减钱包余额失败（HTTP ${response.status}）`)
  const consumeStatus = Number(response?.status)
  const safeConsumeStatus = Number.isFinite(consumeStatus) && consumeStatus >= 400 && consumeStatus <= 599
    ? consumeStatus
    : 502
  throw createBillingError(message, safeConsumeStatus, 'BILLING_WALLET_CONSUME_FAILED')
}

function buildRefundCardCode(scene, chargeId) {
  const safeScene = String(scene || 'unknown').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'scene'
  const safeChargeId = String(chargeId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'charge'
  const ts = Date.now().toString(36).toUpperCase()
  const rand = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  return `RF-${safeScene}-${safeChargeId}-${ts}-${rand}`
}

async function rechargeWalletCredits({ userId, amount, scene, chargeId, reason, meta }) {
  const rechargeAmount = roundCredits(amount)
  if (!Number.isFinite(rechargeAmount) || rechargeAmount <= 0) return 0

  const serviceKey = resolveBillingServiceKey()
  const url = buildMindUserUrl(`/api/${serviceKey}/open/recharge`)
  const cardCode = buildRefundCardCode(scene, chargeId)

  const response = await axios.post(
    url,
    {
      uid: userId,
      cardString: cardCode,
      faceValue: String(reason || 'credits退款，调用失败'),
      creditsAmount: rechargeAmount,
      salePrice: '0',
      validPeriod: '退款补偿',
      batchNo: `refund_${String(scene || '').slice(0, 24) || 'scene'}`,
      reason: String(reason || 'credits退款，调用失败'),
      sourceRef: String(chargeId || ''),
      meta: normalizeMeta(meta),
    },
    {
      headers: getInternalHeaders(),
      // MindUser runs on local network; bypass environment HTTP proxy.
      proxy: false,
      timeout: 12000,
      validateStatus: () => true,
    }
  )

  const payload = response?.data || {}
  if (response.status >= 200 && response.status < 300 && Number(payload?.code) === 200) {
    const refunded = Number(payload?.data?.recharge_amount)
    if (Number.isFinite(refunded) && refunded > 0) {
      return roundCredits(refunded)
    }
    return rechargeAmount
  }

  const message = String(payload?.message || `退款失败（HTTP ${response.status}）`)
  const refundStatus = Number(response?.status)
  const safeRefundStatus = Number.isFinite(refundStatus) && refundStatus >= 400 && refundStatus <= 599
    ? refundStatus
    : 502
  throw createBillingError(message, safeRefundStatus, 'BILLING_WALLET_REFUND_FAILED')
}

async function insertChargeRecord({
  id,
  userId,
  serviceKey,
  scene,
  amount,
  consumed,
  walletCredits,
  debtBefore,
  debtAfter,
  effectiveBefore,
  effectiveAfter,
  metadata,
  now,
}) {
  await db.prepare(`
    INSERT INTO credit_charge_records (
      id,
      user_id,
      service_key,
      scene,
      charge_amount,
      consume_amount,
      wallet_credits,
      debt_before,
      debt_after,
      effective_before,
      effective_after,
      metadata,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    serviceKey,
    scene,
    amount,
    consumed,
    walletCredits,
    debtBefore,
    debtAfter,
    effectiveBefore,
    effectiveAfter,
    JSON.stringify(normalizeMeta(metadata)),
    now
  )
}

async function insertRefundRecord({
  chargeId,
  userId,
  serviceKey,
  scene,
  amount,
  walletRefund,
  debtRevertAmount,
  reason,
  metadata,
  now,
}) {
  await db.prepare(`
    INSERT INTO credit_refund_records (
      id,
      charge_id,
      user_id,
      service_key,
      scene,
      refund_amount,
      wallet_refund,
      debt_revert_amount,
      reason,
      metadata,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    chargeId,
    userId,
    serviceKey,
    scene,
    amount,
    walletRefund,
    debtRevertAmount,
    String(reason || 'credits退款，调用失败'),
    JSON.stringify(normalizeMeta(metadata)),
    now
  )
}

async function chargeCreditsForScene({ req, scene, meta, amount }) {
  const safeScene = String(scene || '').trim()
  if (!VALID_SCENES.has(safeScene)) {
    throw createBillingError('未知扣费场景', 400, 'BILLING_SCENE_INVALID')
  }
  const normalizedMeta = normalizeMeta(meta)
  const sceneDisplayName = resolveSceneDisplayName(safeScene, normalizedMeta)

  const parsedAmount = Number(amount)
  const chargeAmount = Number.isFinite(parsedAmount) && parsedAmount > 0
    ? roundCredits(parsedAmount)
    : getScenePrice(safeScene)

  if (!config.billing?.enabled || chargeAmount <= 0) {
    return {
      charged: false,
      amount: 0,
      scene: safeScene,
      reason: config.billing?.enabled ? 'zero_price' : 'billing_disabled',
    }
  }

  const userId = String(req?.user?.id || req?.user?.uid || '').trim()
  if (!userId) {
    throw createBillingError('未登录或用户身份缺失，无法扣费', 401, 'BILLING_AUTH_REQUIRED')
  }

  const token = parseBearerToken(req?.headers?.authorization)
  if (!token) {
    throw createBillingError('缺少登录凭证，无法完成扣费', 401, 'BILLING_AUTH_REQUIRED')
  }

  const walletCredits = await fetchWalletCredits(token)
  const debtBefore = await getCurrentDebt(userId)
  const effectiveBefore = roundCredits(walletCredits - debtBefore)
  const effectiveAfter = roundCredits(effectiveBefore - chargeAmount)
  const overdraftLimit = resolveOverdraftLimit()

  if (overdraftLimit !== null && effectiveAfter < -overdraftLimit) {
    const needed = roundCredits(Math.abs(effectiveAfter) - overdraftLimit)
    throw createBillingError(
      `credits 不足，当前调用需要额外 ${needed} credits（欠费上限 ${overdraftLimit}）`,
      402,
      'BILLING_OVERDRAFT_LIMIT_EXCEEDED',
      {
        data: {
          scene: safeScene,
          amount: chargeAmount,
          walletCredits,
          debtBefore,
          effectiveBefore,
          effectiveAfter,
          overdraftLimit,
          needed,
        },
      }
    )
  }

  const sourceRef = `charge:${safeScene}:${Date.now()}:${randomUUID().slice(0, 8)}`
  let consumed = 0
  if (config.billing?.consumeWithWallet) {
    const plannedConsume = roundCredits(Math.min(chargeAmount, Math.max(walletCredits, 0)))
    if (plannedConsume > 0) {
      consumed = await consumeWalletCredits({
        userId,
        amount: plannedConsume,
        reason: sceneDisplayName,
        sourceRef,
        meta: {
          ...normalizedMeta,
          scene: sceneDisplayName,
          sceneKey: safeScene,
          phase: 'charge',
        },
      })
    }
  }

  const debtDelta = roundCredits(Math.max(0, chargeAmount - consumed))
  const debtAfter = await setCurrentDebt(userId, debtBefore + debtDelta)
  const now = new Date().toISOString()
  const serviceKey = resolveBillingServiceKey()
  const chargeId = randomUUID()

  await insertChargeRecord({
    id: chargeId,
    userId,
    serviceKey,
    scene: safeScene,
    amount: chargeAmount,
    consumed,
    walletCredits,
    debtBefore,
    debtAfter,
    effectiveBefore,
    effectiveAfter,
    metadata: {
      sourceRef,
      ...normalizedMeta,
      sceneDisplayName,
    },
    now,
  })

  return {
    chargeId,
    charged: true,
    scene: safeScene,
    sceneDisplayName,
    amount: chargeAmount,
    consumeAmount: consumed,
    debtDelta,
    debtBefore,
    debtAfter,
    walletCredits,
    effectiveBefore,
    effectiveAfter,
    overdraftLimit,
    chargedAt: now,
    sourceRef,
  }
}

async function refundChargeById({ req, chargeId, reason, meta }) {
  const safeChargeId = String(chargeId || '').trim()
  if (!safeChargeId) {
    throw createBillingError('缺少 chargeId，无法退款', 400, 'BILLING_REFUND_CHARGE_ID_REQUIRED')
  }

  const userId = String(req?.user?.id || req?.user?.uid || '').trim()
  if (!userId) {
    throw createBillingError('未登录或用户身份缺失，无法退款', 401, 'BILLING_AUTH_REQUIRED')
  }

  const chargeRow = await db.prepare(`
    SELECT
      id,
      user_id,
      service_key,
      scene,
      charge_amount,
      consume_amount,
      debt_before,
      debt_after,
      created_at
    FROM credit_charge_records
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).get(safeChargeId, userId)

  if (!chargeRow) {
    throw createBillingError('扣费记录不存在或无权限退款', 404, 'BILLING_CHARGE_NOT_FOUND')
  }

  const existedRefund = await db.prepare(`
    SELECT id, created_at
    FROM credit_refund_records
    WHERE charge_id = ?
    LIMIT 1
  `).get(safeChargeId)

  if (existedRefund) {
    return {
      chargeId: safeChargeId,
      scene: String(chargeRow.scene || ''),
      refunded: false,
      alreadyRefunded: true,
      refundedAt: existedRefund.created_at,
    }
  }

  const chargeAmount = roundCredits(chargeRow.charge_amount)
  const walletConsumed = roundCredits(chargeRow.consume_amount)
  const debtBefore = roundCredits(chargeRow.debt_before)
  const debtAfter = roundCredits(chargeRow.debt_after)
  const debtDelta = roundCredits(Math.max(0, debtAfter - debtBefore))
  const walletRefund = roundCredits(Math.max(0, Math.min(chargeAmount, walletConsumed)))
  const serviceKey = String(chargeRow.service_key || resolveBillingServiceKey())
  const scene = String(chargeRow.scene || '')
  const refundReason = String(reason || 'credits退款，调用失败').trim() || 'credits退款，调用失败'

  if (walletRefund > 0) {
    await rechargeWalletCredits({
      userId,
      amount: walletRefund,
      scene,
      chargeId: safeChargeId,
      reason: refundReason,
      meta: {
        chargeId: safeChargeId,
        scene,
        serviceKey,
        ...normalizeMeta(meta),
      },
    })
  }

  let debtAfterRefund = await getCurrentDebt(userId)
  if (debtDelta > 0) {
    debtAfterRefund = await setCurrentDebt(userId, debtAfterRefund - debtDelta)
  }

  const now = new Date().toISOString()
  await insertRefundRecord({
    chargeId: safeChargeId,
    userId,
    serviceKey,
    scene,
    amount: chargeAmount,
    walletRefund,
    debtRevertAmount: debtDelta,
    reason: refundReason,
    metadata: {
      chargeCreatedAt: chargeRow.created_at,
      ...normalizeMeta(meta),
    },
    now,
  })

  return {
    chargeId: safeChargeId,
    scene,
    refunded: true,
    alreadyRefunded: false,
    refundAmount: chargeAmount,
    walletRefundAmount: walletRefund,
    debtRevertAmount: debtDelta,
    debtAfterRefund,
    reason: refundReason,
    refundedAt: now,
  }
}

module.exports = {
  BILLING_SCENES,
  chargeCreditsForScene,
  refundChargeById,
}
