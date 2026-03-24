<template>
  <main class="workspace-page">
    <section class="workspace-header">
      <div class="header-main">
        <h2>{{ record?.topic || 'PPT 生成工作区' }}</h2>
        <p>记录 ID：{{ record?.id || '-' }}</p>
      </div>
      <div class="header-actions">
        <a-select
          v-model="insertElementValue"
          class="header-select header-select-insert"
          size="mini"
          placeholder="插入元素"
          :disabled="!pptxObj || isGeneratingPpt"
          @change="handleInsertElement"
        >
          <a-option value="text,title1">插入大标题</a-option>
          <a-option value="text,title2">插入副标题</a-option>
          <a-option value="text,content">插入正文文本</a-option>
          <a-option value="image">插入图片</a-option>
          <a-option value="geometry">插入随机形状</a-option>
          <a-option value="table">插入表格</a-option>
          <a-option value="chart,bar">插入柱状图</a-option>
          <a-option value="chart,pie">插入饼图</a-option>
          <a-option value="chart,doughnut">插入环形图</a-option>
          <a-option value="chart,line">插入折线图</a-option>
        </a-select>

        <a-select
          v-model="downloadAnimationType"
          class="header-select header-select-download"
          size="mini"
          placeholder="下载选项"
          :disabled="isGeneratingPpt"
        >
          <a-option value="">默认</a-option>
          <a-option value="0">不添加动画</a-option>
          <a-option value="1">智能添加动画</a-option>
        </a-select>

        <div class="download-action">
          <a-button :loading="isDownloadingPpt" :disabled="!pptxObj || isGeneratingPpt" @click="handleDownloadPpt">
            渲染并下载
          </a-button>
          <span class="billing-estimate-tip">此次调用预估扣除 {{ estimatedDownloadCreditsText }} credits</span>
        </div>
      </div>
    </section>

    <section class="workspace-status">
      <span class="status-label">状态：</span>
      <span class="status-badge" :class="statusClass(record?.status)">{{ statusLabel(record?.status) }}</span>
      <span class="status-text">{{ progressText || '等待开始' }}</span>
      <span class="status-elapsed" v-if="isGeneratingPpt">耗时：{{ elapsedSeconds }}s</span>
      <span class="status-time">更新时间：{{ formatDateTime(record?.updatedAt) }}</span>
    </section>

    <section class="workspace-body">
      <aside class="thumbnail-list" ref="thumbnailListRef">
        <div
          v-for="(_, index) in previewPages"
          :key="`thumb-${index}`"
          class="thumb-item"
          :class="{ active: index === currentSlideIndex }"
          @click="selectSlide(index)"
        >
          <div class="thumb-index">{{ index + 1 }}</div>
          <canvas
            class="thumb-canvas"
            width="288"
            height="162"
            :ref="el => setThumbCanvasRef(index, el)"
          />
        </div>
        <div v-if="!previewPages.length" class="thumb-empty">暂无预览页</div>
      </aside>

      <section class="main-preview">
        <div class="preview-stage-area">
          <div class="preview-stage-wrap" ref="previewViewportRef">
            <div v-if="!previewPages.length" class="preview-empty">生成完成后将在这里显示主项目 PPT 预览</div>
            <svg v-else id="workspace_preview_svg" ref="previewSvgRef" />
          </div>
        </div>

        <div v-if="previewPages.length" class="page-switcher">
          <a-button size="mini" :disabled="currentSlideIndex <= 0" @click="stepSlide(-1)">
            &lt;
          </a-button>
          <span class="page-indicator">{{ currentSlideIndex + 1 }}/{{ previewPages.length }}</span>
          <a-button size="mini" :disabled="currentSlideIndex >= previewPages.length - 1" @click="stepSlide(1)">
            &gt;
          </a-button>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import {
  buildPptJsonApiUrl,
  decodePptxProperty,
  fetchAsyncPptInfo,
  generateContentStream,
  getAuthHeaders,
} from '@/api/main-ppt'
import { loadExternalScripts } from '@/utils/loadExternalScripts'
import {
  ensurePptGenerationRecord,
  getPptGenerationRecord,
  hydratePptGenerationRecords,
  upsertPptGenerationRecord,
} from '@/utils/ppt-generation-store'
import { chargeCredits, refundCredits } from '@/api/billing'
import { formatCreditsForDisplay, getBillingUnitPrice } from '@/utils/billing-estimate'

