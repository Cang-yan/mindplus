<template>
  <div class="literature-vue-workspace">
    <aside
      ref="controlPanelRef"
      class="control-panel"
      :class="{ active: currentPanel === 'settings' }"
    >
      <div class="panel-header">
        <h2>文献智能翻译工作区</h2>
        <p>支持 OCR、翻译、结果导出。</p>
      </div>

      <div class="form-group">
        <label>翻译模型</label>
        <select v-model="form.translationModel">
          <option value="lingine_en">LINGINE EN</option>
          <option value="none">仅 OCR，不翻译</option>
        </select>
      </div>

      <div class="form-group">
        <label>目标语言</label>
        <input
          v-model="form.targetLanguage"
          type="text"
          placeholder="例如：中文、English、日本語"
        >
      </div>

      <div class="form-group">
        <label>处理PDF前 n 页</label>
        <input
          v-model.number="form.maxPages"
          type="number"
          min="1"
          max="200"
        >
      </div>

      <div class="panel-actions">
        <button
          type="button"
          class="btn primary"
          :disabled="isProcessing || fileItems.length === 0"
          @click="processAll"
        >
          {{ isProcessing ? '处理中...' : '开始处理' }}
        </button>
        <p v-if="fileItems.length" class="billing-estimate-tip">
          此次调用预估扣除 {{ estimatedProcessCreditsText }} credits
          <span class="billing-estimate-pages">（按 {{ estimatedPageCount }} 页估算）</span>
        </p>
        <p v-else class="billing-estimate-tip muted">上传文件后可查看预估扣费</p>
      </div>

      <section
        ref="historySectionRef"
        class="history-section"
        :class="{ active: currentPanel === 'history' }"
      >
        <div class="history-header">
          <h3>历史记录</h3>
          <button type="button" class="link-btn" @click="refreshHistoryWorks">刷新</button>
        </div>
        <div v-if="historyLoading" class="history-empty">正在加载历史记录...</div>
        <ul v-else-if="historyWorks.length" class="history-list">
          <li
            v-for="work in historyWorks"
            :key="work.id"
            class="history-item"
            @click="openHistoryDetail(work.recordId)"
          >
            <div class="history-title">{{ work.title }}</div>
            <div class="history-time">{{ formatTimestamp(work.timestamp) }}</div>
          </li>
        </ul>
        <div v-else class="history-empty">暂无翻译历史记录</div>
      </section>
    </aside>

    <main class="workspace-main">
      <section
        class="upload-zone"
        :class="{ dragging: isDragging }"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInputRef"
          class="hidden-input"
          type="file"
          accept=".pdf,application/pdf"
          @change="onPickFiles"
        >
        <h3>拖拽单个文件到这里，或点击选择文件</h3>
        <p>当前支持：PDF（一次仅处理一个文件）</p>
        <button type="button" class="btn primary" @click="triggerPickFiles">选择文件</button>
      </section>

      <section class="file-section">
        <div class="file-header">
          <h3>已上传文件</h3>
          <button type="button" class="link-btn" @click="clearFiles">清空</button>
        </div>
        <div v-if="fileItems.length === 0" class="file-empty">还没有上传文件</div>
        <ul v-else class="file-list">
          <li v-for="item in fileItems" :key="item.id" class="file-item">
            <div class="file-main">
              <div class="file-name">{{ item.file.name }}</div>
              <div class="file-meta">
                <span>{{ formatSize(item.file.size) }}</span>
                <span>{{ statusText(item.status) }}</span>
              </div>
            </div>
            <div class="file-actions">
              <button
                v-if="item.status === 'paused'"
                type="button"
                class="link-btn"
                :disabled="isProcessing"
                @click="continueProcessing"
              >
                继续处理
              </button>
              <button
                type="button"
                class="link-btn"
                :disabled="item.status !== 'done'"
                @click="openCompareReader(item.recordId, item.file.name)"
              >
                在线对比阅读
              </button>
              <button
                type="button"
                class="link-btn"
                :disabled="!item.translationText && !item.ocrText"
                @click="downloadResult(item, 'translation')"
              >
                下载译文
              </button>
              <button
                type="button"
                class="link-btn"
                :disabled="!item.ocrText"
                @click="downloadResult(item, 'ocr')"
              >
                下载原文
              </button>
              <button type="button" class="link-btn danger" @click="removeFile(item.id)">移除</button>
            </div>
            <div v-if="item.error" class="file-error">{{ item.error }}</div>
          </li>
        </ul>
      </section>

      <section class="log-section">
        <div class="file-header">
          <h3>处理进度</h3>
          <span class="progress-percent">{{ processingProgress }}%</span>
        </div>
        <div class="progress-track" role="progressbar" :aria-valuenow="processingProgress" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill" :style="{ width: `${processingProgress}%` }"></div>
        </div>
        <p class="progress-status">{{ processingStatusText }}</p>
        <p class="progress-save-text">{{ progressSavedText }}</p>
        <p class="progress-tip">提示：上传文件后请点击“开始处理”，可点击“停止”暂存进度，稍后点击“继续”恢复。</p>
        <div class="progress-actions">
          <button
            type="button"
            class="btn secondary progress-btn"
            :disabled="!isProcessing || stopRequested"
            @click="stopProcessing"
          >
            {{ stopRequested ? '停止中...' : '停止' }}
          </button>
          <button
            type="button"
            class="btn secondary progress-btn"
            :disabled="isProcessing || !canContinueProcessing"
            @click="continueProcessing"
          >
            继续
          </button>
        </div>
      </section>
    </main>

    <div
      v-if="historyDetailVisible"
      class="history-detail-mask"
      @click.self="closeHistoryDetail"
    >
      <section class="history-detail-panel">
        <div class="history-detail-header">
          <div>
            <h3>{{ historyDetail?.title || '历史详情' }}</h3>
            <p>{{ historyDetail?.subtitle || '文献智能翻译结果详情' }}</p>
          </div>
          <button type="button" class="btn secondary close-btn" @click="closeHistoryDetail">
            关闭
          </button>
        </div>

        <div v-if="historyDetailLoading" class="history-detail-empty">
          正在加载详情...
        </div>
        <div v-else-if="historyDetailError" class="history-detail-empty error">
          {{ historyDetailError }}
        </div>
        <div v-else-if="historyDetail" class="history-detail-body">
          <div class="history-detail-meta">
            <span>文件：{{ historyDetail.fileName || '-' }}</span>
            <span>时间：{{ formatTimestamp(historyDetail.timestamp) }}</span>
            <span>语言：{{ historyDetail.targetLanguage || '-' }}</span>
            <span>模型：{{ historyDetail.translationModelName || '-' }}</span>
          </div>

          <div class="history-detail-actions">
            <button
              type="button"
              class="link-btn"
              :disabled="!historyDetail.recordId"
              @click="openCompareReader(historyDetail.recordId, historyDetail.fileName)"
            >
              在线对比阅读
            </button>
            <button
              type="button"
              class="link-btn"
              :disabled="!historyDetail.translation && !historyDetail.ocr"
              @click="downloadHistoryDetail('translation')"
            >
              下载译文
            </button>
            <button
              type="button"
              class="link-btn"
              :disabled="!historyDetail.ocr"
              @click="downloadHistoryDetail('ocr')"
            >
              下载原文
            </button>
          </div>

          <div class="history-text-grid">
            <article class="history-text-panel">
              <h4>原文</h4>
              <div class="history-markdown markdown-body" v-html="historyOriginalHtml"></div>
            </article>
            <article class="history-text-panel">
              <h4>译文</h4>
              <div class="history-markdown markdown-body" v-html="historyTranslationHtml"></div>
            </article>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Message } from '@arco-design/web-vue'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import {
  deleteLiteratureResult,
  getLiteratureResult,
  listLiteratureHistory,
  ocrLiteratureDocument,
  translateLiteratureDocument,
  type LiteratureHistoryItem,
  type LiteratureResultItem,
} from '@/api/literature'
import { saveLiteratureResultRecord } from '@/services/literature-storage'
import {
  alignLiteraturePagesToReference,
  buildLiteratureMarkdownFromPages,
  normalizeLiteratureMarkdown,
  splitLiteratureMarkdownPages,
} from '@/utils/literature-markdown'
import {
  estimateLiteratureWorkflowCredits,
  formatCreditsForDisplay,
} from '@/utils/billing-estimate'

