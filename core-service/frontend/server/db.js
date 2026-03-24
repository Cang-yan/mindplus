'use strict'

const mysql = require('mysql2/promise')
const { AsyncLocalStorage } = require('async_hooks')
const config = require('./config')

const txStorage = new AsyncLocalStorage()

const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  charset: config.mysql.charset,
  timezone: config.mysql.timezone,
  waitForConnections: config.mysql.waitForConnections,
  connectionLimit: config.mysql.connectionLimit,
  dateStrings: true,
  namedPlaceholders: false,
  multipleStatements: false,
})

const DDL_STATEMENTS = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id          VARCHAR(64) PRIMARY KEY,
    email       VARCHAR(255) UNIQUE,
    username    VARCHAR(255) NOT NULL,
    password    TEXT,
    role        VARCHAR(32) NOT NULL DEFAULT 'user',
    avatar      TEXT,
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS verification_codes (
    email       VARCHAR(255) NOT NULL,
    code        VARCHAR(32) NOT NULL,
    expires_at  DATETIME(3) NOT NULL,
    used        TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (email, code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS presentations (
    id            VARCHAR(64) PRIMARY KEY,
    user_id       VARCHAR(64) NOT NULL,
    title         VARCHAR(255) NOT NULL DEFAULT '未命名演示',
    description   TEXT,
    content       LONGTEXT,
    thumbnail     TEXT,
    is_public     TINYINT(1) NOT NULL DEFAULT 0,
    created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_presentations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS presentation_versions (
    id              VARCHAR(64) PRIMARY KEY,
    presentation_id VARCHAR(64) NOT NULL,
    user_id         VARCHAR(64) NOT NULL,
    title           VARCHAR(255),
    description     TEXT,
    content         LONGTEXT,
    is_auto_save    TINYINT(1) NOT NULL DEFAULT 0,
    author          VARCHAR(255),
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_pres_versions_pres FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS documents (
    id                    VARCHAR(64) PRIMARY KEY,
    owner_id              VARCHAR(64) NOT NULL,
    name                  VARCHAR(255) NOT NULL,
    type                  VARCHAR(64) NOT NULL DEFAULT 'doc',
    public_permission     VARCHAR(32) NOT NULL DEFAULT 'private',
    collaboration_enabled TINYINT(1) NOT NULL DEFAULT 1,
    content_slide         LONGTEXT,
    content_mindmap       LONGTEXT,
    content_sheet         LONGTEXT,
    page_settings         LONGTEXT,
    is_deleted            TINYINT(1) NOT NULL DEFAULT 0,
    deleted_at            DATETIME(3),
    created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_documents_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS comments (
    id          VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL,
    user_id     VARCHAR(64) NOT NULL,
    content     TEXT NOT NULL,
    target_text TEXT,
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS templates (
    id          VARCHAR(64) PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    category    VARCHAR(64) NOT NULL DEFAULT 'general',
    source      VARCHAR(64) NOT NULL DEFAULT 'system',
    thumbnail   TEXT,
    content     LONGTEXT,
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS literature_history (
    id          VARCHAR(128) PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    record_id   VARCHAR(191) NOT NULL,
    doc_id      VARCHAR(191),
    title       VARCHAR(255) NOT NULL DEFAULT '未命名记录',
    subtitle    TEXT,
    timestamp   BIGINT NOT NULL DEFAULT 0,
    payload     LONGTEXT,
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_lit_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_lit_hist_user_source_record (user_id, source_type, record_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS literature_results (
    id                     VARCHAR(128) PRIMARY KEY,
    user_id                VARCHAR(64) NOT NULL,
    source_type            VARCHAR(32) NOT NULL,
    record_id              VARCHAR(191) NOT NULL,
    doc_id                 VARCHAR(191),
    title                  VARCHAR(255) NOT NULL DEFAULT '未命名记录',
    subtitle               TEXT,
    timestamp              BIGINT NOT NULL DEFAULT 0,
    file_name              TEXT,
    file_size              BIGINT,
    file_type              VARCHAR(64),
    target_language        VARCHAR(32),
    translation_model_name VARCHAR(128),
    translation_model_id   VARCHAR(128),
    payload                LONGTEXT,
    created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_lit_results_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_lit_res_user_source_record (user_id, source_type, record_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS literature_assistant_messages (
    id           VARCHAR(128) PRIMARY KEY,
    user_id      VARCHAR(64) NOT NULL,
    doc_id       VARCHAR(191) NOT NULL,
    role         VARCHAR(32) NOT NULL,
    content      LONGTEXT NOT NULL,
    content_json TINYINT(1) NOT NULL DEFAULT 0,
    metadata     LONGTEXT,
    timestamp    BIGINT NOT NULL DEFAULT 0,
    created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_lit_asst_msg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS aippt_generation_history (
    id            VARCHAR(128) PRIMARY KEY,
    user_id       VARCHAR(64) NOT NULL,
    record_id     VARCHAR(191) NOT NULL,
    topic         VARCHAR(255) NOT NULL DEFAULT '未命名 AI PPT',
    outline       LONGTEXT,
    template_id   VARCHAR(64),
    status        VARCHAR(32) NOT NULL DEFAULT 'pending',
    progress_text TEXT,
    ppt_id        VARCHAR(191),
    pptx_property LONGTEXT,
    slide_count   INT NOT NULL DEFAULT 0,
    error_message TEXT,
    timestamp     BIGINT NOT NULL DEFAULT 0,
    payload       LONGTEXT,
    created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_aippt_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_aippt_hist_user_record (user_id, record_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS platform_notices (
    id          VARCHAR(64) PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    content     TEXT NOT NULL,
    pinned      TINYINT(1) NOT NULL DEFAULT 0,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    start_at    DATETIME(3),
    end_at      DATETIME(3),
    created_by  VARCHAR(64),
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  INSERT IGNORE INTO platform_notices (
    id, title, content, pinned, sort_order, is_active, created_by
  ) VALUES (
    'notice_pricing_20260322',
    '平台计费说明（公示）',
    '现行计费标准如下：\n1. AIPPT 功能：大纲生成免费；PPT 预览免费；PPT 渲染与下载按 50 credits/次计费。\n2. 文献处理功能：仅 OCR 服务按 4 credits/每 2 页计费；翻译服务按 4 credits/每 2 页计费。\n3. 文献编撰助手：研究论文 20 credits/篇，本科论文 33 credits/篇，硕士论文 50 credits/篇，博士论文 100 credits/篇。',
    1,
    100,
    1,
    'system'
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS ai_trial_usage (
    user_id   VARCHAR(64) NOT NULL,
    date      DATE NOT NULL,
    count     INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS credit_overdraft_accounts (
    user_id     VARCHAR(64) PRIMARY KEY,
    debt        DECIMAL(18,4) NOT NULL DEFAULT 0,
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_credit_overdraft_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS credit_charge_records (
    id               VARCHAR(64) PRIMARY KEY,
    user_id          VARCHAR(64) NOT NULL,
    service_key      VARCHAR(64) NOT NULL DEFAULT 'mindplus',
    scene            VARCHAR(64) NOT NULL,
    charge_amount    DECIMAL(18,4) NOT NULL DEFAULT 0,
    consume_amount   DECIMAL(18,4) NOT NULL DEFAULT 0,
    wallet_credits   DECIMAL(18,4) NOT NULL DEFAULT 0,
    debt_before      DECIMAL(18,4) NOT NULL DEFAULT 0,
    debt_after       DECIMAL(18,4) NOT NULL DEFAULT 0,
    effective_before DECIMAL(18,4) NOT NULL DEFAULT 0,
    effective_after  DECIMAL(18,4) NOT NULL DEFAULT 0,
    metadata         LONGTEXT,
    created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_credit_charge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
  CREATE TABLE IF NOT EXISTS credit_refund_records (
    id                 VARCHAR(64) PRIMARY KEY,
    charge_id          VARCHAR(64) NOT NULL,
    user_id            VARCHAR(64) NOT NULL,
    service_key        VARCHAR(64) NOT NULL DEFAULT 'mindplus',
    scene              VARCHAR(64) NOT NULL,
    refund_amount      DECIMAL(18,4) NOT NULL DEFAULT 0,
    wallet_refund      DECIMAL(18,4) NOT NULL DEFAULT 0,
    debt_revert_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
    reason             TEXT,
    metadata           LONGTEXT,
    created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_credit_refund_charge (charge_id),
    CONSTRAINT fk_credit_refund_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  'CREATE INDEX idx_presentations_user ON presentations(user_id)',
  'CREATE INDEX idx_pres_versions_pres ON presentation_versions(presentation_id)',
  'CREATE INDEX idx_documents_owner ON documents(owner_id, is_deleted)',
  'CREATE INDEX idx_comments_doc ON comments(document_id)',
  'CREATE INDEX idx_lit_hist_user_time ON literature_history(user_id, timestamp, updated_at)',
  'CREATE INDEX idx_lit_res_user_time ON literature_results(user_id, timestamp, updated_at)',
  'CREATE INDEX idx_lit_asst_msg_user_doc_time ON literature_assistant_messages(user_id, doc_id, timestamp, created_at)',
  'CREATE INDEX idx_lit_asst_msg_user_time ON literature_assistant_messages(user_id, timestamp, created_at)',
  'CREATE INDEX idx_aippt_hist_user_time ON aippt_generation_history(user_id, timestamp, updated_at)',
  'CREATE INDEX idx_platform_notices_active_time ON platform_notices(is_active, pinned, sort_order, created_at)',
  'CREATE INDEX idx_credit_charge_user_time ON credit_charge_records(user_id, created_at)',
  'CREATE INDEX idx_credit_charge_scene_time ON credit_charge_records(scene, created_at)',
  'CREATE INDEX idx_credit_refund_user_time ON credit_refund_records(user_id, created_at)',
  'CREATE INDEX idx_credit_refund_scene_time ON credit_refund_records(scene, created_at)',
]

let initPromise = null

function _parseTimezoneOffsetMinutes(value) {
  const text = String(value || '').trim().toUpperCase()
  if (!text) return null
  if (text === 'Z' || text === 'UTC' || text === '+00:00' || text === '-00:00' || text === '+0000' || text === '-0000') {
    return 0
  }
  const match = text.match(/^([+-])(\d{2}):?(\d{2})$/)
  if (!match) return null
  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2])
  const minutes = Number(match[3])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours > 14 || minutes > 59) return null
  return sign * (hours * 60 + minutes)
}

function _pad2(value) {
  return String(value).padStart(2, '0')
}

function _formatDateWithOffset(date, offsetMinutes, keepFraction = false) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000)
  const yyyy = shifted.getUTCFullYear()
  const mm = _pad2(shifted.getUTCMonth() + 1)
  const dd = _pad2(shifted.getUTCDate())
  const hh = _pad2(shifted.getUTCHours())
  const mi = _pad2(shifted.getUTCMinutes())
  const ss = _pad2(shifted.getUTCSeconds())
  const base = `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
  if (!keepFraction) {
    return base
  }
  const ms = String(shifted.getUTCMilliseconds()).padStart(3, '0')
  return `${base}.${ms}`
}

function _toDbDateTimeString(value) {
  if (typeof value !== 'string') return value
  const isoUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?Z$/
  const m = value.match(isoUtcPattern)
  if (!m) return value

  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return value
  }

  const offsetMinutes = _parseTimezoneOffsetMinutes(config.mysql?.timezone)
  const keepFraction = Boolean(m[1])
  if (offsetMinutes === null) {
    // 兜底：无法识别时区配置时，保持原有 UTC 文本行为
    const fraction = String(m[1] || '').padEnd(3, '0').slice(0, 3)
    const base = value.slice(0, 19).replace('T', ' ')
    if (!fraction) return base
    return `${base}.${fraction}`
  }

  return _formatDateWithOffset(date, offsetMinutes, keepFraction)
}

function _normalizeParams(args) {
  const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
  return flat.map((value) => {
    if (value instanceof Date) {
      return _toDbDateTimeString(value.toISOString())
    }
    return _toDbDateTimeString(value)
  })
}

function _activeExecutor() {
  return txStorage.getStore() || pool
}

async function _ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      for (const sql of DDL_STATEMENTS) {
        try {
          await pool.query(sql)
        } catch (err) {
          // Ignore "duplicate index name" when schema already initialized.
          if (err && String(err.code) === 'ER_DUP_KEYNAME') continue
          throw err
        }
      }
    })()
  }
  return initPromise
}

async function _execute(sql, params = []) {
  await _ensureInitialized()
  const executor = _activeExecutor()
  const [rows, fields] = await executor.execute(sql, params)
  return { rows, fields }
}

const db = {
  async init() {
    await _ensureInitialized()
  },
  prepare(sql) {
    return {
      async run(...args) {
        const params = _normalizeParams(args)
        const { rows } = await _execute(sql, params)
        return {
          changes: Number(rows?.affectedRows || 0),
          lastInsertRowid: Number(rows?.insertId || 0),
        }
      },
      async get(...args) {
        const params = _normalizeParams(args)
        const { rows } = await _execute(sql, params)
        if (Array.isArray(rows) && rows.length > 0) return rows[0]
        return null
      },
      async all(...args) {
        const params = _normalizeParams(args)
        const { rows } = await _execute(sql, params)
        return Array.isArray(rows) ? rows : []
      },
    }
  },
  async exec(sql) {
    await _ensureInitialized()
    const executor = _activeExecutor()
    const [rows] = await executor.query(sql)
    return rows
  },
  transaction(fn) {
    return async (...args) => {
      await _ensureInitialized()
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        const result = await txStorage.run(conn, async () => fn(...args))
        await conn.commit()
        return result
      } catch (err) {
        try {
          await conn.rollback()
        } catch {}
        throw err
      } finally {
        conn.release()
      }
    }
  },
}

const ok = (data, message = 'success') => ({ code: 200, data, message })
const fail = (message, code = 400) => ({ code, data: null, message })

module.exports = { db, ok, fail }
