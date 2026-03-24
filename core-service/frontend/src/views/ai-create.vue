<template>
  <main class="ai-workflow-page">
    <section class="workflow-header">
      <div class="workflow-title-wrap">
        <div class="workflow-title-line">
          <button
            v-if="isHistoryEntry"
            type="button"
            class="history-back-btn"
            aria-label="返回"
            @click="handleReturnToHome"
          >
            &lt;
          </button>
          <h2>AI PPT 生成工作流</h2>
        </div>
        <p>输入主题 -> 生成大纲 -> 选择模板 -> 生成与预览</p>
      </div>

      <div class="workflow-steps">
        <button
          class="step-btn"
          :class="{ active: currentStep === 1, done: canStep2 }"
          @click="goStep(1)"
        >
          <span class="step-index">1</span>
          <span>生成大纲</span>
        </button>

        <button
          class="step-btn"
          :class="{ active: currentStep === 2, done: canStep3 }"
          :disabled="!canStep2"
          @click="goStep(2)"
        >
          <span class="step-index">2</span>
          <span>选择模板</span>
        </button>

        <button
          class="step-btn"
          :class="{ active: currentStep === 3 }"
          :disabled="!canStep3"
          @click="goStep(3)"
        >
          <span class="step-index">3</span>
          <span>生成 PPT</span>
        </button>
      </div>

      <div class="workflow-actions">
        <a-button
          v-if="currentStep === 1"
          type="primary"
          :loading="isGeneratingOutline"
          :disabled="!topic.trim()"
          @click="handleGenerateOutline"
        >
          生成大纲
        </a-button>

        <a-button
          v-if="currentStep === 1"
          :disabled="!canStep2 || isGeneratingOutline"
          @click="goStep(2)"
        >
          选择模板
        </a-button>

        <a-button
          v-if="currentStep === 2"
          type="primary"
          :disabled="!selectedTemplateId"
          @click="goStep(3)"
        >
          进入第 3 步
        </a-button>

        <a-button
          v-if="currentStep === 3"
          type="primary"
          :disabled="!canStep3"
          @click="handleOpenGenerateWorkspace"
        >
          打开生成页面
        </a-button>
      </div>
    </section>

    <section v-if="currentStep === 1" class="workflow-panel panel-outline">
      <div class="panel-card">
        <div class="panel-label">请输入主题</div>
        <textarea
          v-model="topic"
          class="topic-input"
          placeholder="例如：2026 年产品战略与商业增长规划"
        />
        <div class="hint-line">支持 Ctrl + Enter 快速触发生成大纲</div>
      </div>

      <div class="panel-card">
        <div class="panel-label line-between">
          <span>大纲层级预览</span>
          <div class="inline-actions">
            <a-button size="mini" @click="toggleOutlineEditMode">
              {{ showOutlineEditor ? '关闭原文编辑' : '编辑原文' }}
            </a-button>
          </div>
        </div>

        <a-spin :loading="isGeneratingOutline" style="width: 100%">
          <template v-if="outlineBlocks.length">
            <div class="outline-pager" v-if="outlinePageCount > 1">
              <a-button size="mini" :disabled="outlinePage <= 1" @click="outlinePage -= 1">上一页</a-button>
              <span>第 {{ outlinePage }} / {{ outlinePageCount }} 页</span>
              <a-button size="mini" :disabled="outlinePage >= outlinePageCount" @click="outlinePage += 1">下一页</a-button>
            </div>
            <div class="outline-render markdown-body" v-html="currentOutlineHtml"></div>
          </template>
          <div v-else class="outline-empty">大纲生成后会在这里按层级展示</div>

          <div v-if="showOutlineEditor" class="outline-editor-wrap">
            <textarea
              v-model="outline"
              class="outline-textarea"
              placeholder="你可以直接编辑大纲原文"
            />
          </div>
        </a-spin>
      </div>
    </section>

    <section v-if="currentStep === 2" class="workflow-panel panel-template">
      <div class="template-filter-bar">
        <div class="filter-block">
          <span>按风格筛选</span>
          <a-select v-model="styleFilter" allow-clear placeholder="全部风格" @change="onStyleFilterChange">
            <a-option value="business">商务</a-option>
            <a-option value="simple">极简</a-option>
            <a-option value="creative">创意</a-option>
            <a-option value="tech">科技</a-option>
          </a-select>
        </div>

        <div class="filter-block">
          <span>按主题筛选</span>
          <a-select v-model="topicFilter" allow-clear placeholder="全部主题" @change="onTopicFilterChange">
            <a-option value="report">汇报</a-option>
            <a-option value="education">教育</a-option>
            <a-option value="marketing">营销</a-option>
            <a-option value="finance">金融</a-option>
          </a-select>
        </div>

        <a-button @click="reloadTemplates" :loading="isLoadingTemplates">重新加载</a-button>
      </div>

      <a-spin :loading="isLoadingTemplates" style="width: 100%">
        <div v-if="!pagedTemplates.length" class="empty-tip">暂无可用模板，请点击“重新加载”或“加载更多模板”</div>

        <template v-else>
          <div class="template-grid">
            <article
              v-for="template in pagedTemplates"
              :key="template.id"
              class="template-card"
              :class="{ selected: String(template.id) === selectedTemplateId }"
              @click="selectTemplate(template)"
            >
              <div class="template-cover">
                <img
                  :src="getTemplateCoverUrl(template)"
                  :alt="`template-${template.id}`"
                  loading="lazy"
                  @error="event => onTemplateImageError(event, template)"
                />
              </div>
              <div class="template-meta">
                <div class="template-id">模板 ID: {{ template.id }}</div>
                <div class="template-name">{{ template.name || template.title || '默认模板' }}</div>
              </div>
            </article>
          </div>

          <div class="template-pagination">
            <a-button size="mini" :disabled="templateViewPage <= 1" @click="templateViewPage -= 1">上一页</a-button>
            <span>第 {{ templateViewPage }} / {{ templatePageCount }} 页（已加载 {{ filteredTemplates.length }} 个）</span>
            <a-button size="mini" :disabled="templateViewPage >= templatePageCount" @click="templateViewPage += 1">下一页</a-button>
          </div>
        </template>
      </a-spin>

      <div class="load-more-wrap" v-if="showLoadMoreSection">
        <a-button
          type="outline"
          :loading="isLoadingMoreTemplates"
          :disabled="!hasMoreTemplates || isLoadingTemplates"
          @click="loadMoreTemplates"
        >
          加载更多模板
        </a-button>
        <span class="load-more-tip" v-if="!hasMoreTemplates">没有更多模板了</span>
      </div>
    </section>

    <section v-if="currentStep === 3" class="workflow-panel panel-records">
      <div class="panel-card">
        <div class="panel-label">页面 1：生成入口</div>
        <p class="record-desc">
          点击顶部“打开生成页面”后，会在独立页面执行生成与预览流程。
          生成结果会被持久化保存，可回到我的作品->历史记录再次进入。
        </p>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { marked } from 'marked'
