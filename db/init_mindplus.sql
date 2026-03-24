-- MindPlus unified MySQL initialization
-- Usage:
--   mysql -h 127.0.0.1 -P 3306 -u root -p < /path/to/init_mindplus.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS mindplus
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mindplus;

CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(64) PRIMARY KEY,
  email       VARCHAR(255) UNIQUE,
  username    VARCHAR(255) NOT NULL,
  password    TEXT,
  role        VARCHAR(32) NOT NULL DEFAULT 'user',
  avatar      TEXT,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verification_codes (
  email       VARCHAR(255) NOT NULL,
  code        VARCHAR(32) NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  used        TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (email, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY idx_presentations_user (user_id),
  CONSTRAINT fk_presentations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY idx_pres_versions_pres (presentation_id),
  CONSTRAINT fk_pres_versions_pres FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY idx_documents_owner (owner_id, is_deleted),
  CONSTRAINT fk_documents_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id          VARCHAR(64) PRIMARY KEY,
  document_id VARCHAR(64) NOT NULL,
  user_id     VARCHAR(64) NOT NULL,
  content     TEXT NOT NULL,
  target_text TEXT,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_comments_doc (document_id),
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS templates (
  id          VARCHAR(64) PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  category    VARCHAR(64) NOT NULL DEFAULT 'general',
  source      VARCHAR(64) NOT NULL DEFAULT 'system',
  thumbnail   TEXT,
  content     LONGTEXT,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS literature_history (
  id           VARCHAR(128) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  source_type  VARCHAR(32) NOT NULL,
  record_id    VARCHAR(191) NOT NULL,
  doc_id       VARCHAR(191),
  title        VARCHAR(255) NOT NULL DEFAULT '未命名记录',
  subtitle     TEXT,
  `timestamp`  BIGINT NOT NULL DEFAULT 0,
  payload      LONGTEXT,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_lit_hist_user_source_record (user_id, source_type, record_id),
  KEY idx_lit_hist_user_time (user_id, `timestamp`, updated_at),
  CONSTRAINT fk_lit_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS literature_results (
  id                     VARCHAR(128) PRIMARY KEY,
  user_id                VARCHAR(64) NOT NULL,
  source_type            VARCHAR(32) NOT NULL,
  record_id              VARCHAR(191) NOT NULL,
  doc_id                 VARCHAR(191),
  title                  VARCHAR(255) NOT NULL DEFAULT '未命名记录',
  subtitle               TEXT,
  `timestamp`            BIGINT NOT NULL DEFAULT 0,
  file_name              TEXT,
  file_size              BIGINT,
  file_type              VARCHAR(64),
  target_language        VARCHAR(32),
  translation_model_name VARCHAR(128),
  translation_model_id   VARCHAR(128),
  payload                LONGTEXT,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_lit_res_user_source_record (user_id, source_type, record_id),
  KEY idx_lit_res_user_time (user_id, `timestamp`, updated_at),
  CONSTRAINT fk_lit_results_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS literature_assistant_messages (
  id           VARCHAR(128) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  doc_id       VARCHAR(191) NOT NULL,
  role         VARCHAR(32) NOT NULL,
  content      LONGTEXT NOT NULL,
  content_json TINYINT(1) NOT NULL DEFAULT 0,
  metadata     LONGTEXT,
  `timestamp`  BIGINT NOT NULL DEFAULT 0,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_lit_asst_msg_user_doc_time (user_id, doc_id, `timestamp`, created_at),
  KEY idx_lit_asst_msg_user_time (user_id, `timestamp`, created_at),
  CONSTRAINT fk_lit_asst_msg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_trial_usage (
  user_id   VARCHAR(64) NOT NULL,
  `date`    DATE NOT NULL,
  `count`   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_overdraft_accounts (
  user_id     VARCHAR(64) PRIMARY KEY,
  debt        DECIMAL(18,4) NOT NULL DEFAULT 0,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_credit_overdraft_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY idx_credit_charge_user_time (user_id, created_at),
  KEY idx_credit_charge_scene_time (scene, created_at),
  CONSTRAINT fk_credit_charge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY idx_credit_refund_user_time (user_id, created_at),
  KEY idx_credit_refund_scene_time (scene, created_at),
  CONSTRAINT fk_credit_refund_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opendraft_papers (
  job_id        VARCHAR(64) PRIMARY KEY,
  topic         TEXT NOT NULL,
  status        VARCHAR(32) NOT NULL,
  user_id       VARCHAR(64) NULL,
  language      VARCHAR(32) NULL,
  level         VARCHAR(32) NULL,
  extra_payload LONGTEXT NULL,
  created_at    DOUBLE NOT NULL,
  updated_at    DOUBLE NOT NULL,
  KEY idx_opendraft_papers_user_time (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS theses (
  id               VARCHAR(64) PRIMARY KEY,
  user_id          VARCHAR(64) NULL,
  topic            TEXT NULL,
  status           VARCHAR(32) NULL DEFAULT 'pending',
  current_phase    VARCHAR(32) NULL,
  progress_percent INT NOT NULL DEFAULT 0,
  progress_details JSON NULL,
  sources_count    INT NULL,
  chapters_count   INT NULL,
  error_message    TEXT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_theses_user_time (user_id, updated_at),
  KEY idx_theses_status_time (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