const route = useRoute()
const recordId = String(route.query.recordId || '')

const record = ref(null)
const progressText = ref('')
const isGeneratingPpt = ref(false)
const isDownloadingPpt = ref(false)
const elapsedSeconds = ref(0)

const insertElementValue = ref('')
const downloadAnimationType = ref('')

let contentStreamCancel = null
const latestPptId = ref('')
const isPullingAsyncInfo = ref(false)

const pptxObj = ref(null)
const currentSlideIndex = ref(0)

const previewSvgRef = ref(null)
const previewViewportRef = ref(null)
const thumbnailListRef = ref(null)
const thumbCanvasMap = ref({})

let painter = null
let resizeTimer = null
let scriptsReady = false
let generatingTimer = null
let rendererNodeIdSeed = 0

const previewPages = computed(() => {
  if (!pptxObj.value || !Array.isArray(pptxObj.value.pages)) {
    return []
  }
  return pptxObj.value.pages
})
const estimatedDownloadCreditsText = computed(() =>
  formatCreditsForDisplay(getBillingUnitPrice('aippt_json2ppt'))
)

function ensureRendererNodeIds(node, prefix = 'node') {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return
  }

  const hasChildren = Array.isArray(node.children)
  const shouldHaveId = hasChildren || !!node.type || !!node.extInfo || Object.prototype.hasOwnProperty.call(node, 'text')
  if (shouldHaveId && (node.id == null || String(node.id).trim() === '')) {
    rendererNodeIdSeed += 1
    node.id = `${prefix}_${rendererNodeIdSeed}`
  }

  if (hasChildren) {
    node.children.forEach((child, index) => {
      ensureRendererNodeIds(child, `${prefix}_c${index}`)
    })
  }
}

function normalizePptxForRenderer(rawPptx) {
  if (!rawPptx || !Array.isArray(rawPptx.pages)) {
    return rawPptx
  }
  rawPptx.pages.forEach((page, pageIndex) => {
    if (!Array.isArray(page?.children)) {
      return
    }
    page.children.forEach((child, childIndex) => {
      ensureRendererNodeIds(child, `p${pageIndex}_n${childIndex}`)
    })
  })
  return rawPptx
}

function statusLabel(status) {
  if (status === 'completed') return '已完成'
  if (status === 'generating') return '生成中'
  if (status === 'failed') return '失败'
  return '待生成'
}

function statusClass(status) {
  return `status-${status || 'pending'}`
}

function formatDateTime(input) {
  if (!input) {
    return '-'
  }
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
}

function startGeneratingTimer() {
  stopGeneratingTimer()
  elapsedSeconds.value = 0
  generatingTimer = setInterval(() => {
    elapsedSeconds.value += 1
  }, 1000)
}

function stopGeneratingTimer() {
  if (generatingTimer) {
    clearInterval(generatingTimer)
    generatingTimer = null
  }
}

function patchRecord(patch) {
  if (!recordId) {
    return
  }
  const next = upsertPptGenerationRecord({
    id: recordId,
    ...patch,
    updatedAt: new Date().toISOString(),
  })
  record.value = next
  if (next.progressText) {
    progressText.value = next.progressText
  }
}

