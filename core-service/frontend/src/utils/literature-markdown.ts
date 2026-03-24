const PAGE_COMMENT_RE = /^<!--\s*(?:page|p|第)\s*[:：#-]?\s*\d+\s*(?:页)?\s*-->$/i
const MARKDOWN_WRAPPER_FENCE_RE = /^```(?:\s*(?:markdown|md))?\s*$/i
const PAGE_WRAPPER_FENCE_OPEN_RE = /^```(?:\s*(?:markdown|md))\s*$/i
const FENCE_CLOSE_RE = /^```\s*$/

function isPageCommentLine(line: string) {
  return PAGE_COMMENT_RE.test(String(line || '').trim())
}

function normalizeLiteratureTextBase(raw: unknown) {
  let text = String(raw ?? '')
  if (!text) return ''

  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
}

function findPreviousMeaningfulLine(lines: string[]) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const trimmed = lines[i].trim()
    if (trimmed) return trimmed
  }
  return ''
}

function findNextMeaningfulLine(lines: string[], from: number) {
  for (let i = from; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    if (trimmed) return trimmed
  }
  return ''
}

function shouldStartWrapperFence(line: string, previousMeaningfulLine: string) {
  if (!MARKDOWN_WRAPPER_FENCE_RE.test(line)) return false
  return !previousMeaningfulLine || isPageCommentLine(previousMeaningfulLine)
}

function findWrapperFenceCloseIndex(lines: string[], from: number) {
  for (let i = from; i < lines.length; i += 1) {
    if (!FENCE_CLOSE_RE.test(lines[i].trim())) continue
    const nextMeaningful = findNextMeaningfulLine(lines, i + 1)
    if (!nextMeaningful || isPageCommentLine(nextMeaningful)) {
      return i
    }
  }
  return -1
}

function unwrapMarkdownWrapperFences(text: string) {
  const lines = text.split('\n')
  const output: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    const previousMeaningful = findPreviousMeaningfulLine(output)

    if (shouldStartWrapperFence(trimmed, previousMeaningful)) {
      const closeIndex = findWrapperFenceCloseIndex(lines, i + 1)
      if (closeIndex !== -1) {
        output.push(...lines.slice(i + 1, closeIndex))
        i = closeIndex
        continue
      }
    }

    output.push(line)
  }

  return output.join('\n')
}

function findFirstMeaningfulLineIndex(lines: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim()) return i
  }
  return -1
}

function findLastMeaningfulLineIndex(lines: string[]) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim()) return i
  }
  return -1
}

function stripPageWrapperFence(text: string) {
  if (!text.trim()) return ''
  const lines = text.split('\n')
  const firstIdx = findFirstMeaningfulLineIndex(lines)
  if (firstIdx === -1) return ''

  const firstLine = lines[firstIdx].trim()
  if (!PAGE_WRAPPER_FENCE_OPEN_RE.test(firstLine)) {
    return text
  }

  lines[firstIdx] = ''
  const lastIdx = findLastMeaningfulLineIndex(lines)
  if (lastIdx !== -1 && FENCE_CLOSE_RE.test(lines[lastIdx].trim())) {
    lines[lastIdx] = ''
  }

  return lines.join('\n')
}

function repairUnbalancedCodeFences(text: string) {
  const lines = text.split('\n')
  let fenceCount = 0
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      fenceCount += 1
    }
  }
  if (fenceCount % 2 === 0) return text
  return `${text}\n\`\`\``
}

