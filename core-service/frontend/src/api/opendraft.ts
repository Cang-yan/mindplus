import { request } from '@/utils/req'
import { unwrapResponse } from '@/api/response'

export type OpenDraftJobStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
export type OpenDraftJobListStatus = OpenDraftJobStatus | 'all'
export type OpenDraftAcademicLevel = 'research_paper' | 'bachelor' | 'master' | 'phd'
export type OpenDraftCitationStyle = 'apa' | 'ieee' | 'chicago' | 'mla' | 'nalt'
export type OpenDraftOutputType = 'full' | 'expose'
export type OpenDraftDownloadFormat = 'pdf' | 'docx' | 'markdown'

const VALID_JOB_STATUS = new Set<OpenDraftJobStatus>(['queued', 'running', 'success', 'failed', 'cancelled'])
const VALID_PHASE_STATUS = new Set(['waiting', 'running', 'success', 'failed', 'cancelled'])

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return n
}

function normalizeJobStatus(value: unknown): OpenDraftJobStatus {
  const status = normalizeText(value).toLowerCase()
  if (VALID_JOB_STATUS.has(status as OpenDraftJobStatus)) {
    return status as OpenDraftJobStatus
  }
  return 'queued'
}

function toDateTime(value: unknown) {
  const text = normalizeText(value)
  if (!text) return ''
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export interface OpenDraftCreateJobPayload {
  topic: string
  level?: OpenDraftAcademicLevel
  style?: OpenDraftCitationStyle
  language?: string
  outputType?: OpenDraftOutputType
  blurb?: string
  author?: string
  institution?: string
  department?: string
  advisor?: string
  resumeFrom?: string
}

export interface OpenDraftJobSummary {
  id: string
  topic: string
  status: OpenDraftJobStatus
  level: OpenDraftAcademicLevel
  style: OpenDraftCitationStyle
  language: string
  outputType: OpenDraftOutputType
  progress: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface OpenDraftJobPhase {
  key: string
  label: string
  status: 'waiting' | 'running' | 'success' | 'failed' | 'cancelled'
}

export interface OpenDraftJobLog {
  id: string
  level: string
  eventType: string
  phase: string
  message: string
  ts: string
}

export interface OpenDraftJobFile {
  type: OpenDraftDownloadFormat | 'other'
  name: string
  path: string
  size: number
}

export interface OpenDraftJobDetail extends OpenDraftJobSummary {
  outputDir: string
  errorMessage: string
  cancelRequested: boolean
  phases: OpenDraftJobPhase[]
  logs: OpenDraftJobLog[]
  files: OpenDraftJobFile[]
  request: Record<string, any> | null
}

export interface OpenDraftJobStats {
  total: number
  queued: number
  running: number
  success: number
  failed: number
  cancelled: number
  avgDurationSec: number
  executorQueued?: number
  executorRunning?: number
  executorDone?: number
}

export interface OpenDraftJobListResult {
  items: OpenDraftJobSummary[]
  total: number
  page: number
  limit: number
}

export interface OpenDraftJobLogsResult {
  items: OpenDraftJobLog[]
  cursor: number
  nextCursor: number
  total: number
}

function normalizeJobSummary(raw: any): OpenDraftJobSummary {
  const id = normalizeText(raw?.id)
  return {
    id,
    topic: normalizeText(raw?.topic) || '未命名任务',
    status: normalizeJobStatus(raw?.status),
    level: (normalizeText(raw?.level) || 'master') as OpenDraftAcademicLevel,
    style: (normalizeText(raw?.style) || 'apa') as OpenDraftCitationStyle,
    language: normalizeText(raw?.language) || 'en',
    outputType: (normalizeText(raw?.outputType) || 'full') as OpenDraftOutputType,
    progress: Math.max(0, Math.min(100, Math.floor(toNumber(raw?.progress, 0)))),
    createdAt: toDateTime(raw?.createdAt),
    updatedAt: toDateTime(raw?.updatedAt),
    completedAt: toDateTime(raw?.completedAt) || '',
  }
}

function normalizePhase(raw: any): OpenDraftJobPhase | null {
  const key = normalizeText(raw?.key)
  if (!key) return null
  const statusRaw = normalizeText(raw?.status).toLowerCase()
  const status = VALID_PHASE_STATUS.has(statusRaw) ? statusRaw : 'waiting'
  return {
    key,
    label: normalizeText(raw?.label) || key,
    status: status as OpenDraftJobPhase['status'],
  }
}

function normalizeLog(raw: any): OpenDraftJobLog | null {
  const id = normalizeText(raw?.id)
  if (!id) return null
  return {
    id,
    level: normalizeText(raw?.level) || 'info',
    eventType: normalizeText(raw?.eventType) || 'info',
    phase: normalizeText(raw?.phase),
    message: normalizeText(raw?.message),
    ts: toDateTime(raw?.ts) || normalizeText(raw?.ts),
  }
}

function normalizeFile(raw: any): OpenDraftJobFile | null {
  const name = normalizeText(raw?.name)
  if (!name) return null
  const typeRaw = normalizeText(raw?.type).toLowerCase()
  const type = typeRaw === 'pdf' || typeRaw === 'docx' || typeRaw === 'markdown'
    ? typeRaw
    : 'other'
  return {
    type,
    name,
    path: normalizeText(raw?.path),
    size: Math.max(0, Math.floor(toNumber(raw?.size, 0))),
  }
}

function normalizeJobDetail(raw: any): OpenDraftJobDetail {
  const summary = normalizeJobSummary(raw || {})
  const phases = Array.isArray(raw?.phases)
    ? raw.phases.map(normalizePhase).filter(Boolean) as OpenDraftJobPhase[]
    : []
  const logs = Array.isArray(raw?.logs)
    ? raw.logs.map(normalizeLog).filter(Boolean) as OpenDraftJobLog[]
    : []
  const files = Array.isArray(raw?.files)
    ? raw.files.map(normalizeFile).filter(Boolean) as OpenDraftJobFile[]
    : []

  return {
    ...summary,
    outputDir: normalizeText(raw?.outputDir),
    errorMessage: normalizeText(raw?.errorMessage),
    cancelRequested: Boolean(raw?.cancelRequested),
    phases,
    logs,
    files,
    request: raw?.request && typeof raw.request === 'object' ? raw.request : null,
  }
}

export async function createOpenDraftJob(payload: OpenDraftCreateJobPayload) {
  const res = await request.post('/api/opendraft/jobs', payload)
  const wrapped = unwrapResponse<any>(res)
  const data = wrapped?.data || {}
  const jobId = normalizeText(data?.jobId || data?.id || data?.job?.id)
  return {
    jobId,
    job: data?.job ? normalizeJobSummary(data.job) : null,
  }
}

export async function listOpenDraftJobs(params?: {
  page?: number
  limit?: number
  status?: OpenDraftJobListStatus
}) {
  const res = await request.get('/api/opendraft/jobs', {
    params: {
      page: Math.max(1, Math.floor(toNumber(params?.page, 1))),
      limit: Math.min(200, Math.max(1, Math.floor(toNumber(params?.limit, 20)))),
      status: params?.status || 'all',
    },
  })
  const wrapped = unwrapResponse<any>(res)
  const data = wrapped?.data || {}
  const source = Array.isArray(data?.items)
    ? data.items
    : (Array.isArray(data?.jobs) ? data.jobs : [])

  const items = source
    .map(normalizeJobSummary)
    .filter(item => Boolean(item.id))

  return {
    items,
    total: Math.max(items.length, Math.floor(toNumber(data?.total, items.length))),
    page: Math.max(1, Math.floor(toNumber(data?.page, params?.page || 1))),
    limit: Math.max(1, Math.floor(toNumber(data?.limit, params?.limit || 20))),
  } as OpenDraftJobListResult
}

export async function getOpenDraftJobStats() {
  const res = await request.get('/api/opendraft/jobs/stats')
  const wrapped = unwrapResponse<any>(res)
  const data = wrapped?.data || {}
  return {
    total: Math.max(0, Math.floor(toNumber(data?.total, 0))),
    queued: Math.max(0, Math.floor(toNumber(data?.queued, 0))),
    running: Math.max(0, Math.floor(toNumber(data?.running, 0))),
    success: Math.max(0, Math.floor(toNumber(data?.success, 0))),
    failed: Math.max(0, Math.floor(toNumber(data?.failed, 0))),
    cancelled: Math.max(0, Math.floor(toNumber(data?.cancelled, 0))),
    avgDurationSec: Math.max(0, toNumber(data?.avgDurationSec, 0)),
    executorQueued: Math.max(0, Math.floor(toNumber(data?.executorQueued, 0))),
    executorRunning: Math.max(0, Math.floor(toNumber(data?.executorRunning, 0))),
    executorDone: Math.max(0, Math.floor(toNumber(data?.executorDone, 0))),
  } as OpenDraftJobStats
}

export async function getOpenDraftJob(jobId: string) {
  const safeJobId = normalizeText(jobId)
  if (!safeJobId) return null
  const res = await request.get(`/api/opendraft/jobs/${encodeURIComponent(safeJobId)}`)
  const wrapped = unwrapResponse<any>(res)
  const data = wrapped?.data || null
  if (!data || typeof data !== 'object') return null
  const normalized = normalizeJobDetail(data)
  return normalized.id ? normalized : null
}

export async function getOpenDraftJobLogs(jobId: string, params?: { cursor?: number, limit?: number }) {
  const safeJobId = normalizeText(jobId)
  if (!safeJobId) {
    return {
      items: [],
      cursor: 0,
      nextCursor: 0,
      total: 0,
    } as OpenDraftJobLogsResult
  }
  const res = await request.get(`/api/opendraft/jobs/${encodeURIComponent(safeJobId)}/logs`, {
    params: {
      cursor: Math.max(0, Math.floor(toNumber(params?.cursor, 0))),
      limit: Math.min(1000, Math.max(1, Math.floor(toNumber(params?.limit, 200)))),
    },
  })
  const wrapped = unwrapResponse<any>(res)
  const data = wrapped?.data || {}
  const source = Array.isArray(data?.items)
    ? data.items
    : (Array.isArray(data?.logs) ? data.logs : [])
  const items = source.map(normalizeLog).filter(Boolean) as OpenDraftJobLog[]
  return {
    items,
    cursor: Math.max(0, Math.floor(toNumber(data?.cursor, 0))),
    nextCursor: Math.max(0, Math.floor(toNumber(data?.nextCursor, items.length))),
    total: Math.max(items.length, Math.floor(toNumber(data?.total, items.length))),
  } as OpenDraftJobLogsResult
}

export async function getOpenDraftJobFiles(jobId: string) {
  const safeJobId = normalizeText(jobId)
  if (!safeJobId) return []
  const res = await request.get(`/api/opendraft/jobs/${encodeURIComponent(safeJobId)}/files`)
  const wrapped = unwrapResponse<any>(res)
  const data = wrapped?.data || {}
  const source = Array.isArray(data?.items)
    ? data.items
    : (Array.isArray(data?.files) ? data.files : [])
  return source.map(normalizeFile).filter(Boolean) as OpenDraftJobFile[]
}

export async function cancelOpenDraftJob(jobId: string) {
  const safeJobId = normalizeText(jobId)
  if (!safeJobId) return false
  const res = await request.post(`/api/opendraft/jobs/${encodeURIComponent(safeJobId)}/cancel`, {})
  const wrapped = unwrapResponse<any>(res)
  return Number(wrapped?.code || 0) === 200
}

export async function retryOpenDraftJob(jobId: string) {
  const safeJobId = normalizeText(jobId)
  if (!safeJobId) return { jobId: '', job: null as OpenDraftJobSummary | null }
  const res = await request.post(`/api/opendraft/jobs/${encodeURIComponent(safeJobId)}/retry`, {})
  const wrapped = unwrapResponse<any>(res)
  const data = wrapped?.data || {}
  const nextJobId = normalizeText(data?.jobId || data?.id || data?.job?.id)
  return {
    jobId: nextJobId,
    job: data?.job ? normalizeJobSummary(data.job) : null,
  }
}

export async function downloadOpenDraftJobFile(jobId: string, format: OpenDraftDownloadFormat) {
  const safeJobId = normalizeText(jobId)
  if (!safeJobId) throw new Error('jobId 不能为空')
  const data = await request.get(
    `/api/opendraft/jobs/${encodeURIComponent(safeJobId)}/download/${encodeURIComponent(format)}`,
    { responseType: 'blob' }
  )
  return data as Blob
}