async function loadRecord() {
  if (!recordId) {
    Message.error('缺少 recordId，无法加载生成记录')
    return
  }
  let data = getPptGenerationRecord(recordId)
  if (!data) {
    await hydratePptGenerationRecords()
    data = getPptGenerationRecord(recordId)
  }
  if (!data) {
    data = await ensurePptGenerationRecord(recordId)
  }
  if (!data) {
    Message.error('未找到对应生成记录，请从页面 1 重新创建')
    return
  }
  record.value = data
  progressText.value = data.progressText || ''

  if (data.pptxProperty) {
    try {
      const parsed = await decodePptxProperty(data.pptxProperty)
      pptxObj.value = normalizePptxForRenderer(parsed)
      await drawPreview()
    } catch (error) {
      console.warn('历史预览数据解析失败', error)
    }
  }
}

async function handleGeneratePpt() {
  if (!record.value) {
    Message.error('无可用记录，无法生成')
    return
  }
  if (!record.value.outline || !record.value.templateId) {
    Message.error('记录缺少大纲或模板信息')
    return
  }

  if (contentStreamCancel) {
    contentStreamCancel()
    contentStreamCancel = null
  }

  isGeneratingPpt.value = true
  startGeneratingTimer()
  latestPptId.value = ''
  patchRecord({ status: 'generating', progressText: '已提交生成任务，正在等待响应...' })
  try {
    await ensurePreviewRenderer()
  } catch (error) {
    isGeneratingPpt.value = false
    stopGeneratingTimer()
    patchRecord({ status: 'failed', progressText: '预览引擎加载失败', errorMessage: '预览引擎加载失败' })
    Message.error(error?.message || '预览引擎加载失败')
    return
  }

  contentStreamCancel = generateContentStream({
    outlineMarkdown: record.value.outline,
    asyncGenPptx: true,
    templateId: record.value.templateId,
  }, {
    onMessage: (_evt, json) => {
      if (!json) {
        return
      }
      if (Number(json.status) === -1) {
        isGeneratingPpt.value = false
        stopGeneratingTimer()
        if (contentStreamCancel) {
          contentStreamCancel()
          contentStreamCancel = null
        }
        const msg = json.message || json.error || json.msg || '生成 PPT 失败'
        patchRecord({ status: 'failed', progressText: msg, errorMessage: msg })
        Message.error(msg)
        return
      }

      if (json.current != null && json.total != null) {
        patchRecord({
          status: 'generating',
          progressText: `正在生成第 ${json.current}/${json.total} 页...`,
        })
      }

      if (json.pptId) {
        latestPptId.value = json.pptId
        patchRecord({ pptId: json.pptId })
        void refreshAsyncPptInfo(json.pptId)
      }
    },
    onError: () => {
      isGeneratingPpt.value = false
      stopGeneratingTimer()
      contentStreamCancel = null
      patchRecord({ status: 'failed', progressText: '生成请求失败', errorMessage: '生成请求失败' })
      Message.error('生成 PPT 请求失败，请重试')
    },
    onEnd: async (_raw, json) => {
      isGeneratingPpt.value = false
      stopGeneratingTimer()
      contentStreamCancel = null
      if (json && Object.prototype.hasOwnProperty.call(json, 'code') && Number(json.code) !== 0) {
        const msg = json.message || json.error || json.msg || '生成 PPT 失败'
        patchRecord({ status: 'failed', progressText: msg, errorMessage: msg })
        Message.error(msg)
        return
      }
      if (latestPptId.value) {
        await refreshAsyncPptInfo(latestPptId.value)
      }
      patchRecord({ status: 'completed', progressText: 'PPT 生成完成，可预览并下载', errorMessage: '' })
      Message.success('PPT 生成完成')
    },
  })
}

