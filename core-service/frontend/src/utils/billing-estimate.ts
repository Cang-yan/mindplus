import { getRuntimeConfig } from '@/utils/runtimeConfig'

export type BillingEstimateScene =
  | 'aippt_json2ppt'
  | 'literature_ocr'
  | 'literature_translate'
  | 'literature_assistant_research'
  | 'literature_assistant_bachelor'
  | 'literature_assistant_master'
  | 'literature_assistant_phd'

export type AssistantAcademicLevel =
  | 'research_paper'
  | 'bachelor'
  | 'master'
  | 'phd'

const FALLBACK_UNIT_PRICE: Record<BillingEstimateScene, number> = {
  aippt_json2ppt: 1,
  literature_ocr: 1,
  literature_translate: 1,
  literature_assistant_research: 20,
  literature_assistant_bachelor: 33,
  literature_assistant_master: 50,
  literature_assistant_phd: 100,
}

const BILLING_PRICE_KEYS: Record<BillingEstimateScene, string[]> = {
  aippt_json2ppt: [
    'VITE_BILLING_PRICE_AIPPT_GENPPT',
    'BILLING_PRICE_AIPPT_GENPPT',
    'VITE_BILLING_PRICE_AIPPT_JSON2PPT',
    'BILLING_PRICE_AIPPT_JSON2PPT',
  ],
  literature_ocr: [
    'VITE_BILLING_PRICE_LITERATURE_OCR',
    'BILLING_PRICE_LITERATURE_OCR',
  ],
  literature_translate: [
    'VITE_BILLING_PRICE_LITERATURE_TRANSLATE',
    'BILLING_PRICE_LITERATURE_TRANSLATE',
  ],
  literature_assistant_research: [
    'VITE_BILLING_PRICE_LITERATURE_ASSISTANT_RESEARCH',
    'BILLING_PRICE_LITERATURE_ASSISTANT_RESEARCH',
  ],
  literature_assistant_bachelor: [
    'VITE_BILLING_PRICE_LITERATURE_ASSISTANT_BACHELOR',
    'BILLING_PRICE_LITERATURE_ASSISTANT_BACHELOR',
  ],
  literature_assistant_master: [
    'VITE_BILLING_PRICE_LITERATURE_ASSISTANT_MASTER',
    'BILLING_PRICE_LITERATURE_ASSISTANT_MASTER',
  ],
  literature_assistant_phd: [
    'VITE_BILLING_PRICE_LITERATURE_ASSISTANT_PHD',
    'BILLING_PRICE_LITERATURE_ASSISTANT_PHD',
  ],
}

function parseNonNegativeNumber(value: unknown) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return null
  return num
}

function readConfiguredUnitPrice(keys: string[], fallback: number) {
  for (const key of keys) {
    const raw = String(getRuntimeConfig(key) || '').trim()
    if (!raw) continue
    const parsed = parseNonNegativeNumber(raw)
    if (parsed !== null) return parsed
  }
  return fallback
}

export function getBillingUnitPrice(scene: BillingEstimateScene) {
  return readConfiguredUnitPrice(BILLING_PRICE_KEYS[scene], FALLBACK_UNIT_PRICE[scene])
}

export function normalizeAssistantAcademicLevel(raw: unknown): AssistantAcademicLevel {
  const text = String(raw || '').trim().toLowerCase()
  if (text === 'bachelor' || text === 'undergraduate' || text === '本科') return 'bachelor'
  if (text === 'master' || text === '硕士') return 'master'
  if (text === 'phd' || text === '博士') return 'phd'
  return 'research_paper'
}

export function getAssistantLevelBillingPrice(level: unknown) {
  const safeLevel = normalizeAssistantAcademicLevel(level)
  if (safeLevel === 'bachelor') return getBillingUnitPrice('literature_assistant_bachelor')
  if (safeLevel === 'master') return getBillingUnitPrice('literature_assistant_master')
  if (safeLevel === 'phd') return getBillingUnitPrice('literature_assistant_phd')
  return getBillingUnitPrice('literature_assistant_research')
}

export function estimateCreditsByPagedFormula(unitPrice: number, pageCount: number) {
  const safeUnit = parseNonNegativeNumber(unitPrice) || 0
  const safePagesRaw = Number(pageCount)
  const safePages = Number.isFinite(safePagesRaw) ? Math.max(0, safePagesRaw) : 0
  if (!safeUnit || !safePages) return 0
  return Math.ceil((safeUnit * safePages) / 2)
}

export function estimateLiteratureWorkflowCredits(pageCount: number, includeTranslate: boolean) {
  const ocrUnit = getBillingUnitPrice('literature_ocr')
  const ocrEstimate = estimateCreditsByPagedFormula(ocrUnit, pageCount)
  if (!includeTranslate) return ocrEstimate
  const translateUnit = getBillingUnitPrice('literature_translate')
  const translateEstimate = estimateCreditsByPagedFormula(translateUnit, pageCount)
  return ocrEstimate + translateEstimate
}

export function formatCreditsForDisplay(value: unknown) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '--'
  if (Number.isInteger(num)) return String(num)
  return num.toFixed(2).replace(/\.?0+$/, '')
}
