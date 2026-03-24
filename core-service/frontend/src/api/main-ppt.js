import { getRuntimeConfig } from '@/utils/runtimeConfig'

const DEFAULT_API_PREFIX = '/docmee/v1/api/ppt'
const DEFAULT_PPT_JSON_PREFIX = '/docmee/v1/api/pptjson'

function trimEndSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function trimBothSlash(value) {
  return String(value || '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function appendQuery(url, query) {
  if (!query || typeof query !== 'object') {
    return url
  }
  const params = new URLSearchParams()
  Object.keys(query).forEach(key => {
    const val = query[key]
    if (val === undefined || val === null || val === '') {
      return
    }
    params.set(key, String(val))
  })
  const text = params.toString()
  if (!text) {
    return url
  }
  return `${url}?${text}`
}

export function resolvePptApiConfig() {
  const baseUrl =
    trimEndSlash(
      getRuntimeConfig('VITE_PPT_BASE_URL') ||
      getRuntimeConfig('VITE_AIPPT_BASE_URL') ||
      import.meta.env.VITE_PPT_BASE_URL ||
      import.meta.env.VITE_AIPPT_BASE_URL ||
      ''
    )
  const apiKey =
    getRuntimeConfig('VITE_PPT_API_KEY') ||
    getRuntimeConfig('VITE_AIPPT_API_KEY') ||
    import.meta.env.VITE_PPT_API_KEY ||
    import.meta.env.VITE_AIPPT_API_KEY ||
    ''
  const apiPrefix =
    getRuntimeConfig('VITE_PPT_API_PREFIX') ||
    getRuntimeConfig('VITE_AIPPT_API_PREFIX') ||
    import.meta.env.VITE_PPT_API_PREFIX ||
    import.meta.env.VITE_AIPPT_API_PREFIX ||
    DEFAULT_API_PREFIX
  const pptJsonPrefix =
    getRuntimeConfig('VITE_PPT_JSON_API_PREFIX') ||
    getRuntimeConfig('VITE_AIPPT_PPT_JSON_API_PREFIX') ||
    import.meta.env.VITE_PPT_JSON_API_PREFIX ||
    import.meta.env.VITE_AIPPT_PPT_JSON_API_PREFIX ||
    DEFAULT_PPT_JSON_PREFIX

  return {
    baseUrl,
    apiKey: String(apiKey || '').trim(),
    apiPrefix: String(apiPrefix || '').trim() || DEFAULT_API_PREFIX,
    pptJsonPrefix: String(pptJsonPrefix || '').trim() || DEFAULT_PPT_JSON_PREFIX,
  }
}

function buildUrlWithPrefix(prefix, path, query) {
  const config = resolvePptApiConfig()
  const base = trimEndSlash(config.baseUrl || window.location.origin)
  const apiPrefix = '/' + trimBothSlash(prefix || DEFAULT_API_PREFIX)
  const apiPath = '/' + trimBothSlash(path || '')
  const mergedPrefix = base.endsWith(apiPrefix) ? '' : apiPrefix
  return appendQuery(base + mergedPrefix + apiPath, query)
}

export function buildPptApiUrl(path, query) {
  const config = resolvePptApiConfig()
  return buildUrlWithPrefix(config.apiPrefix, path, query)
}

export function buildPptJsonApiUrl(path, query) {
  const config = resolvePptApiConfig()
  return buildUrlWithPrefix(config.pptJsonPrefix, path, query)
}

export function getAuthHeaders(extra) {
  const config = resolvePptApiConfig()
  const headers = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  }
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }
  Object.keys(headers).forEach(key => {
    if (headers[key] == null || headers[key] === '') {
      delete headers[key]
    }
  })
  return headers
}

export function parseStreamJson(raw) {
  if (raw == null) {
    return null
  }
  const text = String(raw).trim()
  if (!text) {
    return null
  }
  const lines = text
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      while (line.startsWith('data:')) {
        line = line.substring(5).trim()
      }
      return line
    })
    .filter(line => line && line !== '[DONE]' && line !== '[done]')
  if (!lines.length) {
    return null
  }
  const normalized = lines.length === 1 ? lines[0] : lines[lines.length - 1]
  try {
    const parsed = JSON.parse(normalized)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    console.warn('SSE JSON parse failed', { raw, normalized, error })
    return null
  }
}

function parseSseChunk(chunk) {
  if (!chunk || !chunk.length) {
    return null
  }
  const event = { id: null, retry: null, data: '', event: 'message' }
  chunk.split(/\n|\r\n|\r/).forEach(line => {
    line = line.trim()
    if (!line.length) {
      return
    }
    const idx = line.indexOf(':')
    if (idx <= 0) {
      return
    }
    const field = line.substring(0, idx).trim()
    if (!(field in event)) {
      return
    }
    let value = line.substring(idx + 1).trim()
    if (field === 'data') {
      while (value.startsWith('data:')) {
        value = value.substring(5).trim()
      }
      event[field] += value
      return
    }
    event[field] = value
  })
  return event
}

