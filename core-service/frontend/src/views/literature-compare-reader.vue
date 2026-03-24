<template>
  <main class="literature-compare-reader">
    <section class="compare-header">
      <div>
        <h2>{{ headerTitle }}</h2>
        <p>{{ headerSubtitle }}</p>
      </div>
      <div class="header-actions">
        <div class="page-controls">
          <button
            type="button"
            class="page-btn"
            :disabled="currentPage <= 1"
            @click="goToPreviousPage"
          >
            上一页
          </button>
          <span class="page-indicator">第 {{ currentPage }} / {{ pageCount }} 页</span>
          <button
            type="button"
            class="page-btn"
            :disabled="currentPage >= pageCount"
            @click="goToNextPage"
          >
            下一页
          </button>
          <div class="page-jump">
            <input
              v-model="jumpPageInput"
              type="number"
              class="page-input"
              :min="1"
              :max="pageCount"
              @keydown.enter.prevent="jumpToPage"
            >
            <button
              type="button"
              class="page-btn jump-btn"
              :disabled="pageCount <= 1"
              @click="jumpToPage"
            >
              跳转
            </button>
          </div>
        </div>
        <button type="button" class="link-btn" :disabled="!translationMarkdown.trim()" @click="downloadMarkdown('translation')">
          下载译文
        </button>
        <button type="button" class="link-btn" :disabled="!originalMarkdown.trim()" @click="downloadMarkdown('original')">
          下载原文
        </button>
        <button type="button" class="btn secondary" @click="goBackToWorkspace">
          返回翻译工作区
        </button>
      </div>
    </section>

    <section v-if="loading" class="state-block">
      正在加载对比内容...
    </section>

    <section v-else-if="errorText" class="state-block error">
      {{ errorText }}
    </section>

    <section v-else class="compare-grid">
      <article class="compare-panel">
        <header class="panel-header">
          <h3>原文</h3>
          <span class="panel-meta">共 {{ originalPageCount }} 页</span>
        </header>
        <div
          ref="leftPaneRef"
          class="panel-body markdown-body"
          @scroll="onPaneScroll('left')"
          v-html="originalHtml"
        ></div>
      </article>

      <article class="compare-panel">
        <header class="panel-header">
          <h3>译文</h3>
          <span class="panel-meta">共 {{ translationPageCount }} 页</span>
          <span v-if="translationAlignmentHint" class="panel-hint">{{ translationAlignmentHint }}</span>
        </header>
        <div
          ref="rightPaneRef"
          class="panel-body markdown-body"
          @scroll="onPaneScroll('right')"
          v-html="translationHtml"
        ></div>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import { getLiteratureResult } from '@/api/literature'
import {
  alignLiteraturePagesToReference,
  type LiteraturePageAlignMode,
  normalizeLiteratureMarkdown,
  normalizeLiteraturePagesFromChunks,
  normalizeLiteraturePageMarkdown,
  splitLiteratureMarkdownPages
} from '@/utils/literature-markdown'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const errorText = ref('')
const fileName = ref('')
const originalMarkdown = ref('')
const translationMarkdown = ref('')
const originalChunks = ref<unknown[]>([])
const translationChunks = ref<unknown[]>([])
const currentPage = ref(1)
const jumpPageInput = ref('1')

const leftPaneRef = ref<HTMLElement | null>(null)
const rightPaneRef = ref<HTMLElement | null>(null)
const scrollingLock = ref(false)

const recordId = computed(() => {
  const fromParams = String(route.params?.recordId || '').trim()
  if (fromParams) return fromParams
  return String(route.query?.recordId || '').trim()
})

const headerSubtitle = computed(() => {
  if (loading.value) return '正在读取文献内容'
  if (fileName.value) return `记录ID：${recordId.value || '-'}`
  if (recordId.value) return `记录ID：${recordId.value}`
  return '未指定记录'
})

const headerTitle = computed(() => {
  if (fileName.value) return fileName.value
  const fromQueryTitle = String(route.query?.title || '').trim()
  if (fromQueryTitle) return fromQueryTitle
  return recordId.value || '未命名文献'
})

