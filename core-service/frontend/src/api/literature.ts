import { request } from '@/utils/req'
import { unwrapResponse } from '@/api/response'
import { emitCreditsChanged } from '@/utils/credits-events'

export type LiteratureSourceType = 'translation' | 'assistant'

export interface LiteratureHistoryItem {
  id: string
  sourceType: LiteratureSourceType
  recordId: string
  docId: string
  title: string
  subtitle: string
  timestamp: number
  updatedAt?: string
  createdAt?: string
  raw?: Record<string, any> | null
}

export interface LiteratureHistorySyncItem {
  id: string
  sourceType: LiteratureSourceType
  recordId: string
  docId: string
  title: string
  subtitle: string
  timestamp: number
  raw?: Record<string, any> | null
}

export interface LiteratureOcrPayload {
  images: string[]
  fileName?: string
  pageOffset?: number
}

export interface LiteratureTranslatePayload {
  text: string
  targetLang?: string
  systemPrompt?: string
}

export interface LiteratureTranslateResult {
  success: boolean
  result?: string
  error?: string
  billing?: Record<string, any> | null
  statusCode?: number
}

export interface LiteratureResultUpsertPayload {
  id?: string
  sourceType?: LiteratureSourceType
  recordId: string
  docId?: string
  title?: string
  subtitle?: string
  timestamp?: number
  fileName?: string
  fileSize?: number
  fileType?: string
  targetLanguage?: string
  translationModelName?: string
  translationModelId?: string | null
  result: Record<string, any>
}

export interface LiteratureResultItem {
  id: string
  sourceType: LiteratureSourceType
  recordId: string
  docId: string
  title: string
  subtitle: string
  timestamp: number
  fileName?: string
  fileSize?: number | null
  fileType?: string
  targetLanguage?: string
  translationModelName?: string
  translationModelId?: string
  result: Record<string, any> | null
  updatedAt?: string
  createdAt?: string
}

function toNumberTimestamp(value: unknown) {
  const n = Number(value)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  const t = new Date(String(value || '')).getTime()
  return Number.isFinite(t) && t > 0 ? Math.floor(t) : Date.now()
}

function normalizeHistoryItem(item: any): LiteratureHistoryItem | null {
  const sourceType = String(item?.sourceType || '').trim().toLowerCase()
  if (sourceType !== 'translation' && sourceType !== 'assistant') return null

  const recordId = String(item?.recordId || item?.docId || '').trim()
  if (!recordId) return null

  const docId = String(item?.docId || recordId).trim()
  const id = String(item?.id || `${sourceType}_${recordId}`).trim()
  return {
    id: id || `${sourceType}_${recordId}`,
    sourceType,
    recordId,
    docId,
    title: String(item?.title || '未命名记录'),
    subtitle: String(item?.subtitle || ''),
    timestamp: toNumberTimestamp(item?.timestamp || item?.updatedAt || item?.createdAt),
    updatedAt: item?.updatedAt ? String(item.updatedAt) : undefined,
    createdAt: item?.createdAt ? String(item.createdAt) : undefined,
    raw: item?.raw && typeof item.raw === 'object' ? item.raw : null,
  }
}

export async function listLiteratureHistory(sourceType?: LiteratureSourceType) {
  const res = await request.get('/api/literature/history', {
    params: sourceType ? { sourceType } : {}
  })
  const payload = unwrapResponse<{ items?: any[] }>(res)
  const list = Array.isArray(payload?.data?.items) ? payload.data.items : []
  return list.map(normalizeHistoryItem).filter(Boolean) as LiteratureHistoryItem[]
}

export async function syncLiteratureHistory(items: LiteratureHistorySyncItem[]) {
  const res = await request.post('/api/literature/history/sync', { items })
  const payload = unwrapResponse<{ synced?: number }>(res)
  return Number(payload?.data?.synced || 0)
}

export async function ocrLiteratureDocument(payload: LiteratureOcrPayload) {
  try {
    const res = await request.post('/api/literature/ocr', payload, {
      timeout: 180000,
    })
    // /api/literature/ocr 当前返回 plain object，不是 code/data 包装
    if (res && typeof res === 'object' && 'success' in res) {
      return res as { success: boolean; markdown?: string; pageCount?: number; error?: string }
    }
    const wrapped = unwrapResponse<any>(res)
    return (wrapped?.data || {}) as { success: boolean; markdown?: string; pageCount?: number; error?: string }
  } finally {
    emitCreditsChanged({ action: 'literature_ocr' })
  }
}

