<p align="center"><img src="https://docmee.cn/favicons/favicon-32x32.png" alt="logo"/></p>
<h1 align="center">Docmee AiPPT</h1>
<p align="center">
  <a href="./README.md">简体中文</a> | English
</p>

# AiPPT (Vue Edition)

This repository now runs on a **two-service architecture**:

- Frontend: `frontend` (Vue 3 + Vite)
- Backend: `frontend/server` (Fastify API)

The legacy root static-page mode has been decommissioned and is no longer part of the primary workflow.

## Quick Start

### 1) Install dependencies

```bash
cd /home/xx/LINGINE/mindplus/core-service
npm run frontend:install
npm run frontend:server:install
```

### 2) Start development

```bash
npm run dev
```

Default endpoints:

- Frontend: `http://localhost:5173/slide/`
- Backend health: `http://127.0.0.1:3001/health`

### 3) Common commands

```bash
# Frontend only
npm run frontend:dev

# Backend only
npm run frontend:server:dev

# Frontend build (output: frontend/slide)
npm run frontend:build

# Security check (secret scan)
npm run security:check
```

## Configuration

### Frontend runtime config

Frontend reads config through `getRuntimeConfig`:

- First from `window.__APP_CONFIG__` (defined in `frontend/public/runtime-config.js`)
- Falls back to Vite build-time `import.meta.env` when runtime values are empty

`tools/generate-runtime-config.sh` has been removed, so no extra runtime generation step is required.

### Backend config

Unified template: root `.env.example`; actual local config file is root `.env` (shared by frontend + backend).

## Production Deployment

- Serve `frontend/slide` via Nginx under `/slide/`
- Keep Fastify as API-only service
- Nginx example: `deploy/nginx.aippt.conf.example`

Recommended reverse-proxy routes:

- `/api` `/documents` `/comments` `/ai` `/upload` `/parse` `/user` `/admin` `/uploads`

Legacy entry redirects (keep for at least one release window):

- `/` -> `/slide/portal`
- `/index.html` -> `/slide/portal`
- `/ppt2json.html` -> `/slide/ai-create/workspace`

## Migration Status

- Removed: root static chain (`index.html`, `ppt2json.html`, `static/`)
- Kept: Vue-side legacy renderer assets in `frontend/public/legacy-static`
- Asset migration: template-cover fallback path moved to `frontend/public/template_pic`

## More Docs

- Startup guide: `README.startup.md`
- Architecture: `frontend/tech/architecture.md`
- Decommission checklist: `docs/static-decommission-checklist.md`
