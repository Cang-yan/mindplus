<p align="center"><img src="https://docmee.cn/favicons/favicon-32x32.png" alt="logo"/></p>
<h1 align="center">文多多 AiPPT</h1>
<p align="center">
  简体中文 | <a href="./README_EN.md">English</a>
</p>

# AiPPT（Vue 版）

本仓库当前使用 **两服务架构**：

- 前端：`frontend`（Vue 3 + Vite）
- 后端：`frontend/server`（Fastify API）

根目录历史静态页模式已下线，不再作为开发或部署主链路。

## 快速开始

### 1) 安装依赖

```bash
cd /home/xx/LINGINE/mindplus/core-service
npm run frontend:install
npm run frontend:server:install
```

### 2) 启动开发环境

```bash
npm run dev
```

默认访问：

- 前端：`http://localhost:5173/slide/`
- 后端健康检查：`http://127.0.0.1:3001/health`

### 3) 常用命令

```bash
# 仅前端
npm run frontend:dev

# 仅后端
npm run frontend:server:dev

# 前端构建（产物输出到 frontend/slide）
npm run frontend:build

# 安全检查（密钥泄露扫描）
npm run security:check
```

## 配置说明

### 前端运行时配置

前端使用 `window.__APP_CONFIG__`（由 `frontend/public/runtime-config.js` 注入），部署时可用脚本生成：

```bash
cd /home/xx/LINGINE/mindplus/core-service/frontend
bash tools/generate-runtime-config.sh /your/deploy/dir
```

### 后端配置

统一配置模板位于：`.env.example`（项目根目录），实际本地配置文件使用根目录 `.env`（前端 + 后端共用）。

## 部署建议（生产）

- Nginx 托管 `frontend/slide`（路径前缀 `/slide/`）
- Fastify 仅提供 API
- 参考：`deploy/nginx.aippt.conf.example`

反代路径建议：

- `/api` `/documents` `/comments` `/ai` `/upload` `/parse` `/user` `/admin` `/uploads`

历史静态入口兼容跳转（建议保留至少一个发布周期）：

- `/` -> `/slide/portal`
- `/index.html` -> `/slide/portal`
- `/ppt2json.html` -> `/slide/ai-create/workspace`

## 迁移状态

- 已下线：根目录静态服务链路（`index.html`、`ppt2json.html`、`static/`）
- 已保留：Vue 侧 `frontend/public/legacy-static` 资源（供工作流预览渲染使用）
- 资产迁移：模板封面兜底路径迁移到 `frontend/public/template_pic`

## 更多文档

- 启动说明：`README.startup.md`
- 架构说明：`frontend/tech/architecture.md`
- 静态下线清单：`docs/static-decommission-checklist.md`