export async function translateLiteratureDocument(payload: LiteratureTranslatePayload) {
  try {
    const res = await request.post('/api/literature/translate', payload)
    // /api/literature/translate 当前返回 plain object，不是 code/data 包装
    if (res && typeof res === 'object' && 'success' in res) {
      return res as LiteratureTranslateResult
    }
    const wrapped = unwrapResponse<any>(res)
    return (wrapped?.data || {}) as LiteratureTranslateResult
  } catch (error: any) {
    const responseData = error?.response?.data
    const statusCode = Number(error?.response?.status)
    const message = String(
      responseData?.error
      || responseData?.message
      || error?.message
      || '翻译失败'
    ).trim() || '翻译失败'
    return {
      success: false,
      error: message,
      billing: responseData?.billing || null,
      statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
    }
  } finally {
    emitCreditsChanged({ action: 'literature_translate' })
  }
}

function normalizeResultItem(item: any): LiteratureResultItem | null {
  const sourceType = String(item?.sourceType || '').trim().toLowerCase()
  if (sourceType !== 'translation' && sourceType !== 'assistant') return null

  const recordId = String(item?.recordId || item?.docId || '').trim()
  if (!recordId) return null

  const docId = String(item?.docId || recordId).trim()
  const id = String(item?.id || `${sourceType}_${recordId}`).trim()

  const fileSizeRaw = item?.fileSize
  const fileSizeNum = fileSizeRaw === null || fileSizeRaw === undefined || fileSizeRaw === ''
    ? null
    : Number(fileSizeRaw)
  const fileSize = typeof fileSizeNum === 'number' && Number.isFinite(fileSizeNum)
    ? Math.floor(fileSizeNum)
    : null

  return {
    id: id || `${sourceType}_${recordId}`,
    sourceType,
    recordId,
    docId,
    title: String(item?.title || '未命名记录'),
    subtitle: String(item?.subtitle || ''),
    timestamp: toNumberTimestamp(item?.timestamp || item?.updatedAt || item?.createdAt),
    fileName: item?.fileName ? String(item.fileName) : undefined,
    fileSize,
    fileType: item?.fileType ? String(item.fileType) : undefined,
    targetLanguage: item?.targetLanguage ? String(item.targetLanguage) : undefined,
    translationModelName: item?.translationModelName ? String(item.translationModelName) : undefined,
    translationModelId: item?.translationModelId ? String(item.translationModelId) : undefined,
    result: item?.result && typeof item.result === 'object' ? item.result : null,
    updatedAt: item?.updatedAt ? String(item.updatedAt) : undefined,
    createdAt: item?.createdAt ? String(item.createdAt) : undefined,
  }
}

export async function upsertLiteratureResult(payload: LiteratureResultUpsertPayload) {
  const res = await request.post('/api/literature/results/upsert', payload)
  const wrapped = unwrapResponse<any>(res)
  return wrapped?.data || null
}

export async function getLiteratureResult(recordId: string, sourceType: LiteratureSourceType = 'translation') {
  const safeRecordId = String(recordId || '').trim()
  if (!safeRecordId) return null
  const res = await request.get(`/api/literature/results/${encodeURIComponent(safeRecordId)}`, {
    params: { sourceType }
  })
  const wrapped = unwrapResponse<any>(res)
  const item = wrapped?.data || null
  return normalizeResultItem(item)
}

export async function deleteLiteratureResult(recordId: string, sourceType: LiteratureSourceType = 'translation') {
  const safeRecordId = String(recordId || '').trim()
  if (!safeRecordId) return null
  const res = await request.delete(`/api/literature/results/${encodeURIComponent(safeRecordId)}`, {
    params: { sourceType }
  })
  const wrapped = unwrapResponse<any>(res)
  return wrapped?.data || null
}

export async function deleteLiteratureAssistantHistory(docId: string) {
  const safeDocId = String(docId || '').trim()
  if (!safeDocId) return null
  const res = await request.delete(`/api/literature/assistant/history/${encodeURIComponent(safeDocId)}`)
  const wrapped = unwrapResponse<any>(res)
  return wrapped?.data || null
}
