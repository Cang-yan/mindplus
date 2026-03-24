# Core Service（readme-v2）

## 1. 项目定位

`core-service` 是 MindPlus 的主业务工作区，采用“前端 + 后端”双服务结构：
- 前端：`frontend`（Vue 3 + Vite）
- 后端：`frontend/server`（Fastify + MySQL）

它负责承接用户在 MindPlus 的主要业务流程：
- AI PPT 生成工作流
- 幻灯片编辑与文档管理
- 文献翻译与文献辅助编撰入口
- 与 MindUser 的登录态联动
- 与 OpenDraft 的论文编撰代理联动
- 按业务场景执行 credits 扣费/退款

## 2. 功能概览

### 2.1 用户与会话

- 登录桥接：前端 `/login` 页面跳转 MindUser 登录页
- 登录回调：`/auth/callback` 解析 token 并回写本地状态
- 后端 JWT 校验：Fastify 统一鉴权中间件
- MindUser 账号状态二次校验（可缓存）

### 2.2 AI PPT 工作流

- 主题输入 -> 大纲流式生成 -> 模板选择 -> 生成与预览
- 支持模板封面本地兜底路径（`/slide/template_pic/*`）
- 生成历史持久化：按用户保留最近记录

### 2.3 文档与协作内容

- 演示文稿管理（列表、创建、更新、删除、复制）
- 文档内容分层存储（slide / mindmap / sheet）
- 评论、版本对比与回溯
- 上传文件与导入解析接口

### 2.4 文献能力

- 文献翻译（OCR + 翻译）历史与结果落库
- 文献辅助编撰会话消息存储
- OpenDraft 任务代理（创建、状态、流式、下载、取消、重试）

### 2.5 计费能力

- 按场景扣费：PPT、文献翻译、文献编撰等
- 失败补偿：支持退款流水
- 支持钱包优先扣减、透支额度控制、价格配置化

## 3. 架构总览

```text
Browser (Vue SPA)
  -> Fastify API (frontend/server)
      -> MySQL (mindplus)
      -> MindUser (auth/profile/wallet)
      -> OpenDraft (paper generation)
```

关键说明：
- 前端与后端共享 `core-service/.env` 作为主配置源（后端通过 `load-env.js` 读取）
- OpenDraft 作为独立服务运行，core-service 通过 `/api/opendraft/*` 进行代理转发
- 前端的运行时配置支持 `window.__APP_CONFIG__` 覆盖构建时变量

## 4. 目录说明

```text
core-service/
├── package.json                 # 工作区脚本（dev / build / security:check）
├── .env.example                 # 统一配置模板
├── frontend/
│   ├── src/
│   │   ├── views/               # 页面（AI PPT、文献、登录回调、编辑器）
│   │   ├── router/              # 路由与鉴权守卫
│   │   ├── api/                 # 前端 API 封装
│   │   ├── utils/               # 业务工具（导入导出、认证、配置读取）
│   │   ├── agents/              # 轻量 Agent/Skill 架构
│   │   └── locales/             # 国际化文案
│   ├── public/                  # 静态资源（含 runtime-config、template_pic）
│   ├── slide/                   # 前端构建产物目录
│   ├── vite.config.js           # base/outDir/proxy/环境注入
│   └── server/
│       ├── server.js            # Fastify 入口
│       ├── config.js            # 后端配置解析
│       ├── db.js                # MySQL 连接与 DDL 初始化
│       ├── routes/              # 路由模块
│       └── services/            # 计费等业务服务
└── scripts/
    ├── dev-aippt.mjs            # 本地一键并行启动前后端
    └── security-check.sh        # 安全扫描脚本
```

## 5. 前端架构要点

### 5.1 路由与页面分层

