// backend-gate.js — 在"后端模式"未登录时，拦截并跳转到登录页
// MindPlus AI 适配版：兼容 aippt 的 jwt_token 鉴权，并重定向到 aippt 登录页

(function () {
  try {
    var loc = window.location;
    var path = loc.pathname || '';

    // 纯本地文件访问（file://）时，强制视为前端模式
    if (loc.protocol === 'file:') return;

    // 排除管理台与登录页自身
    if (path.startsWith('/admin') || path.endsWith('/login.html') || path.includes('/slide/login')) return;

    function q(key) {
      try { return new URLSearchParams(loc.search).get(key); } catch { return null; }
    }

    function modeForced() {
      var m = (q('mode') || '').toLowerCase();
      if (m === 'backend') return true;
      var env = (window.ENV_DEPLOYMENT_MODE || '').toLowerCase();
      return env === 'backend';
    }

    function modeFrontendForced() {
      var m = (q('mode') || '').toLowerCase();
      return m === 'frontend';
    }

    // MindPlus AI 适配：优先使用 jwt_token（aippt 鉴权），兼容原有 auth_token
    function syncAndGetToken() {
      try {
        var jwtToken = localStorage.getItem('jwt_token');
        var authToken = localStorage.getItem('auth_token');
        // 将 aippt 的 jwt_token 同步为 Burner-X 的 auth_token
        if (jwtToken && !authToken) {
          localStorage.setItem('auth_token', jwtToken);
          return jwtToken;
        }
        return authToken || jwtToken || null;
      } catch { return null; }
    }

    function hasToken() {
      try { return !!(localStorage.getItem('auth_token') || localStorage.getItem('jwt_token')); } catch { return false; }
    }

    function redirectToLogin() {
      // 重定向到 aippt 的登录页
      var safe = encodeURIComponent(window.location.href);
      window.location.replace('/slide/login?redirect=' + safe);
    }

    function gateIfBackendKnown() {
      if (modeFrontendForced()) return;
      if (hasToken()) return;
      redirectToLogin();
    }

    // 页面加载时同步 token
    syncAndGetToken();

    // 情况 1：已强制后端 → 立即门禁
    if (modeForced()) {
      gateIfBackendKnown();
      return;
    }

    // 情况 2：依赖 storage-adapter 的自动切换事件
    if (typeof window !== 'undefined') {
      window.addEventListener('pb:storage-mode-changed', function (evt) {
        if (evt && evt.detail && evt.detail.mode === 'backend') gateIfBackendKnown();
      });
    }

    // 情况 3：health check — 但使用 aippt 的 API 路径
    // 注意：aippt 后端可能存在，但 Burner-X 的功能以前端模式运行
    // 不做健康检查重定向，避免误将已登录用户踢到登录页
    // (已通过 hasToken() 覆盖了未登录的情况)

  } catch (e) {
    // 忽略所有门禁过程中的异常，避免影响前端模式体验
  }
})();
