import { request } from '@/utils/req'
import { unwrapResponse } from '@/api/response'

function normalizeNoticeItem(item) {
  if (!item || typeof item !== 'object') return null
  const id = String(item.id || '').trim()
  if (!id) return null

  return {
    id,
    title: String(item.title || '').trim(),
    content: String(item.content || '').trim(),
    pinned: Boolean(item.pinned),
    sortOrder: Number.isFinite(Number(item.sortOrder))
      ? Math.floor(Number(item.sortOrder))
      : Math.floor(Number(item.sort_order || 0) || 0),
    isActive: Boolean(item.isActive ?? item.is_active),
    startAt: item.startAt ? String(item.startAt) : (item.start_at ? String(item.start_at) : null),
    endAt: item.endAt ? String(item.endAt) : (item.end_at ? String(item.end_at) : null),
    createdBy: item.createdBy ? String(item.createdBy) : (item.created_by ? String(item.created_by) : null),
    createdAt: String(item.createdAt || item.created_at || ''),
    updatedAt: String(item.updatedAt || item.updated_at || ''),
  }
}

export async function listPublicNotices(limit = 10) {
  const safeLimit = Number.isFinite(Number(limit))
    ? Math.max(1, Math.min(50, Math.floor(Number(limit))))
    : 10
  const res = await request.get('/api/notices/public', { params: { limit: safeLimit } })
  const payload = unwrapResponse(res)
  const rawItems = Array.isArray(payload?.data?.items) ? payload.data.items : []
  return rawItems.map(normalizeNoticeItem).filter(Boolean)
}

