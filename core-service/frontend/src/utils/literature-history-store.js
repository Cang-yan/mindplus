import { request } from '@/utils/req'
import { unwrapResponse } from '@/api/response'

const HISTORY_LIST_API = '/api/literature/history'

function toTimestamp(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    const t = new Date(value).getTime()
    if (Number.isFinite(t) && t > 0) return t
  }
  return 0
}

function sortByTimestampDesc(a, b) {
  return (b?.timestamp || 0) - (a?.timestamp || 0)
}

function normalizeBackendWork(item) {
  const sourceType = String(item?.sourceType || '').toLowerCase()
  const recordId = String(item?.recordId || item?.docId || '')
  if (!sourceType || !recordId) return null

  return {
    id: String(item?.id || `${sourceType}_${recordId}`),
    sourceType,
    recordId,
    docId: String(item?.docId || recordId),
    title: String(item?.title || '未命名记录'),
    subtitle: String(item?.subtitle || ''),
    timestamp: toTimestamp(item?.timestamp, item?.updatedAt, item?.createdAt),
    raw: item?.raw && typeof item.raw === 'object' ? item.raw : null,
  }
}

async function fetchBackendWorks(sourceType) {
  const res = await request.get(HISTORY_LIST_API, {
    params: sourceType ? { sourceType } : {}
  })
  const payload = unwrapResponse(res)
  const items = Array.isArray(payload?.data?.items) ? payload.data.items : []
  return items.map(normalizeBackendWork).filter(Boolean).sort(sortByTimestampDesc)
}

export async function listLiteratureTranslationWorks() {
  return fetchBackendWorks('translation')
}

export async function listLiteratureAssistantWorks() {
  return fetchBackendWorks('assistant')
}

export async function listLiteratureWorksByType(type) {
  if (type === 'assistant') {
    return listLiteratureAssistantWorks()
  }
  return listLiteratureTranslationWorks()
}