type FileStatus = 'pending' | 'processing' | 'paused' | 'done' | 'error'
type ProcessingStage = 'pending' | 'ocr' | 'translate' | 'done' | 'error'

interface WorkspaceFileItem {
  id: string
  recordId: string
  file: File
  extension: string
  status: FileStatus
  stage: ProcessingStage
  error: string
  ocrText: string
  translationText: string
  ocrChunks: string[]
  translatedChunks: string[]
  detectedPdfPages: number
  processedPages: number
  totalPages: number
}

const route = useRoute()
const router = useRouter()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isProcessing = ref(false)
const stopRequested = ref(false)
const isLeavingWorkspace = ref(false)
const processingProgress = ref(0)
const processingStatusText = ref('请选择文件后开始处理')
const progressSavedAt = ref(0)
const fileItems = ref<WorkspaceFileItem[]>([])

const historyLoading = ref(false)
const historyWorks = ref<LiteratureHistoryItem[]>([])
const controlPanelRef = ref<HTMLElement | null>(null)
const historySectionRef = ref<HTMLElement | null>(null)
const lastRouteIntentKey = ref('')

const currentPanel = computed(() => String(route.query?.panel || '').trim().toLowerCase())

interface HistoryDetailView {
  recordId: string
  title: string
  subtitle: string
  fileName: string
  targetLanguage: string
  translationModelName: string
  timestamp: number
  updatedAt: string
  translation: string
  ocr: string
  result: Record<string, any> | null
}

const historyDetailVisible = ref(false)
const historyDetailLoading = ref(false)
const historyDetailError = ref('')
const historyDetail = ref<HistoryDetailView | null>(null)

const form = reactive({
  translationModel: 'lingine_en',
  targetLanguage: '中文',
  systemPrompt: '',
  maxPages: 50,
})

const ALLOWED_FILE_EXTENSIONS = new Set(['pdf'])

// 固定策略：单文件、单并发、失败即结束（无重试）
const FIXED_MAX_ATTEMPTS = 1

const PDF_JS_SRC = 'https://gcore.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
const PDF_JS_WORKER_SRC = 'https://gcore.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
const OCR_PDF_CHUNK_SIZE = 2
const OCR_PROGRESS_WEIGHT_WITH_TRANSLATION = 0.9

let pdfJsReadyPromise: Promise<any> | null = null

class ProcessingPausedError extends Error {
  constructor(message = '处理已停止') {
    super(message)
    this.name = 'ProcessingPausedError'
  }
}

class TranslationQuotaExceededError extends Error {
  constructor(message = '翻译额度不足') {
    super(message)
    this.name = 'TranslationQuotaExceededError'
  }
}

function isTranslationQuotaExceededMessage(message: string) {
  const text = String(message || '').trim().toLowerCase()
  if (!text) return false
  return (
    text.includes('quota exceeded')
    || text.includes('insufficient_quota')
    || text.includes('insufficient quota')
    || text.includes('额度不足')
    || text.includes('配额不足')
    || text.includes('余额不足')
  )
}