export function normalizeLiteratureMarkdown(raw: unknown) {
  let text = normalizeLiteratureTextBase(raw)
  if (!text) return ''

  text = unwrapMarkdownWrapperFences(text)

  return text
    .split('\n')
    .map((line) => line.replace(/^[ \t]{4,}(#{1,6}\s+)/, '$1'))
    .join('\n')
    .trim()
}

export function normalizeLiteraturePageMarkdown(raw: unknown) {
  let text = normalizeLiteratureTextBase(raw)
  if (!text) return ''

  text = stripPageWrapperFence(text)
  text = unwrapMarkdownWrapperFences(text)
  text = repairUnbalancedCodeFences(text)

  return text
    .split('\n')
    .map((line) => line.replace(/^[ \t]{4,}(#{1,6}\s+)/, '$1'))
    .join('\n')
    .trim()
}

export function splitLiteratureMarkdownPages(raw: unknown) {
  const text = normalizeLiteratureTextBase(raw)
  if (!text.trim()) return []

  const lines = text.split('\n')
  const rawPages: string[] = []
  let buffer: string[] = []
  let inPageMode = false

  for (const line of lines) {
    if (isPageCommentLine(line)) {
      if (inPageMode) {
        rawPages.push(buffer.join('\n'))
      } else if (buffer.some((entry) => entry.trim())) {
        rawPages.push(buffer.join('\n'))
      }
      inPageMode = true
      buffer = []
      continue
    }
    buffer.push(line)
  }

  rawPages.push(buffer.join('\n'))

  const normalizedPages = rawPages.map((page) => normalizeLiteraturePageMarkdown(page))
  if (!normalizedPages.some((page) => page.trim())) return []
  return normalizedPages
}

function normalizePagesInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => normalizeLiteraturePageMarkdown(entry))
      .filter((entry) => entry.trim().length > 0)
  }
  return splitLiteratureMarkdownPages(raw)
}

function resizePageArray(rawPages: string[], expectedCount: number) {
  const pages = rawPages.map((page) => normalizeLiteraturePageMarkdown(page))
  if (expectedCount <= 1) {
    return pages.slice(0, 1)
  }
  if (pages.length === expectedCount) {
    return pages
  }
  if (pages.length < expectedCount) {
    return [...pages, ...Array.from({ length: expectedCount - pages.length }, () => '')]
  }

  const head = pages.slice(0, expectedCount - 1)
  const tail = pages.slice(expectedCount - 1).filter((entry) => entry.trim()).join('\n\n')
  return [...head, normalizeLiteraturePageMarkdown(tail)]
}

function splitPageByReferenceWeights(rawPage: unknown, referencePages: string[]) {
  const expectedCount = referencePages.length
  if (expectedCount <= 1) {
    return [normalizeLiteraturePageMarkdown(rawPage)]
  }

  const normalized = normalizeLiteratureMarkdown(rawPage)
  if (!normalized.trim()) {
    return Array.from({ length: expectedCount }, () => '')
  }

  const lines = normalized.split('\n')
  const weights = referencePages.map((page) => Math.max(1, normalizeLiteraturePageMarkdown(page).length))
  const weightSum = weights.reduce((sum, value) => sum + value, 0) || expectedCount
  const totalChars = Math.max(
    lines.reduce((sum, line) => sum + line.length + 1, 0),
    expectedCount
  )
  const targets = weights.map((weight) => Math.max(1, Math.round((weight / weightSum) * totalChars)))

  const buckets: string[][] = Array.from({ length: expectedCount }, () => [])
  let bucketIndex = 0
  let currentChars = 0
  let inFence = false

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const trimmed = line.trim()
    buckets[bucketIndex].push(line)
    currentChars += line.length + 1

    if (/^```/.test(trimmed)) {
      inFence = !inFence
    }

    const remainingLines = lines.length - lineIndex - 1
    const remainingBuckets = expectedCount - bucketIndex - 1
    const canAdvance = (
      bucketIndex < expectedCount - 1
      && !inFence
      && remainingLines >= remainingBuckets
    )

    if (canAdvance && currentChars >= targets[bucketIndex]) {
      bucketIndex += 1
      currentChars = 0
    }
  }

  return buckets.map((bucket) => normalizeLiteraturePageMarkdown(bucket.join('\n')))
}

export function normalizeLiteraturePagesFromChunks(rawChunks: unknown) {
  if (!Array.isArray(rawChunks)) return []

  const pages: string[] = []
  for (const chunk of rawChunks) {
    const chunkText = normalizeLiteratureTextBase(chunk)
    if (!chunkText.trim()) continue

    const splitPages = splitLiteratureMarkdownPages(chunkText)
    if (splitPages.length > 1) {
      pages.push(...splitPages)
      continue
    }

    const normalized = normalizeLiteraturePageMarkdown(chunkText)
    if (normalized || chunkText.trim()) {
      pages.push(normalized)
    }
  }

  return pages
}

export function buildLiteratureMarkdownFromPages(rawPages: unknown) {
  const pages = normalizePagesInput(rawPages)
  if (!pages.length) return ''
  if (pages.length === 1) return pages[0]

  return pages
    .map((page, index) => {
      const normalized = normalizeLiteraturePageMarkdown(page)
      return `<!-- Page ${index + 1} -->\n${normalized}`.trim()
    })
    .join('\n\n')
    .trim()
}

export type LiteraturePageAlignMode =
  | 'empty'
  | 'single'
  | 'direct'
  | 'preferred'
  | 'resized'
  | 'heuristic'

export interface LiteraturePageAlignResult {
  pages: string[]
  mode: LiteraturePageAlignMode
}

export function alignLiteraturePagesToReference(
  rawPages: unknown,
  referenceRaw: unknown,
  options?: {
    preferredPages?: unknown
  }
): LiteraturePageAlignResult {
  const referencePages = normalizePagesInput(referenceRaw)
  const expectedCount = referencePages.length
  const preferredPages = normalizePagesInput(options?.preferredPages)

  if (expectedCount > 1 && preferredPages.length === expectedCount) {
    return {
      pages: preferredPages,
      mode: 'preferred',
    }
  }

  const directPages = splitLiteratureMarkdownPages(rawPages)
  if (expectedCount <= 1) {
    if (directPages.length > 0) {
      return {
        pages: directPages,
        mode: directPages.length === 1 ? 'single' : 'direct',
      }
    }

    const single = normalizeLiteraturePageMarkdown(rawPages)
    if (!single.trim()) {
      return {
        pages: [],
        mode: 'empty',
      }
    }

    return {
      pages: [single],
      mode: 'single',
    }
  }

  if (directPages.length === expectedCount) {
    return {
      pages: directPages,
      mode: 'direct',
    }
  }

  if (directPages.length === 1) {
    return {
      pages: splitPageByReferenceWeights(directPages[0], referencePages),
      mode: 'heuristic',
    }
  }

  if (directPages.length > 1) {
    return {
      pages: resizePageArray(directPages, expectedCount),
      mode: 'resized',
    }
  }

  const normalized = normalizeLiteratureMarkdown(rawPages)
  if (!normalized.trim()) {
    return {
      pages: [],
      mode: 'empty',
    }
  }

  return {
    pages: splitPageByReferenceWeights(normalized, referencePages),
    mode: 'heuristic',
  }
}