import {
  buildTemplateLocalPreviewUrl,
  extractTemplateFileName,
  fetchRandomTemplates,
  generateOutlineStream,
  resolvePptApiConfig,
} from '@/api/main-ppt'
import {
  createPptGenerationRecord,
  getPptGenerationRecord,
  listPptGenerationRecords,
  upsertPptGenerationRecord,
} from '@/utils/ppt-generation-store'
import { chargeCredits, refundCredits } from '@/api/billing'

marked.setOptions({
  gfm: true,
  breaks: true,
})

const router = useRouter()
const route = useRoute()
const currentStep = ref(1)

const topic = ref('')
const outline = ref('')
const isGeneratingOutline = ref(false)
const showOutlineEditor = ref(false)
let outlineStreamCancel = null

const OUTLINE_BLOCKS_PER_PAGE = 5
const outlinePage = ref(1)

const templates = ref([])
const isLoadingTemplates = ref(false)
const isLoadingMoreTemplates = ref(false)
const hasMoreTemplates = ref(true)
const selectedTemplateId = ref('')
const styleFilter = ref('')
const topicFilter = ref('')
const templateExcludeIds = ref([])

const TEMPLATE_VIEW_PAGE_SIZE = 20
const templateViewPage = ref(1)

const generationRecords = ref([])
const activeRecordId = ref('')