const canContinueProcessing = computed(() => {
  const current = fileItems.value[0]
  if (!current) return false
  return current.status === 'paused'
})

const progressSavedText = computed(() => {
  if (!progressSavedAt.value) return '进度尚未记录'
  return `进度已记录：${new Date(progressSavedAt.value).toLocaleString()}`
})
const estimatedPageCount = computed(() => getEstimatedSourcePageCount(getCurrentFileItem()))
const estimatedProcessCredits = computed(() =>
  estimateLiteratureWorkflowCredits(
    estimatedPageCount.value,
    form.translationModel !== 'none'
  )
)
const estimatedProcessCreditsText = computed(() =>
  formatCreditsForDisplay(estimatedProcessCredits.value)
)

function setProcessingProgress(percent: number, statusText: string) {
  const safePercent = Number.isFinite(percent) ? Math.round(percent) : 0
  processingProgress.value = Math.max(0, Math.min(100, safePercent))
  processingStatusText.value = String(statusText || '').trim() || '处理中...'
}

function markProgressSaved() {
  progressSavedAt.value = Date.now()
}

function getCurrentFileItem() {
  return fileItems.value[0] || null
}

function getEstimatedSourcePageCount(item: WorkspaceFileItem | null) {
  if (!item) return 0

  const extension = item.extension || getFileExtension(item.file.name)
  if (extension !== 'pdf') {
    return 1
  }

  const maxPages = Math.max(1, Number(form.maxPages || 1))
  const detectedPages = Math.max(0, Number(item.detectedPdfPages || item.totalPages || 0))
  if (detectedPages > 0) {
    return Math.min(maxPages, detectedPages)
  }
  return maxPages
}

function ensureNotStopped() {
  if (stopRequested.value) {
    throw new ProcessingPausedError('用户已停止，等待继续')
  }
}

function buildRecordId(file: File) {
  return `${file.name}_${file.size}_${file.lastModified}`
}

function buildProcessingSubtitle(item: WorkspaceFileItem) {
  const segments = [
    `状态：${statusText(item.status)}`,
    `进度：${processingProgress.value}%`,
  ]
  if (item.totalPages > 0) {
    segments.push(`页数：${Math.min(item.processedPages, item.totalPages)}/${item.totalPages}`)
  }
  if (form.targetLanguage) {
    segments.push(`目标语言：${form.targetLanguage}`)
  }
  return segments.join(' | ')
}

function createPersistRecord(item: WorkspaceFileItem) {
  return {
    id: item.recordId,
    name: item.file.name,
    size: item.file.size,
    time: Date.now(),
    ocr: item.ocrText,
    translation: item.translationText,
    images: [],
    ocrChunks: [...item.ocrChunks],
    translatedChunks: item.translatedChunks.length > 0
      ? [...item.translatedChunks]
      : (item.translationText ? splitLiteratureMarkdownPages(item.translationText) : []),
    fileType: item.extension || 'txt',
    targetLanguage: form.targetLanguage || '中文',
    translationModelName: form.translationModel,
    translationModelCustomName: form.translationModel === 'lingine_en' ? 'LINGINE EN' : null,
    translationModelId: null,
    relativePath: item.file.name,
    sourceArchive: null,
    originalContent: item.extension === 'pdf' ? null : (item.ocrText || null),
    originalEncoding: item.extension === 'pdf' ? null : 'text',
    originalBinary: null,
    originalExtension: item.extension,
    customSubtitle: buildProcessingSubtitle(item),
    processingStatus: item.status,
    processingStage: item.stage,
    processingProgress: processingProgress.value,
    processingStatusText: processingStatusText.value,
    processedPages: item.processedPages,
    totalPages: item.totalPages,
    lastError: item.error || null,
  } as const
}

async function persistProcessingRecord(item: WorkspaceFileItem, syncHistory = false) {
  if (isLeavingWorkspace.value) return
  await saveLiteratureResultRecord(createPersistRecord(item))
  markProgressSaved()
  if (syncHistory) {
    await refreshHistoryWorks()
  }
}

function renderMarkdownHtml(raw: unknown, fallbackText: string) {
  const text = normalizeLiteratureMarkdown(raw)
  const markdown = text || `> ${fallbackText}`
  return marked.parse(markdown, { gfm: true, breaks: true }) as string
}

const historyOriginalHtml = computed(() => renderMarkdownHtml(historyDetail.value?.ocr, '无原文内容'))
const historyTranslationHtml = computed(() => renderMarkdownHtml(historyDetail.value?.translation, '未生成译文'))

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatTimestamp(ts: number) {
  if (!ts) return '刚刚'
  return new Date(ts).toLocaleString()
}

function statusText(status: FileStatus) {
  if (status === 'pending') return '待处理'
  if (status === 'processing') return '处理中'
  if (status === 'paused') return '已暂停'
  if (status === 'done') return '已完成'
  return '失败'
}

function normalizeQueryText(value: unknown) {
  return String(value ?? '').trim()
}

function buildRouteIntentKey() {
  const panel = normalizeQueryText(route.query?.panel).toLowerCase()
  const recordId = normalizeQueryText(route.query?.recordId)
  const openDetail = normalizeQueryText(route.query?.openDetail) === '1' ? '1' : '0'
  return `${panel}|${recordId}|${openDetail}`
}

function triggerPickFiles() {
  fileInputRef.value?.click()
}

async function removeResultRecord(recordId: string) {
  const safeRecordId = String(recordId || '').trim()
  if (!safeRecordId) return
  try {
    await deleteLiteratureResult(safeRecordId, 'translation')
  } catch (error) {
    console.error('delete translation result failed', error)
  }
}

