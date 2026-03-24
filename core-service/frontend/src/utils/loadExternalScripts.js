const loadedScripts = new Map()

function resolveScriptUrl(url) {
  if (!url) {
    return ''
  }
  try {
    return new URL(url, window.location.href).toString()
  } catch {
    return String(url)
  }
}

export function loadExternalScript(url) {
  const resolved = resolveScriptUrl(url)
  if (!resolved) {
    return Promise.reject(new Error('script url is empty'))
  }
  if (loadedScripts.has(resolved)) {
    return loadedScripts.get(resolved)
  }

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-external="${resolved}"]`)
    if (existing) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = resolved
    script.async = true
    script.dataset.external = resolved
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`load script failed: ${resolved}`))
    document.head.appendChild(script)
  })

  loadedScripts.set(resolved, promise)
  return promise
}

export async function loadExternalScripts(urls = []) {
  for (const url of urls) {
    await loadExternalScript(url)
  }
}