const canStep2 = computed(() => !!outline.value.trim())
const canStep3 = computed(() => canStep2.value && !!selectedTemplateId.value)
const isHistoryEntry = computed(() => String(route.query.recordId || '').trim().length > 0)

const outlineBlocks = computed(() => splitOutlineBlocks(outline.value))
const outlinePageCount = computed(() => {
  if (!outlineBlocks.value.length) {
    return 0
  }
  return Math.ceil(outlineBlocks.value.length / OUTLINE_BLOCKS_PER_PAGE)
})
const currentOutlineMarkdown = computed(() => {
  if (!outlineBlocks.value.length) {
    return ''
  }
  const page = Math.max(1, Math.min(outlinePage.value, outlinePageCount.value))
  const start = (page - 1) * OUTLINE_BLOCKS_PER_PAGE
  const end = start + OUTLINE_BLOCKS_PER_PAGE
  return outlineBlocks.value.slice(start, end).join('\n\n')
})
const currentOutlineHtml = computed(() => {
  if (!currentOutlineMarkdown.value) {
    return ''
  }
  return marked.parse(currentOutlineMarkdown.value)
})

const filteredTemplates = computed(() => {
  let list = [...templates.value]
  list = applyStyleFilterPlaceholder(list, styleFilter.value)
  list = applyTopicFilterPlaceholder(list, topicFilter.value)
  return list
})

const templatePageCount = computed(() => {
  if (!filteredTemplates.value.length) {
    return 0
  }
  return Math.ceil(filteredTemplates.value.length / TEMPLATE_VIEW_PAGE_SIZE)
})

const showLoadMoreSection = computed(() => {
  if (!templatePageCount.value) {
    return false
  }
  return templateViewPage.value === templatePageCount.value
})

const pagedTemplates = computed(() => {
  if (!filteredTemplates.value.length) {
    return []
  }
  const page = Math.max(1, Math.min(templateViewPage.value, templatePageCount.value))
  const start = (page - 1) * TEMPLATE_VIEW_PAGE_SIZE
  const end = start + TEMPLATE_VIEW_PAGE_SIZE
  return filteredTemplates.value.slice(start, end)
})

watch(outlineBlocks, (blocks) => {
  if (!blocks.length) {
    outlinePage.value = 1
    return
  }
  if (outlinePage.value > outlinePageCount.value) {
    outlinePage.value = outlinePageCount.value
  }
})

watch(filteredTemplates, () => {
  if (!filteredTemplates.value.length) {
    templateViewPage.value = 1
    return
  }
  if (templateViewPage.value > templatePageCount.value) {
    templateViewPage.value = templatePageCount.value
  }
  if (templateViewPage.value <= 0) {
    templateViewPage.value = 1
  }
})

function goStep(step) {
  if (step === 1) {
    currentStep.value = 1
    return
  }
  if (step === 2) {
    if (!canStep2.value) {
      Message.warning('请先生成大纲')
      return
    }
    currentStep.value = 2
    if (!templates.value.length) {
      void loadTemplates({ append: false })
    }
    return
  }
  if (step === 3) {
    if (!canStep3.value) {
      Message.warning('请先选择模板')
      return
    }
    currentStep.value = 3
    refreshGenerationRecords()
  }
}