async function refreshAsyncPptInfo(pptId) {
  if (!pptId || isPullingAsyncInfo.value) {
    return
  }
  isPullingAsyncInfo.value = true
  try {
    const resp = await fetchAsyncPptInfo(pptId)
    if (!resp || Number(resp.code) !== 0) {
      throw new Error(resp?.message || resp?.msg || '拉取预览失败')
    }

    const data = resp.data || {}
    if (!data.pptxProperty) {
      return
    }

    const parsed = normalizePptxForRenderer(await decodePptxProperty(data.pptxProperty))
    if (!parsed || !Array.isArray(parsed.pages) || !parsed.pages.length) {
      return
    }

    pptxObj.value = parsed
    if (Number.isFinite(Number(data.current))) {
      const idx = Math.max(0, Math.min(parsed.pages.length - 1, Number(data.current) - 1))
      currentSlideIndex.value = idx
    } else if (currentSlideIndex.value >= parsed.pages.length) {
      currentSlideIndex.value = 0
    }

    patchRecord({
      pptId,
      pptxProperty: data.pptxProperty,
      slideCount: parsed.pages.length,
      progressText: Number(data.current) && Number(data.total)
        ? `预览已更新：${data.current}/${data.total}`
        : (record.value?.progressText || '预览已更新'),
    })

    await drawPreview()
  } catch (error) {
    console.error('refreshAsyncPptInfo error', error)
  } finally {
    isPullingAsyncInfo.value = false
  }
}

function setThumbCanvasRef(index, el) {
  if (el) {
    thumbCanvasMap.value[index] = el
    return
  }
  delete thumbCanvasMap.value[index]
}

function withBaseAssetPath(path) {
  const cleanPath = String(path || '').replace(/^\/+/, '')
  if (!cleanPath) {
    return ''
  }
  const base = String(import.meta.env.BASE_URL || '/')
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return new URL(`${normalizedBase}${cleanPath}`, window.location.origin).toString()
}

async function ensurePreviewRenderer() {
  if (scriptsReady) {
    if (!painter && previewSvgRef.value && window.Ppt2Svg) {
      painter = new window.Ppt2Svg(previewSvgRef.value)
      if (typeof painter.setMode === 'function') {
        painter.setMode('edit')
      }
      resizePreview()
    }
    return
  }

  await loadExternalScripts([
    withBaseAssetPath('legacy-static/chart.js'),
    withBaseAssetPath('legacy-static/geometry.js'),
    withBaseAssetPath('legacy-static/element.js'),
    withBaseAssetPath('legacy-static/ppt2svg.js'),
    withBaseAssetPath('legacy-static/ppt2canvas.js'),
    withBaseAssetPath('legacy-static/base64js.js'),
    withBaseAssetPath('legacy-static/pako.js'),
  ])

  scriptsReady = true
  await nextTick()

  if (!previewSvgRef.value || !window.Ppt2Svg) {
    throw new Error('预览引擎加载失败：Ppt2Svg 不可用')
  }

  painter = new window.Ppt2Svg(previewSvgRef.value)
  if (typeof painter.setMode === 'function') {
    painter.setMode('edit')
  }
  resizePreview()
}

async function drawPreview() {
  if (!pptxObj.value || !Array.isArray(pptxObj.value.pages) || !pptxObj.value.pages.length) {
    return
  }
  await ensurePreviewRenderer()
  await nextTick()

  if (window.Ppt2Canvas) {
    for (let i = 0; i < pptxObj.value.pages.length; i++) {
      const canvas = thumbCanvasMap.value[i]
      if (!canvas) {
        continue
      }
      try {
        const canvasPainter = new window.Ppt2Canvas(canvas)
        await canvasPainter.drawPptx(pptxObj.value, i)
      } catch (error) {
        console.warn('缩略图渲染异常', i, error)
      }
    }
  }

  drawCurrentSlide()
}

function drawCurrentSlide() {
  if (!painter || !pptxObj.value || !Array.isArray(pptxObj.value.pages) || !pptxObj.value.pages.length) {
    return
  }
  const idx = Math.max(0, Math.min(currentSlideIndex.value, pptxObj.value.pages.length - 1))
  currentSlideIndex.value = idx
  try {
    painter.drawPptx(pptxObj.value, idx)
  } catch (error) {
    console.warn('主画布渲染异常', error)
  }
}