- 路由入口：`frontend/src/router/index.js`
- 核心页面：
  - `/portal`：门户首页
  - `/aippt`、`/ai-create`、`/ai-create/workspace`：AI PPT 主流程
  - `/literature`、`/literature/workspace`、`/literature-assistant`：文献模块
  - `/slide/:docId`：编辑页
  - `/login`、`/auth/callback`：登录桥接与回调

### 5.2 配置读取策略

- 统一通过 `getRuntimeConfig` 读取
- 优先级：`window.__APP_CONFIG__` > `import.meta.env`
- 便于在不改前端源码的前提下覆盖运行时配置

### 5.3 AI Agent（前端侧）

`frontend/src/agents` 提供轻量技能编排：
- `AgentOrchestrator`：技能调度入口
- `SkillRegistry`：关键词匹配与技能注册
- `ContextManager`：对话上下文管理（轮数上限、摘要、历史过滤）

## 6. 后端架构要点

### 6.1 服务入口与中间件

- 入口：`frontend/server/server.js`
- 内置中间件：CORS、JWT、multipart、rate-limit、静态上传目录
- 健康检查：`GET /health`

### 6.2 路由分组（按业务域）

- 认证与用户：`/api/auth`、`/user`、`/admin`
- 演示文稿：`/api/presentations`
- 文档与评论：`/documents`、`/comments`
- 模板：`/api/templates`
- AI 与语音：`/ai`、`/api/coze`、`/api/speech`
- 文件上传/转换：`/upload`
- 文献：`/api/literature`
- AIPPT 历史：`/api/aippt`
- OpenDraft 代理：`/api/opendraft`
- 计费：`/api/billing`
- 公告：`/api/notices`

### 6.3 数据库

- MySQL 连接池在 `db.js` 初始化
- 启动时执行关键 DDL（幂等）
- 重点表：
  - 用户/认证：`users`、`verification_codes`
  - 编辑与文档：`presentations`、`presentation_versions`、`documents`、`comments`
  - 文献：`literature_history`、`literature_results`、`literature_assistant_messages`
  - AIPPT：`aippt_generation_history`
  - 计费：`credit_*`
  - OpenDraft：`opendraft_papers`、`theses`

## 7. 与外部服务关系

### 7.1 MindUser（登录与钱包）

- 前端：登录跳转、回调解析、个人中心跳转
- 后端：
  - 账号状态校验（auth/me）
  - 钱包余额查询、扣费、退款

### 7.2 OpenDraft（文献编撰）

- core-service 不直接实现论文编写引擎
- 通过代理路由统一透传、鉴权、错误处理与计费控制
- 支持 legacy 路由兼容，降低迁移风险

## 8. 配置体系

统一以根目录 `.env` 为主（`core-service/.env`）：
- 服务监听：`VITE_BACKEND_HOST`、`VITE_BACKEND_PORT`
- 鉴权：`JWT_SECRET`、`MINDUSER_JWT_SECRET`
- 数据库：`MYSQL_*`
- MindUser：`VITE_MINDUSER_BASE_URL`、`VITE_MINDUSER_SERVICE_KEY`
- OpenDraft：`OPENDRAFT_SERVICE_BASE_URL`
- 计费：`BILLING_*`
- AI 通道：`VITE_OPENAI_BASE_URL`、`ASSISTANT_AI_KEY`、`OCR_AI_KEY` 等

## 9. 开发常用命令

```bash
cd /home/xx/LINGINE/mindplus/core-service

# 安装依赖
npm run frontend:install
npm run frontend:server:install

# 一键启动前后端开发
npm run dev

# 分开启动
npm run frontend:dev
npm run frontend:server:dev

# 前端构建
npm run frontend:build

# 安全检查
npm run security:check
```

## 10. 文档边界说明

本文件聚焦“架构与能力认知”，不覆盖：
- 生产部署流程
- 全量 API 明细
- OpenDraft 子项目内部实现细节

若要看部署，请使用：`/home/xx/LINGINE/mindplus/docs/DEPLOY_OPS_RUNBOOK.md`