const originalPages = computed(() => {
  const chunkPages = normalizeLiteraturePagesFromChunks(originalChunks.value)
  if (chunkPages.length > 0) {
    return chunkPages
  }
  return splitLiteratureMarkdownPages(originalMarkdown.value)
})

const translationAligned = computed(() => {
  const preferredPages = normalizeLiteraturePagesFromChunks(translationChunks.value)
  return alignLiteraturePagesToReference(
    translationMarkdown.value,
    originalPages.value,
    { preferredPages }
  )
})

const translationPages = computed(() => translationAligned.value.pages)

function mapAlignmentHint(mode: LiteraturePageAlignMode) {
  if (mode === 'heuristic') {
    return '译文缺少分页标记，已按原文页数自动对齐'
  }
  if (mode === 'resized') {
    return '译文分页与原文不一致，已自动合并对齐'
  }
  if (mode === 'preferred') {
    return '已根据历史分片对齐译文分页'
  }
  return ''
}

const translationAlignmentHint = computed(() => mapAlignmentHint(translationAligned.value.mode))

const originalPageCount = computed(() => originalPages.value.length)
const translationPageCount = computed(() => translationPages.value.length)
const pageCount = computed(() => Math.max(originalPageCount.value, translationPageCount.value, 1))

const originalPageMarkdown = computed(() => {
  const page = originalPages.value[currentPage.value - 1]
  if (page && page.trim()) return page
  if (!originalPages.value.length) return '> 无原文内容'
  return '> 该页无原文内容'
})

const translationPageMarkdown = computed(() => {
  const page = translationPages.value[currentPage.value - 1]
  if (page && page.trim()) return page
  if (!translationPages.value.length) return '> 未生成译文'
  return '> 该页无译文内容'
})

const originalHtml = computed(() => {
  const markdown = normalizeLiteraturePageMarkdown(originalPageMarkdown.value) || '> 无原文内容'
  return marked.parse(markdown, { gfm: true, breaks: true }) as string
})

const translationHtml = computed(() => {
  const markdown = normalizeLiteraturePageMarkdown(translationPageMarkdown.value) || '> 无译文内容'
  return marked.parse(markdown, { gfm: true, breaks: true }) as string
})

function goToPreviousPage() {
  if (currentPage.value <= 1) return
  currentPage.value -= 1
}

function goToNextPage() {
  if (currentPage.value >= pageCount.value) return
  currentPage.value += 1
}

function jumpToPage() {
  const parsed = Number.parseInt(String(jumpPageInput.value || '').trim(), 10)
  if (!Number.isFinite(parsed)) {
    jumpPageInput.value = String(currentPage.value)
    return
  }
  const target = Math.max(1, Math.min(pageCount.value, parsed))
  currentPage.value = target
  jumpPageInput.value = String(target)
}