function splitOutlineBlocks(markdownText) {
  const text = String(markdownText || '').trim()
  if (!text) {
    return []
  }
  const lines = text.split(/\r\n|\r|\n/)
  const blocks = []
  let current = []

  lines.forEach((line) => {
    const trimmed = line.trim()
    const isHeading = /^#{1,3}\s+/.test(trimmed)
    if (isHeading && current.length) {
      blocks.push(current.join('\n').trim())
      current = [line]
      return
    }
    current.push(line)
  })

  if (current.length) {
    blocks.push(current.join('\n').trim())
  }

  const effective = blocks.filter(Boolean)
  if (effective.length > 1) {
    return effective
  }

  const lineBlocks = []
  const pageLineSize = 22
  for (let i = 0; i < lines.length; i += pageLineSize) {
    lineBlocks.push(lines.slice(i, i + pageLineSize).join('\n').trim())
  }
  return lineBlocks.filter(Boolean)
}

function toggleOutlineEditMode() {
  showOutlineEditor.value = !showOutlineEditor.value
}

function handleReturnToHome() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.push({ name: 'Home' })
}

function syncActiveRecord(patch) {
  if (!activeRecordId.value) {
    return null
  }
  return upsertPptGenerationRecord({
    id: activeRecordId.value,
    ...patch,
    updatedAt: new Date().toISOString(),
  })
}

async function handleGenerateOutline() {
  if (!topic.value.trim()) {
    Message.warning('请输入主题')
    return
  }

  const subject = topic.value.trim()
  let chargeResult = null
  try {
    chargeResult = await chargeCredits('aippt_outline', {
      topic: subject,
      topicLength: subject.length,
    })
  } catch (error) {
    const message = String(error?.response?.data?.message || error?.message || 'credits 不足，无法生成大纲')
    Message.error(message)
    return
  }

  let refundStarted = false
  const attemptRefund = async (failureReason, stage = 'outline_stream') => {
    if (refundStarted) return
    if (!chargeResult?.charged || !chargeResult?.chargeId) return
    refundStarted = true
    try {
      await refundCredits(chargeResult.chargeId, {
        reason: 'credits退款，调用失败',
        meta: {
          scene: 'aippt_outline',
          stage,
          failureReason: String(failureReason || ''),
          topic: subject,
          topicLength: subject.length,
        },
      })
      Message.info('大纲生成失败，credits 已回退')
    } catch (refundError) {
      console.error('outline refund failed:', refundError)
      Message.warning('大纲生成失败，credits 退款失败，请稍后重试')
    }
  }

  const draft = createPptGenerationRecord({
    topic: subject,
    outline: '',
    templateId: selectedTemplateId.value,
  })
  activeRecordId.value = draft.id
  syncActiveRecord({
    status: 'pending',
    progressText: '正在生成大纲...',
    topic: subject,
    outline: '',
    templateId: selectedTemplateId.value,
    errorMessage: '',
  })
  refreshGenerationRecords()

  if (outlineStreamCancel) {
    outlineStreamCancel()
    outlineStreamCancel = null
  }

  isGeneratingOutline.value = true
  outline.value = ''
  outlinePage.value = 1

  outlineStreamCancel = generateOutlineStream(topic.value.trim(), {
    onMessage: (_evt, json) => {
      if (!json) {
        return
      }
      if (Number(json.status) === -1) {
        isGeneratingOutline.value = false
        if (outlineStreamCancel) {
          outlineStreamCancel()
          outlineStreamCancel = null
        }
        const msg = json.message || json.error || json.msg || '生成大纲失败'
        syncActiveRecord({
          status: 'failed',
          progressText: msg,
          topic: subject,
          outline: outline.value,
          templateId: selectedTemplateId.value,
          errorMessage: msg,
        })
        refreshGenerationRecords()
        Message.error(msg)
        void attemptRefund(msg, 'stream_status')
        return
      }
      outline.value += json.text || ''
      syncActiveRecord({
        status: 'pending',
        progressText: '正在生成大纲...',
        topic: subject,
        outline: outline.value,
        templateId: selectedTemplateId.value,
        errorMessage: '',
      })
    },
    onError: () => {
      isGeneratingOutline.value = false
      syncActiveRecord({
        status: 'failed',
        progressText: '生成大纲请求失败，请检查网络或配置',
        topic: subject,
        outline: outline.value,
        templateId: selectedTemplateId.value,
        errorMessage: '生成大纲请求失败，请检查网络或配置',
      })
      refreshGenerationRecords()
      Message.error('生成大纲请求失败，请检查网络或配置')
      void attemptRefund('生成大纲请求失败，请检查网络或配置', 'stream_network_error')
    },
    onEnd: (_raw, json) => {
      isGeneratingOutline.value = false
      outlineStreamCancel = null
      if (json && Object.prototype.hasOwnProperty.call(json, 'code') && Number(json.code) !== 0) {
        const msg = json.message || json.error || json.msg || '生成大纲失败'
        syncActiveRecord({
          status: 'failed',
          progressText: msg,
          topic: subject,
          outline: outline.value,
          templateId: selectedTemplateId.value,
          errorMessage: msg,
        })
        refreshGenerationRecords()
        Message.error(msg)
        void attemptRefund(msg, 'stream_end_error')
        return
      }
      if (!outline.value.trim()) {
        syncActiveRecord({
          status: 'failed',
          progressText: '大纲生成为空，请重试',
          topic: subject,
          outline: outline.value,
          templateId: selectedTemplateId.value,
          errorMessage: '大纲生成为空，请重试',
        })
        refreshGenerationRecords()
        Message.warning('大纲生成为空，请重试')
        void attemptRefund('大纲生成为空，请重试', 'stream_empty_result')
        return
      }
      syncActiveRecord({
        status: 'pending',
        progressText: '大纲已生成，待选择模板',
        topic: subject,
        outline: outline.value,
        templateId: selectedTemplateId.value,
        errorMessage: '',
      })
      refreshGenerationRecords()
      Message.success('大纲生成完成，现在可以进入选择模板')
    },
  })
}

