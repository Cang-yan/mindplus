'use strict'
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

function loadFromFile(filePath) {
  if (!filePath) return false
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) return false
  dotenv.config({ path: resolved })
  return true
}

function loadEnv() {
  // 支持显式覆盖：AIPPT_ENV_FILE=/abs/path/to/.env
  const explicitEnvFile = String(process.env.AIPPT_ENV_FILE || '').trim()
  if (explicitEnvFile) {
    loadFromFile(explicitEnvFile)
    return
  }

  // 统一优先读取项目根目录 .env（core-service/.env）。
  // 兼容历史路径 frontend/.env 与 server/.env。
  // 注意：dotenv 默认不覆盖已存在变量，因此这里按优先级顺序加载即可。
  const rootEnv = path.resolve(__dirname, '../../.env')
  const frontendEnv = path.resolve(__dirname, '../.env')
  const legacyServerEnv = path.resolve(__dirname, '.env')
  loadFromFile(rootEnv)
  loadFromFile(frontendEnv)
  loadFromFile(legacyServerEnv)
}

module.exports = { loadEnv }
