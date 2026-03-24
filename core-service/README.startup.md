# AiPPT 启动说明（Vue 双服务）

本项目已从“根目录静态页 + Vue + 后端”收敛为 **两服务架构**：

- 前端：`frontend`（Vite，默认 `http://localhost:5173/slide/`）
- 后端：`frontend/server`（Fastify API，默认 `http://127.0.0.1:3001`）

> 根目录静态页模式已下线，`npm start` / `npm run dev:static` 仅保留废弃提示。

## 1) 首次安装依赖

```bash
cd /home/xx/LINGINE/mindplus/core-service
npm run frontend:install
npm run frontend:server:install
```

## 2) 日常开发（前后端一起）

```bash
cd /home/xx/LINGINE/mindplus/core-service
npm run dev
```

停止服务：

- 在同一个终端按 `Ctrl + C`

## 3) 常用命令

```bash
# 仅前端
npm run frontend:dev

# 仅后端
npm run frontend:server:dev

# 前端构建（输出到 frontend/slide）
npm run frontend:build

# 安全检查（密钥/配置泄露扫描）
npm run security:check
```

## 4) 健康检查

执行完 `npm run dev` 后：

```bash
curl -i http://127.0.0.1:3001/health
```

预期：HTTP `200`，返回 `{"status":"ok", ...}`。

## 5) 生产部署（推荐）

- Nginx 托管前端构建产物：`/slide/*`
- Fastify 仅提供 API
- 参考配置：`deploy/nginx.aippt.conf.example`

关键反代路径：

- `/api` `/documents` `/comments` `/ai` `/upload` `/parse` `/user` `/admin`

历史入口兼容跳转（建议保留至少一个发布周期）：

- `/` -> `/slide/portal`
- `/index.html` -> `/slide/portal`
- `/ppt2json.html` -> `/slide/ai-create/workspace`

## 6) 常见问题

### A) 登录后接口报 `401/500`

优先确认后端是否启动，以及 JWT 配置是否与 MindUser 一致：

- 根目录 `.env` 中 `MINDUSER_JWT_SECRET`
- MindUser 服务中的 `JWT_SECRET`

### B) 缺少后端依赖（如 `Cannot find module 'fastify'`）

```bash
cd /home/xx/LINGINE/mindplus/core-service
npm run frontend:server:install
```
