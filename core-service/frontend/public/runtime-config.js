// ============================================================
// 运行时配置占位文件
// 可按需手动维护 window.__APP_CONFIG__ 覆盖项；
// 若保持为空，前端会回退到 Vite 构建时环境变量（import.meta.env）。
// 请勿在此处填写真实密钥，也请勿将真实密钥提交到版本控制系统。
// ============================================================
window.__APP_CONFIG__ = {
  // ── AI 大模型 API 密钥 ──────────────────────────────────────────────────
  APP_DEEPSEEK_API_KEY: '',
  APP_MINIMAX_API_KEY: '',
  APP_KIMI_API_KEY: '',
  APP_GLM_API_KEY: '',
  APP_QWEN_API_KEY: '',
  APP_DOUBAO_API_KEY: '',
  APP_OPENAI_API_KEY: '',
  APP_CLAUDE_API_KEY: '',
  APP_GEMINI_API_KEY: '',
  APP_GROK_API_KEY: '',

  // ── AI 大模型 Base URL（不填则使用各厂商官方地址）──────────────────────
  // 使用中转/代理服务时填写，例如：https://relay.example.com/v1
  VITE_DEEPSEEK_BASE_URL: '',
  VITE_MINIMAX_BASE_URL: '',
  VITE_KIMI_BASE_URL: '',
  VITE_GLM_BASE_URL: '',
  VITE_QWEN_BASE_URL: '',
  VITE_DOUBAO_BASE_URL: '',
  VITE_OPENAI_BASE_URL: '',
  VITE_CLAUDE_BASE_URL: '',
  VITE_GEMINI_BASE_URL: '',
  VITE_GROK_BASE_URL: '',
  VITE_CUSTOM_BASE_URL: '',

  // ── 主项目 AiPPT 接口配置 ───────────────────────────────────────────────
  VITE_PPT_BASE_URL: '',
  APP_PPT_API_KEY: '',
  VITE_PPT_API_PREFIX: '',
  VITE_PPT_GEN_API_PREFIX: '',

  // ── 图片搜索 API 密钥 ──────────────────────────────────────────────────
  APP_GIPHY_API_KEY: '',
  APP_PEXELS_API_KEY: '',
  APP_UNSPLASH_ACCESS_KEY: '',
  APP_PIXABAY_API_KEY: '',

  // ── GitHub OAuth ───────────────────────────────────────────────────────
  VITE_GITHUB_CLIENT_ID: '',
  VITE_GITHUB_REDIRECT_URI: '',

  // ── MindUser 统一会员系统 ───────────────────────────────────────────────
  VITE_MINDUSER_BASE_URL: '',
  VITE_MINDUSER_SERVICE_KEY: '',
  VITE_MINDUSER_PROFILE_URL: '',
}
