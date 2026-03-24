# AiPPT 对接 LinkAPI（Docmee）接口说明（Vue 架构）

> 适用目录：`frontend/`  
> 当前架构：Vue 前端 + Fastify 后端（根目录静态页已下线）

## 1) 当前调用链结论

主项目中与 Docmee/LinkAPI 相关的调用入口在：

- `frontend/src/api/main-ppt.js`
- 由页面 `frontend/src/views/ai-create.vue`、`frontend/src/views/ai-create-workspace.vue` 使用

接口地址与鉴权来自运行时配置：

- `VITE_PPT_BASE_URL`
- `VITE_PPT_API_KEY`
- `VITE_PPT_API_PREFIX`（默认 `/docmee/v1/api/ppt`）
- `VITE_PPT_JSON_API_PREFIX`（默认 `/docmee/v1/api/pptjson`）

## 2) 已使用接口

| 功能 | Method | 默认路径 |
|---|---|---|
| 生成大纲（流式） | `POST` | `/generateOutline` |
| 随机模板 | `POST` | `/randomTemplates` |
| 生成内容（流式） | `POST` | `/generateContent` |
| 异步任务结果 | `GET` | `/asyncPptInfo` |
| JSON 转 PPT | `POST` | `/json2ppt` |
| PPT 转 JSON | `POST` | `/ppt2json` |

> 实际完整 URL 由 `VITE_PPT_BASE_URL + VITE_PPT_API_PREFIX` 组装。

## 3) LinkAPI 映射建议

若你的 LinkAPI 与 Docmee 语义兼容，可直接映射到：

- `${VITE_PPT_BASE_URL}/docmee/v1/api/ppt/generateOutline`
- `${VITE_PPT_BASE_URL}/docmee/v1/api/ppt/randomTemplates`
- `${VITE_PPT_BASE_URL}/docmee/v1/api/ppt/generateContent`
- `${VITE_PPT_BASE_URL}/docmee/v1/api/ppt/asyncPptInfo`
- `${VITE_PPT_BASE_URL}/docmee/v1/api/ppt/json2ppt`
- `${VITE_PPT_BASE_URL}/docmee/v1/api/pptjson/ppt2json`

## 4) 兼容性检查重点

1. `generateOutline` / `generateContent` 是否返回标准 SSE 文本块（`data: ...\n\n`）
2. `asyncPptInfo.data.pptxProperty` 是否为 `base64 + gzip`
3. `json2ppt` 是否返回 `application/vnd.openxmlformats-officedocument.presentationml.presentation`
4. 鉴权是否兼容 `Authorization: Bearer <API_KEY>`

## 5) 配置示例（AiPPT/.env）

```bash
VITE_PPT_BASE_URL=https://api.linkapi.org
VITE_PPT_API_KEY=YOUR_API_KEY
VITE_PPT_API_PREFIX=/docmee/v1/api/ppt
VITE_PPT_JSON_API_PREFIX=/docmee/v1/api/pptjson
```
