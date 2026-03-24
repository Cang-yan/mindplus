import { request } from '@/utils/req'
import { unwrapResponse } from '@/api/response'

function normalizeTimestamp(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    const t = new Date(String(value)).getTime()
    if (Number.isFinite(t) && t > 0) return Math.floor(t)
  }
  return Date.now()
}

function normalizeSlideCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const safe = Math.floor(n)
  return safe >= 0 ? safe : 0
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  if (status === 'pending' || status === 'generating' || status === 'completed' || status === 'failed') {
    return status
  }
  return 'pending'
}

function normalizeRecord(item) {
  const recordId = String(item?.recordId || item?.id || '').trim()
  if (!recordId) return null

  return {
    id: recordId,
    recordId,
    topic: String(item?.topic || '未命名 AI PPT'),
    outline: String(item?.outline || ''),
    templateId: item?.templateId == null ? '' : String(item.templateId),
    status: normalizeStatus(item?.status),
    progressText: String(item?.progressText || ''),
    pptId: item?.pptId == null ? '' : String(item.pptId),
    pptxProperty: item?.pptxProperty || '',
    slideCount: normalizeSlideCount(item?.slideCount),
    errorMessage: String(item?.errorMessage || ''),
    timestamp: normalizeTimestamp(item?.timestamp, item?.updatedAt, item?.createdAt),
    createdAt: item?.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item?.updatedAt ? String(item.updatedAt) : undefined,
    raw: item?.raw && typeof item.raw === 'object' ? item.raw : null,
  }
}

export async function listAipptHistory() {
  const res = await request.get('/api/aippt/history')
  const wrapped = unwrapResponse(res)
  const list = Array.isArray(wrapped?.data?.items) ? wrapped.data.items : []
  return list.map(normalizeRecord).filter(Boolean)
}

export async function getAipptHistory(recordId) {
  const safeRecordId = String(recordId || '').trim()
  if (!safeRecordId) return null
  const res = await request.get(`/api/aippt/history/${encodeURIComponent(safeRecordId)}`)
  const wrapped = unwrapResponse(res)
  return normalizeRecord(wrapped?.data?.item)
}

export async function upsertAipptHistory(item) {
  const res = await request.post('/api/aippt/history/upsert', item || {})
  const wrapped = unwrapResponse(res)
  return normalizeRecord(wrapped?.data?.item)
}

export async function syncAipptHistory(items) {
  const safeItems = Array.isArray(items) ? items : []
  const res = await request.post('/api/aippt/history/sync', { items: safeItems })
  const wrapped = unwrapResponse(res)
  return Number(wrapped?.data?.synced || 0)
}

export async function deleteAipptHistory(recordId) {
  const safeRecordId = String(recordId || '').trim()
  if (!safeRecordId) return { deleted: false, recordId: '' }
  const res = await request.delete(`/api/aippt/history/${encodeURIComponent(safeRecordId)}`)
  const wrapped = unwrapResponse(res)
  return wrapped?.data || { deleted: false, recordId: safeRecordId }
}