function streamSse(url, {
  method = 'POST',
  headers = {},
  payload = '',
  onMessage,
  onError,
  onEnd,
}) {
  const xhr = new XMLHttpRequest()
  let progress = 0
  let chunk = ''

  const handleProgress = () => {
    if (xhr.status && xhr.status !== 200) {
      return
    }
    const text = xhr.responseText.substring(progress)
    progress += text.length
    text.split(/(\r\n|\r|\n){2}/g).forEach(part => {
      if (part.trim().length === 0) {
        const evt = parseSseChunk(chunk.trim())
        chunk = ''
        if (evt && onMessage) {
          onMessage(evt)
        }
      } else {
        chunk += part
      }
    })
  }

  xhr.addEventListener('progress', handleProgress)
  xhr.addEventListener('load', () => {
    handleProgress()
    if (chunk.trim()) {
      const evt = parseSseChunk(chunk.trim())
      chunk = ''
      if (evt && onMessage) {
        onMessage(evt)
      }
    }
    if (onEnd) {
      onEnd(xhr.responseText)
    }
  })
  xhr.addEventListener('error', event => {
    if (onError) {
      onError(event)
    }
  })
  xhr.open(method, url, true)
  Object.keys(headers || {}).forEach(key => {
    xhr.setRequestHeader(key, headers[key])
  })
  xhr.send(payload)
  return () => {
    try {
      xhr.abort()
    } catch {
      // ignore
    }
  }
}

export function generateOutlineStream(subject, handlers = {}) {
  return streamSse(buildPptApiUrl('/generateOutline'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Cache-Control': 'no-cache' }),
    payload: JSON.stringify({ subject }),
    onMessage: evt => handlers.onMessage && handlers.onMessage(evt, parseStreamJson(evt.data)),
    onError: err => handlers.onError && handlers.onError(err),
    onEnd: raw => handlers.onEnd && handlers.onEnd(raw, parseStreamJson(raw)),
  })
}

export function generateContentStream(payload, handlers = {}) {
  return streamSse(buildPptApiUrl('/generateContent'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Cache-Control': 'no-cache' }),
    payload: JSON.stringify(payload),
    onMessage: evt => handlers.onMessage && handlers.onMessage(evt, parseStreamJson(evt.data)),
    onError: err => handlers.onError && handlers.onError(err),
    onEnd: raw => handlers.onEnd && handlers.onEnd(raw, parseStreamJson(raw)),
  })
}

export async function fetchRandomTemplates({
  page = 1,
  size = 28,
  filters = { type: 1 },
  neqId,
} = {}) {
  const payload = { page, size, filters }
  if (neqId !== undefined && neqId !== null && neqId !== '') {
    payload.neq_id = Array.isArray(neqId) ? neqId.join(',') : String(neqId)
  }
  const response = await fetch(buildPptApiUrl('/randomTemplates'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
  const json = await response.json()
  return json
}

export async function fetchAsyncPptInfo(pptId) {
  const response = await fetch(buildPptApiUrl('/asyncPptInfo', { pptId }), {
    method: 'GET',
    headers: getAuthHeaders(),
  })
  const json = await response.json()
  return json
}

export async function decodePptxProperty(pptxProperty) {
  if (!pptxProperty) {
    return null
  }
  if (window.base64js && window.pako) {
    const bytes = window.base64js.toByteArray(pptxProperty)
    const text = window.pako.ungzip(bytes, { to: 'string' })
    return JSON.parse(text)
  }

  if (!window.DecompressionStream) {
    throw new Error('当前浏览器不支持 gzip 解压，请加载 pako 依赖')
  }

  const binary = atob(pptxProperty)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  return JSON.parse(text)
}

export function extractTemplateFileName(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return ''
  }
  try {
    const parsed = new URL(rawUrl, window.location.origin)
    const path = parsed.pathname || ''
    const idx = path.lastIndexOf('/')
    const name = idx >= 0 ? path.substring(idx + 1) : path
    return name ? decodeURIComponent(name) : ''
  } catch (error) {
    console.warn('模板封面文件名解析失败', rawUrl, error)
    return ''
  }
}

export function buildTemplateLocalPreviewUrl(rawUrl) {
  const fileName = extractTemplateFileName(rawUrl)
  if (!fileName) {
    return rawUrl
  }
  const basePath = String(import.meta.env.BASE_URL || '/')
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return new URL(`${normalizedBase}template_pic/${encodeURIComponent(fileName)}`, window.location.origin).toString()
}