function selectSlide(index) {
  currentSlideIndex.value = index
  drawCurrentSlide()
}

function stepSlide(offset) {
  if (!previewPages.value.length) {
    return
  }
  const next = Math.max(0, Math.min(currentSlideIndex.value + Number(offset || 0), previewPages.value.length - 1))
  if (next === currentSlideIndex.value) {
    return
  }
  currentSlideIndex.value = next
  drawCurrentSlide()
}

function resizePreview() {
  if (!painter || !previewViewportRef.value) {
    return
  }
  const width = Math.max(Math.min(previewViewportRef.value.clientWidth - 32, 1600), 480)
  if (typeof painter.resetSize === 'function') {
    painter.resetSize(width, width * 0.5625)
  }
  drawCurrentSlide()
}

function handleWindowResize() {
  if (resizeTimer) {
    clearTimeout(resizeTimer)
  }
  resizeTimer = setTimeout(() => {
    resizePreview()
  }, 80)
}

function ensurePageChildren(page) {
  if (!page) {
    return []
  }
  if (!Array.isArray(page.children)) {
    page.children = []
  }
  return page.children
}

function pickRandomGeometryName() {
  const map = window.geometryMap
  if (!map || typeof map !== 'object') {
    return 'rect'
  }
  const keys = Object.keys(map)
  if (!keys.length) {
    return 'rect'
  }
  return keys[Math.floor(Math.random() * keys.length)] || 'rect'
}

function createDemoTableData() {
  return [
    ['单元格 1-1', '单元格 1-2', '单元格 1-3'],
    ['单元格 2-1', '单元格 2-2', '单元格 2-3'],
    ['单元格 3-1', '单元格 3-2', '单元格 3-3'],
  ]
}

function createDemoChartData(subType) {
  if (subType === 'pie' || subType === 'doughnut') {
    return [
      [' ', '销量'],
      ['Q1', '8.2'],
      ['Q2', '3.2'],
      ['Q3', '1.4'],
      ['Q4', '1.2'],
    ]
  }
  return [
    [' ', '系列1', '系列2', '系列3'],
    ['类别1', '4.3', '2.4', '2.0'],
    ['类别2', '2.5', '4.4', '2.0'],
    ['类别3', '3.5', '1.8', '3.0'],
    ['类别4', '4.5', '2.8', '5.0'],
  ]
}

function pickImageElement() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.jpg,.jpeg,.png,.webp'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = String(event?.target?.result || '')
        if (!base64 || typeof window.createImage !== 'function') {
          resolve(null)
          return
        }
        const img = new Image()
        img.src = base64
        img.onload = () => {
          const width = img.width > 300 ? 300 : img.width
          const height = img.width > 0 ? img.height * (width / img.width) : 160
          resolve(window.createImage(base64, width, height))
        }
        img.onerror = () => resolve(null)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }
    input.click()
  })
}

async function redrawThumbnail(index) {
  if (!window.Ppt2Canvas || !pptxObj.value) {
    return
  }
  const canvas = thumbCanvasMap.value[index]
  if (!canvas) {
    return
  }
  try {
    const canvasPainter = new window.Ppt2Canvas(canvas)
    await canvasPainter.drawPptx(pptxObj.value, index)
  } catch (error) {
    console.warn('缩略图重绘失败', error)
  }
}