function resetProcessingState(message = '请选择文件后开始处理') {
  stopRequested.value = false
  progressSavedAt.value = 0
  setProcessingProgress(0, message)
}

function hasUnfinishedFile() {
  const current = getCurrentFileItem()
  if (!current) return false
  return current.status !== 'done'
}

async function cleanupUnfinishedFilesBeforeLeave() {
  isLeavingWorkspace.value = true
  stopRequested.value = true
  const deletingItems = [...fileItems.value]
  fileItems.value = []
  await Promise.all(deletingItems.map((item) => removeResultRecord(item.recordId)))
  await refreshHistoryWorks()
  resetProcessingState()
}

async function clearFiles() {
  if (isProcessing.value) {
    Message.warning('请先停止当前处理任务，再执行清空')
    return
  }

  const toDelete = [...fileItems.value]
  fileItems.value = []
  await Promise.all(toDelete.map((item) => removeResultRecord(item.recordId)))
  await refreshHistoryWorks()
  resetProcessingState()
}

async function removeFile(id: string) {
  const item = fileItems.value.find((entry) => entry.id === id)
  if (!item) return

  if (isProcessing.value) {
    Message.warning('请先停止当前处理任务，再移除文件')
    return
  }

  await removeResultRecord(item.recordId)
  item.ocrText = ''
  item.translationText = ''
  item.ocrChunks = []
  item.translatedChunks = []
  item.processedPages = 0
  item.totalPages = 0
  item.error = ''

  fileItems.value = fileItems.value.filter(entry => entry.id !== id)
  if (historyDetailVisible.value && historyDetail.value?.recordId === item.recordId) {
    closeHistoryDetail()
  }
  await refreshHistoryWorks()
  if (fileItems.value.length === 0) {
    resetProcessingState()
  }
}

function createFileItem(file: File): WorkspaceFileItem {
  return {
    id: `${file.name}_${file.size}_${file.lastModified}_${Math.random().toString(36).slice(2, 8)}`,
    recordId: buildRecordId(file),
    file,
    extension: getFileExtension(file.name),
    status: 'pending',
    stage: 'pending',
    error: '',
    ocrText: '',
    translationText: '',
    ocrChunks: [],
    translatedChunks: [],
    detectedPdfPages: 0,
    processedPages: 0,
    totalPages: 0,
  }
}

async function addFiles(files: FileList | File[]) {
  const next = Array.from(files || [])
  if (!next.length) return

  const supportedFiles = next.filter((file) => ALLOWED_FILE_EXTENSIONS.has(getFileExtension(file.name)))
  if (!supportedFiles.length) {
    Message.error('仅支持 PDF 文件')
    return
  }

  const firstFile = supportedFiles[0]
  if (!firstFile) return

  if (supportedFiles.length !== next.length) {
    Message.warning('已忽略不支持的文件，仅保留 PDF')
  }

  if (supportedFiles.length > 1) {
    Message.warning('文献智能翻译一次仅支持一个文件，已自动选择第一个文件')
  } else if (fileItems.value.length > 0) {
    Message.info('已替换当前已上传文件')
  }

  if (isProcessing.value) {
    Message.warning('请先停止当前处理任务，再替换文件')
    return
  }

  const previousItems = [...fileItems.value]
  if (previousItems.length) {
    await Promise.all(previousItems.map((item) => removeResultRecord(item.recordId)))
    await refreshHistoryWorks()
  }

  const item = createFileItem(firstFile)
  fileItems.value = [item]
  resetProcessingState(`已上传文件：${firstFile.name}，请点击“开始处理”`)
  await hydrateEstimatedPageCount(item)
  const extension = item.extension || getFileExtension(item.file.name)
  if (extension === 'pdf') {
    const detectedPages = Math.max(1, Number(item.detectedPdfPages || item.totalPages || 0))
    if (detectedPages > 0) {
      form.maxPages = detectedPages
    }
  } else {
    form.maxPages = 1
  }
  const estimatedPages = getEstimatedSourcePageCount(item)
  if (estimatedPages > 0) {
    setProcessingProgress(0, `已上传文件：${firstFile.name}，预计处理 ${estimatedPages} 页，请点击“开始处理”`)
  }
}

async function onPickFiles(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files) return
  await addFiles(target.files)
  target.value = ''
}

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

async function onDrop(event: DragEvent) {
  isDragging.value = false
  if (!event.dataTransfer?.files?.length) return
  await addFiles(event.dataTransfer.files)
}

function getFileExtension(fileName: string) {
  const idx = fileName.lastIndexOf('.')
  if (idx < 0) return ''
  return fileName.slice(idx + 1).toLowerCase()
}

function sanitizeWordText(raw: string) {
  return String(raw || '')
    .replace(/\u0000/g, '')
    .replace(/\u0007/g, '')
    .replace(/\u000b/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractDocxText(file: File) {
  const JSZipModule = await import('jszip')
  const JSZip = (JSZipModule as any)?.default || JSZipModule
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const documentXmlFile = zip.file('word/document.xml')
  if (!documentXmlFile) {
    throw new Error('DOCX 解析失败：缺少 word/document.xml')
  }

  const xml = await documentXmlFile.async('string')
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xml, 'application/xml')
  if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('DOCX 解析失败：XML 内容无效')
  }

  const paragraphNodes = Array.from(xmlDoc.getElementsByTagName('w:p'))
  const paragraphs = paragraphNodes.map((paragraphNode) => {
    const fragments: string[] = []
    const walker = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const nodeName = (node as Element).nodeName
        if (nodeName === 'w:t') {
          fragments.push((node.textContent || '').replace(/\u00a0/g, ' '))
        } else if (nodeName === 'w:tab') {
          fragments.push('\t')
        } else if (nodeName === 'w:br' || nodeName === 'w:cr') {
          fragments.push('\n')
        }
      }
      Array.from(node.childNodes || []).forEach((child) => walker(child))
    }
    walker(paragraphNode)
    return fragments.join('')
  })

  const text = sanitizeWordText(paragraphs.join('\n'))
  if (!text) {
    throw new Error('DOCX 内容为空，无法继续处理')
  }
  return text
}