async function reloadTemplates() {
  await loadTemplates({ append: false })
}

async function loadMoreTemplates() {
  await loadTemplates({ append: true })
}

function normalizeTemplateList(resp) {
  if (Array.isArray(resp?.data)) {
    return resp.data
  }
  if (Array.isArray(resp?.data?.list)) {
    return resp.data.list
  }
  if (Array.isArray(resp?.list)) {
    return resp.list
  }
  return []
}

function collectNeqIdCandidates(resp, list) {
  const ids = []
  const pushCandidate = (raw) => {
    if (raw == null || raw === '') {
      return
    }
    if (Array.isArray(raw)) {
      raw.forEach(pushCandidate)
      return
    }
    String(raw)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .forEach(item => ids.push(item))
  }

  pushCandidate(resp?.neq_id)
  pushCandidate(resp?.neqId)
  pushCandidate(resp?.next_neq_id)
  pushCandidate(resp?.nextNeqId)
  pushCandidate(resp?.data?.neq_id)
  pushCandidate(resp?.data?.neqId)
  pushCandidate(resp?.data?.next_neq_id)
  pushCandidate(resp?.data?.nextNeqId)

  list.forEach((item) => {
    pushCandidate(item?.neq_id)
    pushCandidate(item?.neqId)
    pushCandidate(item?.id)
  })

  return Array.from(new Set(ids))
}

