import {
  deleteAipptHistory,
  getAipptHistory,
  listAipptHistory,
  syncAipptHistory,
  upsertAipptHistory,
} from '@/api/aippt-history'

const STORAGE_KEY = 'mindplus_aippt_generation_records_v1'
// 与文献助手页面保持一致：仅保留最近 10 条历史
const MAX_RECORDS = 10
const REMOTE_UPSERT_DEBOUNCE_MS = 450
const remoteUpsertTimers = new Map()
const pendingRemoteRecords = new Map()
let migrationAttempted = false

function safeParseArray(text) {
  if (!text) {
    return []
  }
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function nowIso() {
  return new Date().toISOString()
}

function createRecordId() {
  return `ppt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeRecord(input) {
  if (!input || typeof input !== 'object') {
    return null
  }
  if (!input.id) {
    return null
  }
  return {
    id: String(input.id),
    recordId: String(input.recordId || input.id),
    topic: String(input.topic || ''),
    outline: String(input.outline || ''),
    templateId: input.templateId == null ? '' : String(input.templateId),
    status: String(input.status || 'pending'),
    progressText: String(input.progressText || ''),
    pptId: input.pptId == null ? '' : String(input.pptId),
    pptxProperty: input.pptxProperty || '',
    slideCount: Number(input.slideCount || 0),
    errorMessage: String(input.errorMessage || ''),
    timestamp: Number(input.timestamp || Date.now()),
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
    raw: input.raw && typeof input.raw === 'object' ? input.raw : null,
  }
}

function readRawRecords() {
  if (typeof localStorage === 'undefined') {
    return []
  }
  const records = safeParseArray(localStorage.getItem(STORAGE_KEY))
  return records
    .map(normalizeRecord)
    .filter(Boolean)
}

function writeRawRecords(records) {
  if (typeof localStorage === 'undefined') {
    return
  }
  const normalized = records
    .map(normalizeRecord)
    .filter(Boolean)
  const trimmed = sortRecords(normalized).slice(0, MAX_RECORDS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const at = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const bt = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return bt - at
  })
}

export function listPptGenerationRecords() {
  return sortRecords(readRawRecords()).slice(0, MAX_RECORDS)
}

export function getPptGenerationRecord(id) {
  if (!id) {
    return null
  }
  const sid = String(id)
  return readRawRecords().find(item => item.id === sid) || null
}

function hasJwtToken() {
  if (typeof localStorage === 'undefined') return false
  return !!String(localStorage.getItem('jwt_token') || '').trim()
}

function scheduleRemoteUpsert(record) {
  const normalized = normalizeRecord(record)
  if (!normalized || !hasJwtToken()) {
    return
  }
  const key = String(normalized.id)
  pendingRemoteRecords.set(key, normalized)

  const existingTimer = remoteUpsertTimers.get(key)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const timer = setTimeout(async () => {
    remoteUpsertTimers.delete(key)
    const payload = pendingRemoteRecords.get(key)
    pendingRemoteRecords.delete(key)
    if (!payload) return
    try {
      await upsertAipptHistory(payload)
    } catch (error) {
      console.warn('aippt history upsert failed:', error)
    }
  }, REMOTE_UPSERT_DEBOUNCE_MS)

  remoteUpsertTimers.set(key, timer)
}

function scheduleRemoteDelete(recordId) {
  const safeRecordId = String(recordId || '').trim()
  if (!safeRecordId || !hasJwtToken()) {
    return
  }

  const existingTimer = remoteUpsertTimers.get(safeRecordId)
  if (existingTimer) {
    clearTimeout(existingTimer)
    remoteUpsertTimers.delete(safeRecordId)
  }
  pendingRemoteRecords.delete(safeRecordId)

  void deleteAipptHistory(safeRecordId).catch((error) => {
    console.warn('aippt history delete failed:', error)
  })
}

async function migrateLocalHistoryToRemoteOnce() {
  if (migrationAttempted) return
  if (!hasJwtToken()) return
  migrationAttempted = true

  const localItems = listPptGenerationRecords()
  if (!localItems.length) return

  try {
    await syncAipptHistory(localItems)
  } catch (error) {
    console.warn('aippt local history sync failed:', error)
  }
}

export async function hydratePptGenerationRecords() {
  if (!hasJwtToken()) {
    return listPptGenerationRecords()
  }

  await migrateLocalHistoryToRemoteOnce()

  try {
    const remoteItems = await listAipptHistory()
    writeRawRecords(remoteItems)
  } catch (error) {
    console.warn('aippt history hydrate failed:', error)
  }

  return listPptGenerationRecords()
}

export async function ensurePptGenerationRecord(recordId) {
  const safeRecordId = String(recordId || '').trim()
  if (!safeRecordId) return null

  const localHit = getPptGenerationRecord(safeRecordId)
  if (localHit) {
    return localHit
  }
  if (!hasJwtToken()) {
    return null
  }

  try {
    const remoteRecord = await getAipptHistory(safeRecordId)
    if (!remoteRecord) return null
    return upsertPptGenerationRecord(remoteRecord, { syncRemote: false })
  } catch (error) {
    const status = Number(error?.response?.status || 0)
    if (status !== 404) {
      console.warn('aippt history get failed:', error)
    }
    return null
  }
}

export function deletePptGenerationRecord(id, options = {}) {
  if (!id) {
    return false
  }
  const sid = String(id)
  const records = readRawRecords()
  const next = records.filter(item => item.id !== sid)
  if (next.length === records.length) {
    return false
  }
  writeRawRecords(next)
  if (options.syncRemote !== false) {
    scheduleRemoteDelete(sid)
  }
  return true
}

export function upsertPptGenerationRecord(patch, options = {}) {
  if (!patch || !patch.id) {
    throw new Error('upsertPptGenerationRecord requires id')
  }
  const sid = String(patch.id)
  const now = nowIso()
  const records = readRawRecords()
  const idx = records.findIndex(item => item.id === sid)
  const base = idx >= 0 ? records[idx] : { id: sid, createdAt: now }
  const next = normalizeRecord({
    ...base,
    ...patch,
    id: sid,
    createdAt: base.createdAt || patch.createdAt || now,
    updatedAt: patch.updatedAt || now,
  })

  if (idx >= 0) {
    records[idx] = next
  } else {
    records.unshift(next)
  }

  const trimmed = sortRecords(records).slice(0, MAX_RECORDS)
  writeRawRecords(trimmed)
  if (options.syncRemote !== false) {
    scheduleRemoteUpsert(next)
  }
  return next
}

export function createPptGenerationRecord({ topic, outline, templateId }, options = {}) {
  const now = nowIso()
  const record = {
    id: createRecordId(),
    recordId: '',
    topic: topic || '',
    outline: outline || '',
    templateId: templateId || '',
    status: 'pending',
    progressText: '等待开始生成',
    pptId: '',
    pptxProperty: '',
    slideCount: 0,
    errorMessage: '',
    timestamp: Date.now(),
    createdAt: now,
    updatedAt: now,
  }
  return upsertPptGenerationRecord(record, options)
}