async function extractDocText(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const rawText = decoder.decode(new Uint8Array(arrayBuffer))
  const text = sanitizeWordText(
    rawText.replace(/[^\n\r\t\u0020-\u007e\u00a0-\u024f\u2e80-\u9fff]/g, '')
  )

  if (!text || text.length < 8) {
    throw new Error('DOC 内容解析失败，请优先上传 DOCX 或 PDF')
  }
  return text
}

async function openCompareReader(recordId: string, fileName = '') {
  const safeRecordId = String(recordId || '').trim()
  if (!safeRecordId) {
    Message.warning('未找到可用的对比阅读记录')
    return
  }
  const safeTitle = String(fileName || '').trim()
  await router.push({
    name: 'LiteratureCompare',
    query: {
      recordId: safeRecordId,
      title: safeTitle,
    },
  })
}

function loadScriptOnce(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existed = document.querySelector(`script[data-src="${src}"]`) as HTMLScriptElement | null
    if (existed?.dataset.loaded === '1') {
      resolve()
      return
    }
    if (existed) {
      existed.addEventListener('load', () => resolve(), { once: true })
      existed.addEventListener('error', () => reject(new Error(`加载脚本失败: ${src}`)), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.src = src
    script.addEventListener('load', () => {
      script.dataset.loaded = '1'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error(`加载脚本失败: ${src}`)), { once: true })
    document.head.appendChild(script)
  })
}

async function ensurePdfJsLib() {
  if (pdfJsReadyPromise) return pdfJsReadyPromise
  pdfJsReadyPromise = (async () => {
    const anyWindow = window as any
    if (!anyWindow.pdfjsLib) {
      await loadScriptOnce(PDF_JS_SRC)
    }
    if (!anyWindow.pdfjsLib) {
      throw new Error('PDF.js 加载失败')
    }
    anyWindow.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_SRC
    return anyWindow.pdfjsLib
  })()
  return pdfJsReadyPromise
}

async function hydrateEstimatedPageCount(item: WorkspaceFileItem) {
  const extension = item.extension || getFileExtension(item.file.name)
  if (extension !== 'pdf') {
    item.detectedPdfPages = 1
    item.totalPages = 1
    return
  }

  let pdfDocument: any = null
  try {
    const pdfjsLib = await ensurePdfJsLib()
    const buffer = await item.file.arrayBuffer()
    pdfDocument = await pdfjsLib.getDocument({ data: buffer }).promise
    const pageCount = Math.max(1, Number(pdfDocument.numPages || 0))
    item.detectedPdfPages = pageCount
    if (item.totalPages <= 0) {
      item.totalPages = pageCount
    }
  } catch (error) {
    console.warn('detect pdf pages failed', error)
    item.detectedPdfPages = 0
  } finally {
    if (pdfDocument && typeof pdfDocument.destroy === 'function') {
      try {
        await pdfDocument.destroy()
      } catch {}
    }
  }
}

async function renderPdfPageRangeToImages(pdfDocument: any, startPage: number, endPage: number) {
  const images: string[] = []

  for (let pageNo = startPage; pageNo <= endPage; pageNo += 1) {
    const page = await pdfDocument.getPage(pageNo)
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法初始化 Canvas 上下文')
    await page.render({ canvasContext: context, viewport }).promise
    images.push(canvas.toDataURL('image/jpeg', 0.85))
  }
  return images
}

function calcOcrProgressPercent(processedPages: number, totalPages: number) {
  if (totalPages <= 0) return 0
  const progressRatio = Math.max(0, Math.min(1, processedPages / totalPages))
  const weight = form.translationModel === 'none' ? 1 : OCR_PROGRESS_WEIGHT_WITH_TRANSLATION
  return progressRatio * weight * 100
}

async function extractPdfMarkdownInChunks(item: WorkspaceFileItem, maxPages: number) {
  const pdfjsLib = await ensurePdfJsLib()
  const buffer = await item.file.arrayBuffer()
  const pdfDocument = await pdfjsLib.getDocument({ data: buffer }).promise
  const totalPages = Math.min(pdfDocument.numPages, Math.max(1, maxPages))
  const markdownChunks = Array.isArray(item.ocrChunks) ? [...item.ocrChunks] : []
  let processedPages = Math.max(0, Math.min(totalPages, Number(item.processedPages || 0)))
  item.totalPages = totalPages

  try {
    for (let startPage = processedPages + 1; startPage <= totalPages; startPage += OCR_PDF_CHUNK_SIZE) {
      ensureNotStopped()
      const endPage = Math.min(totalPages, startPage + OCR_PDF_CHUNK_SIZE - 1)
      const remainingPages = Math.max(0, totalPages - endPage)
      const statusText = `正在处理${startPage}-${endPage}页，还有${remainingPages}页等待处理`
      setProcessingProgress(calcOcrProgressPercent(processedPages, totalPages), statusText)

      const images = await renderPdfPageRangeToImages(pdfDocument, startPage, endPage)
      ensureNotStopped()
      const ocr = await ocrLiteratureDocument({
        images,
        fileName: item.file.name,
        pageOffset: startPage - 1,
      })
      if (!ocr.success) {
        throw new Error(ocr.error || 'OCR 处理失败')
      }

      const markdown = String(ocr.markdown || '').trim()
      if (markdown) {
        markdownChunks.push(markdown)
      }

      processedPages = endPage
      item.processedPages = processedPages
      item.ocrChunks = [...markdownChunks]
      item.ocrText = markdownChunks.join('\n\n')
      setProcessingProgress(calcOcrProgressPercent(processedPages, totalPages), statusText)
      await persistProcessingRecord(item)
    }
  } finally {
    if (pdfDocument && typeof pdfDocument.destroy === 'function') {
      try {
        await pdfDocument.destroy()
      } catch {}
    }
  }

  return markdownChunks.join('\n\n')
}