async function loadTemplates({ append }) {
  if (append ? isLoadingMoreTemplates.value : isLoadingTemplates.value) {
    return
  }
  if (append) {
    isLoadingMoreTemplates.value = true
  } else {
    isLoadingTemplates.value = true
    hasMoreTemplates.value = true
    templateExcludeIds.value = []
    templateViewPage.value = 1
  }

  const pageSize = 28

  try {
    const neqId = append ? templateExcludeIds.value.join(',') : ''
    const resp = await fetchRandomTemplates({
      page: 1,
      size: pageSize,
      filters: { type: 1 },
      neqId,
    })

    if (!resp || Number(resp.code) !== 0) {
      throw new Error(resp?.message || resp?.msg || '模板加载失败')
    }

    const list = normalizeTemplateList(resp)
    const mapped = Array.isArray(list) ? list : []

    const nextIds = collectNeqIdCandidates(resp, mapped)
    templateExcludeIds.value = Array.from(new Set([...templateExcludeIds.value, ...nextIds]))

    if (!append) {
      templates.value = mapped
    } else {
      const exists = new Set(templates.value.map(item => String(item.id)))
      const incoming = mapped.filter(item => !exists.has(String(item.id)))
      templates.value = [...templates.value, ...incoming]
    }

    hasMoreTemplates.value = mapped.length >= pageSize

    if (!templates.value.length) {
      Message.warning('模板列表为空')
      return
    }

    if (!selectedTemplateId.value) {
      selectedTemplateId.value = String(templates.value[0].id)
    }

    if (!append) {
      templateViewPage.value = 1
    }
  } catch (error) {
    console.error('loadTemplates error', error)
    Message.error(error.message || '模板加载失败')
  } finally {
    if (append) {
      isLoadingMoreTemplates.value = false
    } else {
      isLoadingTemplates.value = false
    }
  }
}

function selectTemplate(template) {
  selectedTemplateId.value = String(template.id)
  syncActiveRecord({
    topic: topic.value.trim(),
    outline: outline.value,
    templateId: selectedTemplateId.value,
    status: 'pending',
    progressText: '模板已选择，待生成 PPT',
    errorMessage: '',
  })
  refreshGenerationRecords()
  Message.success('模板已选择，现在可以进入第 3 步')
}

function onStyleFilterChange() {
  templateViewPage.value = 1
  // 预留：后续可在这里接入更细颗粒的风格筛选逻辑
}

function onTopicFilterChange() {
  templateViewPage.value = 1
  // 预留：后续可在这里接入按主题匹配的筛选逻辑
}

function applyStyleFilterPlaceholder(list) {
  // 预留函数占位：当前先返回原始列表，后续你可以在此实现 style 过滤规则
  return list
}

function applyTopicFilterPlaceholder(list) {
  // 预留函数占位：当前先返回原始列表，后续你可以在此实现 topic 过滤规则
  return list
}

function getTemplateCoverUrl(template) {
  return buildTemplateLocalPreviewUrl(template?.coverUrl || '')
}

function getLocalTemplateCoverCandidates(fileName) {
  if (!fileName) {
    return { byBasePath: '', byRootPath: '' }
  }
  const encodedName = encodeURIComponent(fileName)
  const base = String(import.meta.env.BASE_URL || '/')
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return {
    byBasePath: new URL(`${normalizedBase}template_pic/${encodedName}`, window.location.origin).toString(),
    byRootPath: new URL(`/template_pic/${encodedName}`, window.location.origin).toString(),
  }
}

function onTemplateImageError(event, template) {
  const img = event?.target
  if (!img) {
    return
  }
  const stage = Number(img.dataset.fallbackStage || '0')
  const fileName = extractTemplateFileName(template?.coverUrl || '')
  const localCandidates = getLocalTemplateCoverCandidates(fileName)

  if (stage === 0 && fileName) {
    // Stage 0: initial src is usually BASE_URL + template_pic, fallback to root path.
    if (localCandidates.byRootPath && localCandidates.byRootPath !== img.currentSrc) {
      img.dataset.fallbackStage = '1'
      img.src = localCandidates.byRootPath
      return
    }

    img.dataset.fallbackStage = '2'
    img.src = template?.coverUrl || ''
    return
  }

  if (stage <= 1) {
    img.dataset.fallbackStage = '2'
    img.src = template?.coverUrl || ''
  }
}

function openRecordWorkspace(recordId, autoStart = false) {
  const target = router.resolve({
    name: 'AiCreateWorkspace',
    query: {
      recordId,
      autoStart: autoStart ? '1' : undefined,
    },
  })
  window.open(target.href, '_blank', 'noopener')
}

