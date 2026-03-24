#!/usr/bin/env bash
# =============================================================================
# generate-runtime-config.sh
#
# 从宿主机环境变量生成前端运行时配置文件 runtime-config.js。
# 在构建产物部署完成后、启动 Web 服务器之前执行此脚本。
#
# 用法：
#   bash tools/generate-runtime-config.sh [输出目录]
#
#   默认输出到 ./dist/runtime-config.js（Vite 构建产物目录）。
#   本地开发覆盖时可输出到 ./public/runtime-config.js。
#
# 示例（生产部署，使用 DeepSeek 中转服务）：
#   export VITE_DEEPSEEK_API_KEY="sk-xxxxx"
#   export VITE_DEEPSEEK_BASE_URL="https://relay.example.com/v1"
#   bash tools/generate-runtime-config.sh /var/www/html
# =============================================================================

OUTPUT_DIR="${1:-./dist}"
OUTPUT_FILE="${OUTPUT_DIR}/runtime-config.js"

mkdir -p "${OUTPUT_DIR}"

cat > "${OUTPUT_FILE}" << EOF
// 由 tools/generate-runtime-config.sh 在部署时自动生成，请勿手动编辑。
// Generated at: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
window.__APP_CONFIG__ = {
  // ── AI 大模型 API 密钥 ────────────────────────────────────────────────
  VITE_DEEPSEEK_API_KEY:    '${VITE_DEEPSEEK_API_KEY:-}',
  VITE_MINIMAX_API_KEY:     '${VITE_MINIMAX_API_KEY:-}',
  VITE_KIMI_API_KEY:        '${VITE_KIMI_API_KEY:-}',
  VITE_GLM_API_KEY:         '${VITE_GLM_API_KEY:-}',
  VITE_QWEN_API_KEY:        '${VITE_QWEN_API_KEY:-}',
  VITE_DOUBAO_API_KEY:      '${VITE_DOUBAO_API_KEY:-}',
  VITE_OPENAI_API_KEY:      '${VITE_OPENAI_API_KEY:-}',
  VITE_CLAUDE_API_KEY:      '${VITE_CLAUDE_API_KEY:-}',
  VITE_GEMINI_API_KEY:      '${VITE_GEMINI_API_KEY:-}',
  VITE_GROK_API_KEY:        '${VITE_GROK_API_KEY:-}',

  // ── AI 大模型 Base URL（空值则使用各厂商官方地址）──────────────────────
  VITE_DEEPSEEK_BASE_URL:   '${VITE_DEEPSEEK_BASE_URL:-}',
  VITE_MINIMAX_BASE_URL:    '${VITE_MINIMAX_BASE_URL:-}',
  VITE_KIMI_BASE_URL:       '${VITE_KIMI_BASE_URL:-}',
  VITE_GLM_BASE_URL:        '${VITE_GLM_BASE_URL:-}',
  VITE_QWEN_BASE_URL:       '${VITE_QWEN_BASE_URL:-}',
  VITE_DOUBAO_BASE_URL:     '${VITE_DOUBAO_BASE_URL:-}',
  VITE_OPENAI_BASE_URL:     '${VITE_OPENAI_BASE_URL:-}',
  VITE_CLAUDE_BASE_URL:     '${VITE_CLAUDE_BASE_URL:-}',
  VITE_GEMINI_BASE_URL:     '${VITE_GEMINI_BASE_URL:-}',
  VITE_GROK_BASE_URL:       '${VITE_GROK_BASE_URL:-}',
  VITE_CUSTOM_BASE_URL:     '${VITE_CUSTOM_BASE_URL:-}',

  // ── 主项目 AiPPT 接口配置 ──────────────────────────────────────────────
  VITE_PPT_BASE_URL:        '${VITE_PPT_BASE_URL:-}',
  VITE_PPT_API_KEY:         '${VITE_PPT_API_KEY:-}',
  VITE_PPT_API_PREFIX:      '${VITE_PPT_API_PREFIX:-/docmee/v1/api/ppt}',
  VITE_PPT_JSON_API_PREFIX: '${VITE_PPT_JSON_API_PREFIX:-/docmee/v1/api/pptjson}',

  // ── 图片搜索 API 密钥 ─────────────────────────────────────────────────
  VITE_GIPHY_API_KEY:       '${VITE_GIPHY_API_KEY:-}',
  VITE_PEXELS_API_KEY:      '${VITE_PEXELS_API_KEY:-}',
  VITE_UNSPLASH_ACCESS_KEY: '${VITE_UNSPLASH_ACCESS_KEY:-}',
  VITE_PIXABAY_API_KEY:     '${VITE_PIXABAY_API_KEY:-}',

  // ── GitHub OAuth ──────────────────────────────────────────────────────
  VITE_GITHUB_CLIENT_ID:    '${VITE_GITHUB_CLIENT_ID:-}',
  VITE_GITHUB_REDIRECT_URI: '${VITE_GITHUB_REDIRECT_URI:-}',

  // ── MindUser 统一会员系统 ─────────────────────────────────────────────
  VITE_MINDUSER_BASE_URL:   '${VITE_MINDUSER_BASE_URL:-}',
  VITE_MINDUSER_SERVICE_KEY:'${VITE_MINDUSER_SERVICE_KEY:-mindplus}',
  VITE_MINDUSER_PROFILE_URL:'${VITE_MINDUSER_PROFILE_URL:-}',

  // ── 演示账户 ──────────────────────────────────────────────────────────
  VITE_DEMO_ACCOUNT:        '${VITE_DEMO_ACCOUNT:-}',
  VITE_DEMO_PASSWORD:       '${VITE_DEMO_PASSWORD:-}',
}
EOF

echo "✅ 已生成 ${OUTPUT_FILE}"