async function extractMarkdown(item: WorkspaceFileItem, extension: string) {
  if (extension === 'pdf') {
    return extractPdfMarkdownInChunks(item, Math.max(1, Number(form.maxPages || 1)))
  }

  if (item.ocrText) {
    return item.ocrText
  }

  throw new Error(`暂不支持该文件类型（.${extension || 'unknown'}），请上传 PDF`)
}

async function translateMarkdown(text: string) {
  if (form.translationModel === 'none') return ''
  ensureNotStopped()
  const defaultPrompt = [
    `你是一名专业翻译。将用户提供的文本翻译为${form.targetLanguage || '中文'}。`,
    '严格保留原有 Markdown 结构、公式和专业术语。',
    '如果输入包含形如 <!-- Page N --> 的分页注释，必须原样保留，不得翻译、删除或重排。',
    '只输出翻译结果，不要添加任何解释。',
  ].join('')

  const result = await translateLiteratureDocument({
    text,
    targetLang: form.targetLanguage || '中文',
    systemPrompt: form.systemPrompt.trim() || defaultPrompt,
  })
  ensureNotStopped()
  if (!result.success) {
    const message = String(result.error || '翻译失败')
    if (isTranslationQuotaExceededMessage(message)) {
      throw new TranslationQuotaExceededError(message)
    }
    throw new Error(message)
  }
  return String(result.result || '')
}

function alignTranslationResult(ocrMarkdown: string, translatedMarkdown: string) {
  const aligned = alignLiteraturePagesToReference(translatedMarkdown, ocrMarkdown)
  const pages = aligned.pages
  if (!pages.length) {
    return {
      text: '',
      chunks: [] as string[],
    }
  }

  return {
    text: pages.length > 1 ? buildLiteratureMarkdownFromPages(pages) : pages[0],
    chunks: pages,
  }
}

async function processOne(item: WorkspaceFileItem) {
  const extension = item.extension || getFileExtension(item.file.name)
  const pendingPdfPages = extension === 'pdf'
    && (item.totalPages <= 0 || item.processedPages < item.totalPages)
  item.extension = extension
  item.status = 'processing'
  item.error = ''
  item.stage = pendingPdfPages || !item.ocrText ? 'ocr' : 'translate'
  if (item.ocrText) {
    setProcessingProgress(Math.max(1, processingProgress.value), `继续处理文件：${item.file.name}`)
  } else {
    setProcessingProgress(0, `准备处理文件：${item.file.name}`)
  }
  await persistProcessingRecord(item)

  const markdown = await extractMarkdown(item, extension)
  item.ocrText = markdown
  if (!item.ocrChunks.length && markdown) {
    item.ocrChunks = [markdown]
  }
  if (extension !== 'pdf') {
    item.totalPages = item.totalPages || 1
    item.processedPages = markdown ? item.totalPages : 0
  }
  await persistProcessingRecord(item)

  if (form.translationModel === 'none') {
    setProcessingProgress(95, 'OCR 已完成，正在保存结果')
    item.translationText = ''
    item.translatedChunks = []
  } else {
    item.stage = 'translate'
    setProcessingProgress(Math.max(processingProgress.value, 90), 'OCR 已完成，正在翻译全文')
    await persistProcessingRecord(item)
    const translation = await translateMarkdown(markdown)
    const alignedTranslation = alignTranslationResult(markdown, translation)
    item.translationText = alignedTranslation.text
    item.translatedChunks = alignedTranslation.chunks
  }

  item.stage = 'done'
  item.status = 'done'
  setProcessingProgress(100, form.translationModel === 'none' ? 'OCR 已完成' : '处理完成')
  await persistProcessingRecord(item, true)
}

async function processOneWithRetry(item: WorkspaceFileItem) {
  const maxAttempts = FIXED_MAX_ATTEMPTS
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await processOne(item)
      item.error = ''
      return { success: true, paused: false }
    } catch (error: any) {
      if (error instanceof TranslationQuotaExceededError) {
        item.status = 'done'
        item.stage = 'done'
        item.error = ''
        item.translationText = ''
        item.translatedChunks = []
        setProcessingProgress(100, '翻译额度不足，已保留 OCR 结果')
        await persistProcessingRecord(item, true)
        return {
          success: true,
          paused: false,
          warning: '翻译额度不足，已保留 OCR 结果，可稍后重试翻译',
        }
      }

      if (error instanceof ProcessingPausedError) {
        item.status = 'paused'
        item.error = ''
        setProcessingProgress(Math.max(1, processingProgress.value), '处理已停止，可点击继续')
        await persistProcessingRecord(item, true)
        return { success: false, paused: true }
      }

      const message = error?.message || '未知错误'
      if (attempt < maxAttempts) {
        setProcessingProgress(Math.max(1, processingProgress.value), `处理失败：${message}，准备重试`)
        continue
      }
      item.status = 'error'
      item.stage = 'error'
      item.error = message
      setProcessingProgress(Math.max(1, processingProgress.value), `处理失败：${message}`)
      await persistProcessingRecord(item, true)
      return { success: false, paused: false }
    }
  }

  return { success: false, paused: false }
}

