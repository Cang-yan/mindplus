(function (win) {
    const runtime = win.__AIPPT_RUNTIME_CONFIG__ || {}
    const config = {
        baseUrl: (runtime.baseUrl || '').trim(),
        apiKey: (runtime.apiKey || '').trim(),
        apiPrefix: (runtime.apiPrefix || '/docmee/v1/api/ppt').trim()
    }

    function trimEndSlash(str) {
        return str.replace(/\/+$/, '')
    }

    function trimBothSlash(str) {
        return str.replace(/^\/+/, '').replace(/\/+$/, '')
    }

    function appendQuery(url, query) {
        if (!query) {
            return url
        }

        const params = []
        for (const key in query) {
            if (!Object.prototype.hasOwnProperty.call(query, key)) {
                continue
            }
            const val = query[key]
            if (val === undefined || val === null || val === '') {
                continue
            }
            params.push(encodeURIComponent(key) + '=' + encodeURIComponent(val))
        }
        if (params.length > 0) {
            url += '?' + params.join('&')
        }
        return url
    }

    function buildUrlWithPrefix(prefix, path, query) {
        const baseUrl = trimEndSlash(config.baseUrl)
        const apiPrefix = '/' + trimBothSlash(prefix || '/docmee/v1/api/ppt')
        const apiPath = '/' + trimBothSlash(path || '')
        const mergedPrefix = baseUrl.endsWith(apiPrefix) ? '' : apiPrefix
        return appendQuery(baseUrl + mergedPrefix + apiPath, query)
    }

    function buildUrl(path, query) {
        return buildUrlWithPrefix(config.apiPrefix || '/docmee/v1/api/ppt', path, query)
    }

    function setAuthHeader(xhr) {
        if (config.apiKey) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + config.apiKey)
        }
    }

    function jsonHeaders(extra) {
        const headers = {
            'Content-Type': 'application/json'
        }
        if (config.apiKey) {
            headers['Authorization'] = 'Bearer ' + config.apiKey
        }
        if (extra) {
            for (const key in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, key)) {
                    headers[key] = extra[key]
                }
            }
        }
        return headers
    }

    function isConfigured() {
        return !!(config.baseUrl && config.apiKey)
    }

    function ensureConfigured() {
        if (isConfigured()) {
            return true
        }
        const msg = 'API未配置：请通过环境变量生成 static/runtime-config.js（baseUrl + apiKey）'
        console.error(msg, config)
        alert(msg)
        return false
    }

    win.AIPPT_API = {
        config,
        url: buildUrl,
        urlWithPrefix: buildUrlWithPrefix,
        setAuthHeader,
        jsonHeaders,
        isConfigured,
        ensureConfigured
    }
})(window)