async function handleInsertElement(value) {
  const raw = String(value || '')
  insertElementValue.value = ''
  if (!raw) {
    return
  }
  try {
    await ensurePreviewRenderer()
  } catch (error) {
    Message.error(error?.message || '预览引擎加载失败，无法插入元素')
    return
  }
  if (!pptxObj.value || !Array.isArray(pptxObj.value.pages) || !pptxObj.value.pages.length) {
    Message.warning('请先生成 PPT 再插入元素')
    return
  }

  const page = pptxObj.value.pages[currentSlideIndex.value]
  if (!page) {
    Message.warning('当前页面不可用')
    return
  }

  const [type, subType] = raw.split(',')
  let element = null

  if (type === 'text' && typeof window.createTextBox === 'function') {
    element = window.createTextBox(subType || 'content')
  } else if (type === 'image') {
    element = await pickImageElement()
  } else if (type === 'geometry' && typeof window.createGeometry === 'function') {
    element = window.createGeometry(subType || pickRandomGeometryName())
  } else if (type === 'table' && typeof window.createTable === 'function') {
    element = window.createTable(createDemoTableData())
  } else if (type === 'chart' && typeof window.createChart === 'function') {
    const chartType = subType || 'bar'
    element = window.createChart('图表示例', chartType, createDemoChartData(chartType))
  }

  if (!element) {
    Message.warning('当前预览引擎暂不支持该元素插入')
    return
  }

  ensurePageChildren(page).push(element)
  drawCurrentSlide()
  await redrawThumbnail(currentSlideIndex.value)

  patchRecord({
    status: 'completed',
    progressText: `已在第 ${currentSlideIndex.value + 1} 页插入新元素`,
    slideCount: previewPages.value.length,
  })
  Message.success('元素已插入当前页')
}