function handleOpenGenerateWorkspace() {
  if (!canStep3.value) {
    Message.warning('请先完成大纲和模板选择')
    return
  }

  let record = null
  if (activeRecordId.value && getPptGenerationRecord(activeRecordId.value)) {
    record = syncActiveRecord({
      topic: topic.value.trim(),
      outline: outline.value,
      templateId: selectedTemplateId.value,
      status: 'pending',
      progressText: '准备进入生成页面',
      errorMessage: '',
    })
  } else {
    record = createPptGenerationRecord({
      topic: topic.value.trim(),
      outline: outline.value,
      templateId: selectedTemplateId.value,
    })
    activeRecordId.value = record.id
  }
  if (!record) {
    Message.error('作品记录创建失败，请重试')
    return
  }

  refreshGenerationRecords()
  openRecordWorkspace(record.id, true)
  Message.success('已打开生成页面，请在新标签页查看进度')
}

function refreshGenerationRecords() {
  generationRecords.value = listPptGenerationRecords()
}

function handleWindowKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && currentStep.value === 1) {
    event.preventDefault()
    void handleGenerateOutline()
  }
}

async function hydrateFromRecord(recordId) {
  const data = getPptGenerationRecord(recordId)
  if (!data) {
    Message.warning('未找到指定作品，已进入新建流程')
    return
  }

  activeRecordId.value = data.id
  topic.value = data.topic || ''
  outline.value = data.outline || ''
  selectedTemplateId.value = data.templateId ? String(data.templateId) : ''
  outlinePage.value = 1

  if (outline.value.trim()) {
    currentStep.value = selectedTemplateId.value ? 3 : 2
    if (!templates.value.length) {
      await loadTemplates({ append: false })
    }
  } else {
    currentStep.value = 1
  }
}

onMounted(async () => {
  const config = resolvePptApiConfig()
  if (import.meta.env.DEV && !config.apiKey) {
    console.warn('[ai-create] VITE_PPT_API_KEY 未配置，AiPPT 相关请求可能失败')
  }

  refreshGenerationRecords()
  const restoreRecordId = String(route.query.recordId || '')
  if (restoreRecordId) {
    await hydrateFromRecord(restoreRecordId)
  }

  window.addEventListener('focus', refreshGenerationRecords)
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  if (outlineStreamCancel) {
    outlineStreamCancel()
  }
  window.removeEventListener('focus', refreshGenerationRecords)
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<style scoped>
.ai-workflow-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: #f4f7fb;
  overflow: hidden;
}

.workflow-header {
  border: 1px solid #dbe4f2;
  border-radius: 16px;
  padding: 16px;
  background: linear-gradient(145deg, #ffffff, #f8fbff);
  box-shadow: 0 8px 20px rgba(17, 24, 39, 0.05);
}

.workflow-title-wrap h2 {
  margin: 0;
  font-size: 20px;
  color: #10213a;
}

.workflow-title-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.history-back-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #d2ddec;
  border-radius: 8px;
  background: #fff;
  color: #294264;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.history-back-btn:hover {
  border-color: #2f6ff2;
  color: #1d4ed8;
}

.workflow-title-wrap p {
  margin: 6px 0 0;
  color: #51627d;
  font-size: 13px;
}

.workflow-steps {
  margin-top: 14px;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.step-btn {
  border: 1px solid #d2ddec;
  background: #fff;
  color: #45546f;
  border-radius: 12px;
  height: 44px;
  padding: 0 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.step-btn:hover:not(:disabled) {
  border-color: #2f6ff2;
  color: #1d4ed8;
}

.step-btn.active {
  border-color: #2f6ff2;
  color: #ffffff;
  background: linear-gradient(135deg, #2f6ff2, #1d4ed8);
}

.step-btn.done:not(.active) {
  border-color: #21a366;
  color: #137e4a;
}

.step-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.step-index {
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  font-size: 12px;
}

.step-btn.active .step-index {
  background: rgba(255, 255, 255, 0.28);
}

.workflow-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
}

.workflow-panel {
  flex: 1;
  min-height: 0;
}

.panel-outline {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(320px, 1fr) minmax(420px, 1.4fr);
}

.panel-card {
  border: 1px solid #dbe4f2;
  border-radius: 16px;
  background: #fff;
  padding: 14px;
  display: flex;
  flex-direction: column;
}

.panel-card.grow {
  flex: 1;
  min-height: 0;
}

.panel-label {
  font-size: 14px;
  font-weight: 600;
  color: #10213a;
  margin-bottom: 10px;
}

.panel-label.line-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.inline-actions {
  display: flex;
  gap: 8px;
}

.topic-input,
.outline-textarea {
  border: 1px solid #d7e0ee;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  line-height: 1.6;
  color: #16233a;
  resize: none;
}

.topic-input {
  min-height: 240px;
}

.outline-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 160px;
}

.hint-line {
  margin-top: 10px;
  font-size: 12px;
  color: #6b7d95;
}

.outline-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #5b6f8f;
}

.outline-render {
  border: 1px solid #e3eaf5;
  border-radius: 10px;
  padding: 14px;
  background: linear-gradient(180deg, #fcfdff 0%, #f7faff 100%);
  min-height: 320px;
  max-height: 360px;
  overflow: auto;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 0.65em 0 0.45em;
  color: #0f2b54;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.2em;
  margin: 0.35em 0;
}

.markdown-body :deep(li) {
  margin: 0.24em 0;
  color: #1f3658;
  line-height: 1.7;
}

.markdown-body :deep(p) {
  color: #1f3658;
  line-height: 1.8;
  margin: 0.35em 0;
}

.outline-empty {
  border: 1px dashed #d9e2f0;
  border-radius: 10px;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7183a0;
  font-size: 14px;
}

.outline-editor-wrap {
  margin-top: 10px;
}

.panel-template {
  border: 1px solid #dbe4f2;
  border-radius: 16px;
  background: #fff;
  padding: 14px;
  overflow: auto;
}

.template-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 14px;
}

.filter-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;
}

