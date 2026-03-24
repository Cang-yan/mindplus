/// <reference types="vite/client" />
/**
 * Runtime Config
 *
 * 在部署时由 tools/generate-runtime-config.sh 脚本从宿主机环境变量生成
 * public/runtime-config.js，并赋值到 window.__APP_CONFIG__。
 * 前端代码统一通过此函数读取配置，优先级：
 *   1. window.__APP_CONFIG__（运行时注入，推荐生产使用）
 *   2. import.meta.env（Vite 构建时注入，仅用于本地开发）
 */

declare global {
  interface Window {
    __APP_CONFIG__?: Record<string, string>
  }
}

export function getRuntimeConfig(key: string): string {
  return window.__APP_CONFIG__?.[key] || (import.meta.env[key] as string) || ''
}