async function handleDownloadPpt() {
  if (!pptxObj.value) {
    Message.warning('暂无可下载的 PPT 内容')
    return
  }

  isDownloadingPpt.value = true
  let chargeResult = null
  try {
    chargeResult = await chargeCredits('aippt_json2ppt', {
      recordId,
      slideCount: previewPages.value.length,
      animationType: downloadAnimationType.value || 'default',
    })

    const animationType = ['1', '2'].includes(downloadAnimationType.value)
      ? downloadAnimationType.value
      : undefined
    const response = await fetch(buildPptJsonApiUrl('/json2ppt', { animationType }), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(pptxObj.value),
    })

    if (!response.ok) {
      throw new Error(`下载失败（HTTP ${response.status}）`)
    }

    const type = response.headers.get('content-type') || ''
    if (type.includes('application/json')) {
      const json = await response.json()
      throw new Error(json?.message || json?.msg || '渲染失败')
    }

    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${record.value?.topic || 'download'}.pptx`
    link.click()
    URL.revokeObjectURL(link.href)
    Message.success('已开始下载 PPT')
  } catch (error) {
    if (chargeResult?.charged && chargeResult?.chargeId) {
      try {
        await refundCredits(chargeResult.chargeId, {
          reason: 'credits退款，调用失败',
          meta: {
            scene: 'aippt_json2ppt',
            recordId,
            slideCount: previewPages.value.length,
            error: String(error?.message || ''),
          },
        })
        Message.info('下载失败，credits 已回退')
      } catch (refundError) {
        console.error('json2ppt refund failed:', refundError)
        Message.warning('下载失败，credits 退款失败，请稍后重试')
      }
    }
    console.error('handleDownloadPpt error', error)
    Message.error(error.message || '下载失败')
  } finally {
    isDownloadingPpt.value = false
  }
}

onMounted(async () => {
  await loadRecord()
  await ensurePreviewRenderer().catch(() => {})

  const autoStart = String(route.query.autoStart || '') === '1'
  if (autoStart && record.value && record.value.status !== 'generating' && record.value.status !== 'completed') {
    await handleGeneratePpt()
  } else if (record.value?.pptId && !pptxObj.value) {
    await refreshAsyncPptInfo(record.value.pptId)
  }

  window.addEventListener('resize', handleWindowResize)
})

onBeforeUnmount(() => {
  if (contentStreamCancel) {
    contentStreamCancel()
  }
  stopGeneratingTimer()
  if (resizeTimer) {
    clearTimeout(resizeTimer)
  }
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<style scoped>
.workspace-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: #f4f7fb;
  box-sizing: border-box;
  overflow: hidden;
}

.workspace-header {
  border: 1px solid #dbe4f2;
  border-radius: 14px;
  background: #fff;
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  flex-shrink: 0;
}

.header-main {
  min-width: 0;
  flex: 1;
}

.header-main h2 {
  margin: 0;
  font-size: 18px;
  color: #0f2b54;
}

.header-main p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #5d6d84;
}

.header-actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-start;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.download-action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.billing-estimate-tip {
  font-size: 12px;
  color: #2563eb;
  line-height: 1.2;
}

.header-select {
  flex: 0 0 auto;
}

.header-select-insert {
  width: 120px;
}

.header-select-download {
  width: 96px;
}

.workspace-status {
  border: 1px solid #dbe4f2;
  border-radius: 12px;
  background: #fff;
  padding: 9px 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #5d6d84;
  flex-shrink: 0;
}

.status-label {
  color: #475569;
}

.status-badge {
  border-radius: 999px;
  padding: 2px 10px;
  font-weight: 600;
}

.status-pending {
  background: #f1f5f9;
  color: #475569;
}

.status-generating {
  background: #e0ecff;
  color: #2453c8;
}

.status-completed {
  background: #e7f8ef;
  color: #147a4a;
}

.status-failed {
  background: #ffe6e6;
  color: #b42318;
}

.status-text {
  color: #1d4ed8;
  font-weight: 600;
}

.status-elapsed {
  color: #475569;
}

.status-time {
  margin-left: auto;
}

.workspace-body {
  flex: 1;
  height: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
  align-items: flex-start;
  --thumb-visible-count: 7;
  --thumb-item-height: 108px;
  --preview-panel-height: min(100%, calc(var(--thumb-visible-count) * var(--thumb-item-height) + 16px));
}

.thumbnail-list {
  border: 1px solid #dbe4f2;
  border-radius: 12px;
  background: #fff;
  padding: 8px;
  height: var(--preview-panel-height);
  max-height: var(--preview-panel-height);
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  align-self: flex-start;
}

.thumb-item {
  border: 1px solid #d8e3f1;
  border-radius: 8px;
  padding: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.thumb-item:last-child {
  margin-bottom: 0;
}

.thumb-item.active {
  border-color: #2f6ff2;
  box-shadow: 0 0 0 2px rgba(47, 111, 242, 0.15);
}

.thumb-index {
  font-size: 11px;
  color: #60708a;
  margin-bottom: 4px;
}

.thumb-canvas {
  width: 100%;
  max-width: 148px;
  height: auto;
  border-radius: 6px;
  background: #f3f7fc;
}

.thumb-empty {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7183a0;
  font-size: 12px;
}

.main-preview {
  border: 1px solid #dbe4f2;
  border-radius: 12px;
  background: #fff;
  height: var(--preview-panel-height);
  max-height: var(--preview-panel-height);
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 10px;
  overflow: hidden;
}

.preview-stage-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
}

.preview-stage-wrap {
  width: min(100%, 1040px);
  border: 1px solid #d9e4f3;
  border-radius: 12px;
  background: linear-gradient(180deg, #f8fbff 0%, #f2f6fd 100%);
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

#workspace_preview_svg {
  display: block;
}

.page-switcher {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.page-indicator {
  min-width: 72px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #1f3b68;
}

.preview-empty {
  min-height: 360px;
  min-width: min(100%, 980px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #72849d;
  font-size: 14px;
}

@media (max-width: 1200px) {
  .workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .header-select-insert {
    width: 140px;
  }

  .header-select-download {
    width: 120px;
  }

  .workspace-body {
    grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
  }

  .status-time {
    margin-left: 0;
  }
}

@media (max-width: 860px) {
  .workspace-body {
    grid-template-columns: 1fr;
    grid-template-rows: 180px minmax(0, 1fr);
  }

  .thumbnail-list {
    height: 180px;
  }
}
</style>