.filter-block span {
  font-size: 12px;
  color: #5d6d84;
}

.template-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.template-card {
  border: 1px solid #d6e1ef;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #fff;
}

.template-card:hover {
  border-color: #2f6ff2;
  box-shadow: 0 8px 18px rgba(47, 111, 242, 0.16);
  transform: translateY(-1px);
}

.template-card.selected {
  border-color: #2f6ff2;
  box-shadow: 0 0 0 2px rgba(47, 111, 242, 0.18);
}

.template-cover {
  height: 124px;
  background: #edf3fb;
}

.template-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.template-meta {
  padding: 10px;
}

.template-id {
  font-size: 11px;
  color: #72849d;
}

.template-name {
  margin-top: 4px;
  font-size: 13px;
  color: #10213a;
  font-weight: 600;
}

.template-pagination {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 12px;
  color: #5b6f8f;
}

.load-more-wrap {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.load-more-tip {
  font-size: 12px;
  color: #7183a0;
}

.empty-tip {
  border: 1px dashed #d7e0ee;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  color: #64748b;
}

.record-desc {
  margin: 0 0 12px;
  color: #51627d;
  font-size: 13px;
  line-height: 1.7;
}

.record-empty {
  border: 1px dashed #d9e2f0;
  border-radius: 10px;
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7183a0;
}

.record-list {
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.record-item {
  border: 1px solid #dce6f4;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.record-item:hover {
  border-color: #2f6ff2;
  box-shadow: 0 8px 18px rgba(47, 111, 242, 0.14);
}

.record-main {
  min-width: 0;
}

.record-title {
  font-weight: 700;
  color: #10213a;
  margin-bottom: 6px;
}

.record-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #62748f;
  font-size: 12px;
}

.record-progress {
  margin-top: 6px;
  color: #355a9a;
  font-size: 12px;
}

.record-side {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.status-badge {
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
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

@media (max-width: 1200px) {
  .panel-outline {
    grid-template-columns: 1fr;
  }
}
</style>