function downloadMarkdown(kind: 'translation' | 'original') {
  const text = kind === 'translation'
    ? normalizeLiteratureMarkdown(translationMarkdown.value)
    : normalizeLiteratureMarkdown(originalMarkdown.value)

  if (!text) return

  const suffix = kind === 'translation' ? 'translated' : 'original'
  const nameBase = String(fileName.value || recordId.value || 'literature').replace(/\.[^.]+$/, '')
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${nameBase}_${suffix}.md`
  link.click()
  URL.revokeObjectURL(url)
}

function goBackToWorkspace() {
  router.push({
    name: 'LiteratureEmbed',
    query: { entry: 'translation' },
  })
}

function onPaneScroll(source: 'left' | 'right') {
  if (scrollingLock.value) return

  const sourcePane = source === 'left' ? leftPaneRef.value : rightPaneRef.value
  const targetPane = source === 'left' ? rightPaneRef.value : leftPaneRef.value
  if (!sourcePane || !targetPane) return

  const sourceScrollable = sourcePane.scrollHeight - sourcePane.clientHeight
  const targetScrollable = targetPane.scrollHeight - targetPane.clientHeight
  if (sourceScrollable <= 0 || targetScrollable <= 0) return

  const ratio = sourcePane.scrollTop / sourceScrollable
  scrollingLock.value = true
  targetPane.scrollTop = ratio * targetScrollable
  requestAnimationFrame(() => {
    scrollingLock.value = false
  })
}

async function loadRecord() {
  const safeRecordId = recordId.value
  if (!safeRecordId) {
    errorText.value = '缺少 recordId，无法加载对比内容'
    return
  }

  loading.value = true
  errorText.value = ''

  try {
    const detail = await getLiteratureResult(safeRecordId, 'translation')
    if (!detail) {
      throw new Error('未找到对应翻译记录')
    }

    const result = detail.result && typeof detail.result === 'object' ? detail.result : null
    originalMarkdown.value = String(result?.ocr || result?.originalContent || '')
    translationMarkdown.value = String(result?.translation || '')
    originalChunks.value = Array.isArray(result?.ocrChunks) ? result.ocrChunks : []
    translationChunks.value = Array.isArray(result?.translatedChunks) ? result.translatedChunks : []
    fileName.value = String(detail.fileName || result?.name || safeRecordId)
    currentPage.value = 1
    jumpPageInput.value = '1'
  } catch (error: any) {
    errorText.value = String(error?.message || '加载对比内容失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => recordId.value,
  () => {
    void loadRecord()
  },
  { immediate: true }
)

watch(
  () => pageCount.value,
  (count) => {
    if (currentPage.value > count) {
      currentPage.value = count
    }
    if (currentPage.value < 1) {
      currentPage.value = 1
    }
    jumpPageInput.value = String(currentPage.value)
  },
  { immediate: true }
)

watch(
  () => currentPage.value,
  async () => {
    await nextTick()
    scrollingLock.value = true
    if (leftPaneRef.value) leftPaneRef.value.scrollTop = 0
    if (rightPaneRef.value) rightPaneRef.value.scrollTop = 0
    jumpPageInput.value = String(currentPage.value)
    requestAnimationFrame(() => {
      scrollingLock.value = false
    })
  }
)
</script>

<style scoped>
.literature-compare-reader {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  padding: 12px;
  box-sizing: border-box;
  background: #f8fafc;
}

.compare-header {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.page-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f8fafc;
}

.page-btn {
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  background: #fff;
  color: #0f172a;
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
}

.page-btn:disabled {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

.page-indicator {
  min-width: 90px;
  text-align: center;
  font-size: 12px;
  color: #334155;
}

.page-jump {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 2px;
}

.page-input {
  width: 68px;
  height: 26px;
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  padding: 0 10px;
  box-sizing: border-box;
  font-size: 12px;
  color: #0f172a;
  outline: none;
  background: #fff;
}

.page-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.jump-btn {
  height: 26px;
}

.compare-header h2 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.compare-header p {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
  word-break: break-all;
}

.btn {
  border: 0;
  border-radius: 8px;
  height: 34px;
  padding: 0 14px;
  font-size: 12px;
  cursor: pointer;
}

.btn.secondary {
  background: #e2e8f0;
  color: #0f172a;
}

.link-btn {
  border: 0;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.link-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

.state-block {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 18px;
  color: #334155;
  font-size: 13px;
}

.state-block.error {
  color: #dc2626;
}

.compare-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.compare-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}

.panel-header {
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
}

.panel-meta {
  font-size: 12px;
  color: #64748b;
}

.panel-hint {
  font-size: 12px;
  color: #b45309;
}

.panel-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 12px;
  font-size: 13px;
  color: #1e293b;
  line-height: 1.65;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin-top: 1.2em;
  margin-bottom: 0.6em;
  color: #0f172a;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote) {
  margin-top: 0;
  margin-bottom: 0.8em;
}

.markdown-body :deep(pre) {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
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

@media (max-width: 1080px) {
  .compare-header {
    flex-direction: column;
  }

  .header-actions {
    justify-content: flex-start;
  }

  .compare-grid {
    grid-template-columns: 1fr;
  }
}
</style>