async function processAll() {
  if (isProcessing.value || fileItems.value.length === 0) return
  const item = fileItems.value[0]
  if (!item) return

  isProcessing.value = true
  stopRequested.value = false
  if (item.status === 'paused') {
    setProcessingProgress(Math.max(1, processingProgress.value), `继续处理文件：${item.file.name}`)
  } else {
    setProcessingProgress(Math.max(0, processingProgress.value), `开始处理文件：${item.file.name}`)
  }

  try {
    const result = await processOneWithRetry(item)
    if (result.success) {
      if (result.warning) {
        Message.warning(result.warning)
      } else {
        Message.success('处理完成')
      }
    } else if (result.paused) {
      Message.info('处理已停止')
    } else {
      Message.error('处理失败')
    }
  } finally {
    isProcessing.value = false
  }
}

function stopProcessing() {
  if (!isProcessing.value) return
  stopRequested.value = true
  setProcessingProgress(
    Math.max(1, processingProgress.value),
    '正在停止当前任务，请等待当前步骤完成...'
  )
}

async function continueProcessing() {
  if (isProcessing.value || !canContinueProcessing.value) return
  await processAll()
}

function downloadResult(item: WorkspaceFileItem, kind: 'translation' | 'ocr') {
  const rawText = kind === 'translation'
    ? (item.translationText || item.ocrText)
    : item.ocrText
  const text = normalizeLiteratureMarkdown(rawText)

  if (!text) {
    Message.warning('当前没有可下载内容')
    return
  }

  const suffix = kind === 'translation' ? 'translated' : 'ocr'
  const fileName = item.file.name.replace(/\.[^.]+$/, '')
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName}_${suffix}.md`
  link.click()
  URL.revokeObjectURL(url)
}

async function refreshHistoryWorks() {
  historyLoading.value = true
  try {
    const works = await listLiteratureHistory('translation')
    historyWorks.value = works.sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.error('load translation history failed', error)
    Message.error('加载翻译历史失败')
  } finally {
    historyLoading.value = false
  }
}

function normalizeDetailView(item: LiteratureResultItem): HistoryDetailView {
  const result = item.result && typeof item.result === 'object' ? item.result : null
  const translation = String(result?.translation || '')
  const ocr = String(result?.ocr || result?.originalContent || '')
  return {
    recordId: item.recordId,
    title: String(item.title || result?.name || '未命名记录'),
    subtitle: String(item.subtitle || ''),
    fileName: String(item.fileName || result?.name || item.recordId || 'result'),
    targetLanguage: String(item.targetLanguage || result?.targetLanguage || ''),
    translationModelName: String(item.translationModelName || result?.translationModelName || ''),
    timestamp: Number(item.timestamp || Date.now()),
    updatedAt: String(item.updatedAt || item.createdAt || ''),
    translation,
    ocr,
    result,
  }
}

async function openHistoryDetail(recordId: string) {
  const safeRecordId = String(recordId || '').trim()
  if (!safeRecordId) return

  historyDetailVisible.value = true
  historyDetailLoading.value = true
  historyDetailError.value = ''
  historyDetail.value = null

  try {
    const detail = await getLiteratureResult(safeRecordId, 'translation')
    if (!detail) {
      throw new Error('未找到对应历史记录')
    }
    historyDetail.value = normalizeDetailView(detail)
  } catch (error: any) {
    console.error('open translation history detail failed', error)
    historyDetailError.value = String(error?.message || '加载详情失败')
  } finally {
    historyDetailLoading.value = false
  }
}

function closeHistoryDetail() {
  historyDetailVisible.value = false
}

function downloadHistoryDetail(kind: 'translation' | 'ocr') {
  const detail = historyDetail.value
  if (!detail) return

  const rawText = kind === 'translation'
    ? (detail.translation || detail.ocr)
    : detail.ocr
  const text = normalizeLiteratureMarkdown(rawText)

  if (!text) {
    Message.warning('当前没有可下载内容')
    return
  }

  const suffix = kind === 'translation' ? 'translated' : 'ocr'
  const fileName = detail.fileName.replace(/\.[^.]+$/, '')
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName || detail.recordId}_${suffix}.md`
  link.click()
  URL.revokeObjectURL(url)
}

async function applyRouteIntent(force = false, skipHistoryReload = false) {
  const intentKey = buildRouteIntentKey()
  if (!force && intentKey === lastRouteIntentKey.value) return
  lastRouteIntentKey.value = intentKey

  const panel = normalizeQueryText(route.query?.panel).toLowerCase()
  const recordId = normalizeQueryText(route.query?.recordId)

  if (panel === 'history') {
    if (!skipHistoryReload) {
      await refreshHistoryWorks()
    }
    await nextTick()
    historySectionRef.value?.scrollIntoView({ block: 'start', behavior: force ? 'auto' : 'smooth' })
  } else if (panel === 'settings') {
    await nextTick()
    controlPanelRef.value?.scrollIntoView({ block: 'start', behavior: force ? 'auto' : 'smooth' })
  }

  if (recordId) {
    await openHistoryDetail(recordId)
    return
  }

  if (historyDetailVisible.value) {
    closeHistoryDetail()
  }
}

