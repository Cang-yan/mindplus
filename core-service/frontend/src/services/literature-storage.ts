import { upsertLiteratureResult } from '@/api/literature'

export interface LiteratureLegacyResultRecord {
  id: string
  name: string
  size: number
  time: number
  ocr: string
  translation: string
  images: any[]
  ocrChunks: string[]
  translatedChunks: string[]
  fileType: string
  targetLanguage: string
  translationModelName: string
  translationModelCustomName: string | null
  translationModelId: string | null
  relativePath: string
  sourceArchive: string | null
  originalContent: string | null
  originalEncoding: string | null
  originalBinary: string | null
  originalExtension: string
  customSubtitle?: string
  processingStatus?: 'pending' | 'processing' | 'paused' | 'done' | 'error'
  processingStage?: string
  processingProgress?: number
  processingStatusText?: string
  processedPages?: number
  totalPages?: number
  lastError?: string | null
}

function buildSubtitle(record: LiteratureLegacyResultRecord) {
  if (record.customSubtitle) {
    return String(record.customSubtitle).trim()
  }

  const parts: string[] = []
  if (record.targetLanguage) parts.push(`目标语言：${record.targetLanguage}`)
  if (record.fileType) parts.push(`类型：${record.fileType.toUpperCase()}`)
  return parts.join(' | ')
}

export async function saveLiteratureResultRecord(record: LiteratureLegacyResultRecord) {
  const recordId = String(record?.id || '').trim()
  if (!recordId) {
    throw new Error('保存失败：recordId 不能为空')
  }

  await upsertLiteratureResult({
    id: `translation_${recordId}`,
    sourceType: 'translation',
    recordId,
    docId: recordId,
    title: String(record.name || record.relativePath || '未命名记录'),
    subtitle: buildSubtitle(record),
    timestamp: Number(record.time || Date.now()),
    fileName: record.name || '',
    fileSize: Number(record.size || 0),
    fileType: record.fileType || '',
    targetLanguage: record.targetLanguage || '',
    translationModelName: record.translationModelName || '',
    translationModelId: record.translationModelId,
    result: record as unknown as Record<string, any>,
  })
}