watch(
  () => route.fullPath,
  () => {
    void applyRouteIntent()
  }
)

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('pagehide', handlePageHide)
  await refreshHistoryWorks()
  await applyRouteIntent(true, true)
  setProcessingProgress(0, '请选择文件后开始处理')
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('pagehide', handlePageHide)
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnfinishedFile()) return
  event.preventDefault()
  event.returnValue = ''
}

function cleanupUnfinishedFilesByKeepalive() {
  if (!hasUnfinishedFile()) return
  const token = String(localStorage.getItem('jwt_token') || '').trim()
  const recordIds = fileItems.value
    .map((item) => String(item.recordId || '').trim())
    .filter(Boolean)
  if (!recordIds.length) return

  for (const recordId of recordIds) {
    const url = `/api/literature/results/${encodeURIComponent(recordId)}?sourceType=translation`
    void fetch(url, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      keepalive: true,
    }).catch(() => {})
  }
}

function handlePageHide() {
  if (isLeavingWorkspace.value) return
  cleanupUnfinishedFilesByKeepalive()
}

onBeforeRouteLeave(async () => {
  if (!hasUnfinishedFile()) {
    return true
  }
  const confirmed = window.confirm('进度将丢失，是否继续？')
  if (!confirmed) {
    return false
  }
  await cleanupUnfinishedFilesBeforeLeave()
  return true
})
</script>

<style scoped>
.literature-vue-workspace {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  height: 100%;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;
  background: #f8fafc;
}

.control-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
}

.control-panel.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.panel-header p {
  margin: 8px 0 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: #0f172a;
  box-sizing: border-box;
  background: #fff;
}

.form-group textarea {
  resize: vertical;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.panel-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.billing-estimate-tip {
  margin: 0;
  font-size: 12px;
  color: #1d4ed8;
  line-height: 1.5;
}

.billing-estimate-tip.muted {
  color: #64748b;
}

.billing-estimate-pages {
  color: #475569;
}

.btn {
  border: 0;
  border-radius: 8px;
  height: 36px;
  font-size: 13px;
  cursor: pointer;
}

.btn.primary {
  background: #2563eb;
  color: #fff;
}

.btn.primary:disabled {
  cursor: not-allowed;
  background: #94a3b8;
}

.btn.secondary {
  background: #e2e8f0;
  color: #0f172a;
}

.history-section {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
}

.history-section.active {
  border-top-color: #2563eb;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-header h3 {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
}

.history-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
}

.history-item:hover {
  border-color: #2563eb;
}

.history-title {
  font-size: 13px;
  color: #0f172a;
  font-weight: 600;
  line-height: 1.4;
}

.history-time {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.history-empty {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.workspace-main {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(230px, 1.2fr) minmax(120px, 0.55fr) auto;
  gap: 12px;
}

.upload-zone {
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  background: #fff;
  padding: 20px 18px;
  min-height: 230px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
}

.upload-zone.dragging {
  border-color: #2563eb;
  background: #eff6ff;
}

.upload-zone h3 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.upload-zone p {
  margin: 0 0 12px;
  font-size: 12px;
  color: #64748b;
}

.hidden-input {
  display: none;
}

.file-section,
.log-section {
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
}

.file-section {
  overflow: hidden;
  padding: 10px 12px;
}

.log-section {
  align-self: start;
  min-height: 172px;
  gap: 8px;
  padding: 10px 12px;
}

.file-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.file-header h3 {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
}

.file-empty {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.file-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

.file-item {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
}

.file-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.file-name {
  flex: 1;
  font-size: 13px;
  color: #0f172a;
  font-weight: 600;
  word-break: break-all;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}

.file-actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.link-btn {
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: #2563eb;
  font-size: 12px;
}

.link-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

.link-btn.danger {
  color: #dc2626;
}

.file-error {
  margin-top: 8px;
  font-size: 12px;
  color: #dc2626;
}

.progress-percent {
  font-size: 12px;
  color: #334155;
  font-weight: 600;
}

.progress-track {
  margin-top: 8px;
  height: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f1f5f9;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #2563eb 0%, #3b82f6 100%);
  transition: width 0.25s ease;
}

.progress-status {
  margin: 6px 0 0;
  font-size: 12px;
  color: #475569;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.progress-save-text {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.progress-tip {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}

.progress-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-btn {
  height: 32px;
  padding: 0 14px;
}

.history-detail-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(2, 6, 23, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.history-detail-panel {
  width: min(1200px, 100%);
  max-height: 90vh;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  gap: 12px;
}

.history-detail-header h3 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.history-detail-header p {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
}

.history-detail-body {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
}

.history-detail-empty {
  padding: 20px 16px;
  color: #475569;
  font-size: 13px;
}

.history-detail-empty.error {
  color: #dc2626;
}

.history-detail-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  color: #334155;
  font-size: 12px;
}

.history-detail-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.history-text-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.history-text-panel {
  min-height: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-text-panel h4 {
  margin: 0;
  font-size: 13px;
  color: #0f172a;
}

.history-markdown {
  margin: 0;
  flex: 1;
  overflow: auto;
  font-size: 12px;
  color: #1e293b;
  line-height: 1.55;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin-top: 1.1em;
  margin-bottom: 0.6em;
  color: #0f172a;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote) {
  margin-top: 0;
  margin-bottom: 0.7em;
}

.markdown-body :deep(pre) {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  overflow: auto;
}

.markdown-body :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1em;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #e2e8f0;
  padding: 6px 8px;
  text-align: left;
}

.close-btn {
  width: 68px;
  height: 32px;
}

@media (max-width: 1200px) {
  .literature-vue-workspace {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .workspace-main {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .control-panel {
    max-height: 420px;
    overflow: auto;
  }

  .history-text-grid,
  .history-detail-meta {
    grid-template-columns: 1fr;
  }
}
</style>
