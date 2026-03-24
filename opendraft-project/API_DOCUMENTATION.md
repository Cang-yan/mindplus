# OpenDraft HTTP API Documentation

This document lists all HTTP interfaces exposed by the current project (`app.py`) for integration use.

## 1. Basic Information

- Service default address: `http://localhost:18080`
- Protocol: `HTTP`
- Auth: none
- Request body format (when required): `application/json`
- Response format:
  - Most endpoints: `application/json`
  - `/api/stream/<job_id>`: `text/event-stream` (SSE)
  - `/api/preview/<job_id>`: `text/html`
  - `/api/download/<job_id>/<fmt>`: file stream (attachment)

## 2. Recommended Integration Flow

1. Call `POST /api/outline` to generate outline.
2. Let user edit/confirm outline, then call `POST /api/generate` (pass `outline`).
3. Subscribe to `GET /api/stream/<job_id>` for real-time progress.
4. If stream pushes `outline_review` or `chapter_review`, call `POST /api/approve/<job_id>` to continue.
5. Query `GET /api/status/<job_id>` for recovery/reconnect.
6. After completion, fetch content via `GET /api/md/<job_id>` or download via `GET /api/download/<job_id>/<fmt>`.

## 3. Common Data Structures

### 3.1 Job Status

Possible values seen in code:

- `pending`
- `running`
- `outline_review`
- `chapter_review`
- `done`
- `error`

### 3.2 Step Item (from `/api/status` and SSE `step`)

```json
{
  "phase": "writing",
  "label": "Introduction complete",
  "msg": "Introduction complete"
}
```

`phase` values in current implementation:

- `init`
- `research`
- `outline`
- `writing`
- `compile`
- `export`
- `done`

### 3.3 Common Error Body

```json
{
  "error": "Error message"
}
```

## 4. Endpoint List

## 4.1 `GET /`

Serve frontend page.

### Success Response

- Status: `200`
- Body: static HTML (`static/index.html`)

---

## 4.2 `POST /api/outline`

Generate paper outline quickly using model.

### Request Body

```json
{
  "topic": "Impact of AI on modern education",
  "language": "zh",
  "level": "research_paper",
  "target_words": "5000",
  "target_citations": "20"
}
```

### Fields

- `topic` (string, required): research topic
- `language` (string, optional, default `zh`): `zh|en|de|fr|es|ja`
- `level` (string, optional, default `research_paper`): `research_paper|bachelor|master|phd`
- `target_words` (string/number, optional)
- `target_citations` (string/number, optional)

### Success Response

- Status: `200`

```json
{
  "outline": "## Chapter 1 ...",
  "thinking": "- Point 1\n- Point 2"
}
```

### Error Responses

- `400`: `{"error":"Topic is required"}`
- `500`: model/internal error

---

## 4.3 `POST /api/generate`

Start full paper generation job (async).

### Request Body

```json
{
  "topic": "Impact of AI on modern education",
  "language": "zh",
  "level": "research_paper",
  "target_words": "5000",
  "target_citations": "20",
  "formats": ["pdf", "docx", "md"],
  "outline": "## Chapter 1 ...",
  "blurb": "Focus on higher education use cases",
  "author_name": "Alice",
  "institution": "Example University",
  "department": "Education",
  "faculty": "School of Education",
  "advisor": "Prof. Smith",
  "second_examiner": "Prof. Wang",
  "location": "Shanghai",
  "student_id": "20260001"
}
```

### Fields

- `topic` (string, required)
- `language` (string, optional, default `zh`)
- `level` (string, optional, default `research_paper`)
- `target_words` (optional)
- `target_citations` (optional)
- `formats` (string array, optional, default `["pdf","docx","md"]`)
- `outline` (string, optional): if provided, backend skips outline review pause
- `blurb`, `author_name`, `institution`, `department`, `faculty`, `advisor`, `second_examiner`, `location`, `student_id` (all optional)

### Success Response

- Status: `200`

```json
{
  "job_id": "0b6d4f1c8f2040f7a0f26f7f66de1234"
}
```

### Error Responses

- `400`: `{"error":"Topic is required"}`

---

## 4.4 `POST /api/approve/<job_id>`

Resume paused job (`outline_review` or `chapter_review`).

### Path Params

- `job_id` (string): job ID from `/api/generate`

### Request Body (optional)

```json
{
  "content": "Edited outline markdown"
}
```

If current status is `outline_review`, `content` will be written back to outline draft before resuming.

### Success Response

- Status: `200`

```json
{
  "ok": true
}
```

### Error Responses

- `404`: `{"error":"Job not found"}`
- `400`: `{"error":"No gate found"}`

---

## 4.5 `GET /api/status/<job_id>`

Get latest job snapshot (polling/recovery friendly).

### Path Params

- `job_id` (string)

### Success Response

- Status: `200`

```json
{
  "status": "running",
  "log": ["Loading AI model", "Starting academic research"],
  "steps": [
    { "phase": "init", "label": "Loading AI model", "msg": "Loading AI model" }
  ],
  "pdf": null,
  "docx": null,
  "md": null,
  "topic": "Impact of AI on modern education",
  "start_time": 1774145224.391,
  "outline": null,
  "review_chapter": null,
  "review_content": null
}
```

Note:

- Internal fields starting with `_` are removed.
- In `steps`, field `time` is removed before return.

### Error Responses

- `404`: `{"error":"Job not found"}`

---

## 4.6 `GET /api/stream/<job_id>`

SSE stream for real-time logs/steps/review events.

### Path Params

- `job_id` (string)

### Response

- Status: `200`
- Content-Type: `text/event-stream`
- Headers include:
  - `Cache-Control: no-cache`
  - `X-Accel-Buffering: no`

### SSE Payload Types

`log`:

```json
{ "type": "log", "msg": "Starting academic research" }
```

`step`:

```json
{ "type": "step", "phase": "research", "label": "Starting research", "msg": "Starting academic research" }
```

`outline_review`:

```json
{ "type": "outline_review", "outline": "## ...", "chapters_count": 6 }
```

`chapter_review`:

```json
{ "type": "chapter_review", "chapter": "01_chapter", "chapter_name": "Introduction", "content": "..." }
```

`done`:

```json
{ "type": "done", "status": "done", "pdf": "/tmp/...", "docx": "/tmp/...", "md": "/tmp/...", "error": null }
```

When job does not exist, stream sends one event then closes:

```json
{ "error": "job not found" }
```

### Client Example

```javascript
const es = new EventSource(`/api/stream/${jobId}`);
es.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log(data);
};
```

---

## 4.7 `GET /api/preview/<job_id>`

Return rendered HTML preview page from generated markdown.

### Path Params

- `job_id` (string)

### Success Response

- Status: `200`
- Body: HTML document (print-friendly preview)

### Error Responses

- `404`: `{"error":"Job not found"}`
- `404`: `{"error":"Markdown file not available"}`

---

## 4.8 `GET /api/download/<job_id>/<fmt>`

Download generated file.

### Path Params

- `job_id` (string)
- `fmt` (string): `pdf|docx|md`

### Success Response

- Status: `200`
- Body: file attachment stream

### Error Responses

- `400`: `{"error":"Invalid format"}`
- `404`: `{"error":"Job not found"}`
- `404`: `{"error":"PDF not available"}` / `{"error":"DOCX not available"}` / `{"error":"MD not available"}`

---

## 4.9 `GET /api/md/<job_id>`

Get generated markdown content.

### Path Params

- `job_id` (string)

### Success Response

- Status: `200`

```json
{
  "content": "# Title\n\n..."
}
```

### Error Responses

- `404`: `{"error":"Job not found"}`
- `404`: `{"error":"Markdown not available yet"}`

---

## 4.10 `POST /api/save/<job_id>`

Save markdown content back to generated markdown file.

### Path Params

- `job_id` (string)

### Request Body

```json
{
  "content": "# Updated Title\n\nUpdated content..."
}
```

### Success Response

- Status: `200`

```json
{
  "ok": true
}
```

### Error Responses

- `404`: `{"error":"Job not found"}`
- `404`: `{"error":"No markdown file"}`

---

## 4.11 `POST /api/chat`

AI-assisted section rewrite endpoint.

### Request Body

```json
{
  "message": "Make this section more concise",
  "current_content": "## Section\nLong content...",
  "section_name": "Introduction",
  "language": "zh"
}
```

### Fields

- `message` (string, required): rewrite instruction
- `current_content` (string, optional): current markdown content
- `section_name` (string, optional)
- `language` (string, optional, default `zh`): `zh|en|de|fr|es|ja`

### Success Response

- Status: `200`

```json
{
  "content": "## Section\nRewritten content..."
}
```

### Error Responses

- `400`: `{"error":"Message is required"}`
- `500`: model/internal error

---

## 4.12 `GET /api/sections/<job_id>`

List draft section markdown files under `/tmp/opendraft_<job_id>/drafts`.

### Path Params

- `job_id` (string)

### Success Response

- Status: `200`

```json
[
  {
    "name": "01_chapter_introduction",
    "path": "/tmp/opendraft_xxx/drafts/01_chapter_introduction.md",
    "size": 18342
  }
]
```

If draft folder does not exist, returns empty array:

```json
[]
```

---

## 4.13 `GET /api/sections/<job_id>/<section_name>`

Read one specific section content by fuzzy matching file stem (`section_name in file_stem`).

### Path Params

- `job_id` (string)
- `section_name` (string)

### Success Response

- Status: `200`

```json
{
  "content": "## ...",
  "path": "/tmp/opendraft_xxx/drafts/formatted_outline.md"
}
```

Note:

- If multiple files match, backend prefers file name containing `formatted`.

### Error Responses

- `404`: `{"error":"Section not found"}`

---

## 4.14 `PUT /api/sections/<job_id>/<section_name>`

Save specific section file content by fuzzy matching file stem (`section_name in file_stem`).

### Path Params

- `job_id` (string)
- `section_name` (string)

### Request Body

```json
{
  "content": "## Updated section"
}
```

### Success Response

- Status: `200`

```json
{
  "ok": true
}
```

### Error Responses

- `404`: `{"error":"Section not found"}`

---

## 4.15 `GET /api/papers`

List persisted paper records from MySQL table `opendraft_papers`.

### Success Response

- Status: `200`

```json
[
  {
    "job_id": "0b6d4f1c8f2040f7a0f26f7f66de1234",
    "topic": "Impact of AI on modern education",
    "status": "running",
    "created_at": 1774145224.391,
    "updated_at": 1774145238.124,
    "language": "zh",
    "level": "research_paper",
    "pdf": null,
    "docx": null,
    "md": null
  }
]
```

Note:

- For in-memory running jobs, status may be updated on the fly before response.

---

## 4.16 `DELETE /api/papers/<job_id>`

Delete one paper record from MySQL table `opendraft_papers`.

### Path Params

- `job_id` (string)

### Success Response

- Status: `200`

```json
{
  "ok": true
}
```

---

## 4.17 `DELETE /api/users/<user_id>/attachments`

Alias: `DELETE /api/opendraft/users/<user_id>/attachments`

Delete affiliated OpenDraft data by `user_id`.

### Path Params

- `user_id` (string, required)

### Auth/Ownership

- The caller identity must match `user_id` (resolved from one of body/query/header `uid/user_id/userId`, token, or authorization header).
- If mismatch, returns `403 Forbidden`.

### Optional Params

- `purge_files` (bool-like, optional, default `true`)
  - Can be passed via query or JSON body.
  - `false/0/no/off` means do NOT delete `/tmp/opendraft_<job_id>` directories.

### Success Response

- Status: `200`

```json
{
  "ok": true,
  "user_id": "JLQTNVLZYB",
  "deleted_paper_records": 3,
  "deleted_in_memory_jobs": 1,
  "purged_files": true,
  "deleted_output_dirs": 2,
  "cleanup_failures": []
}
```

### Error Responses

- `400`: `{"error":"user_id is required"}`
- `403`: `{"error":"Forbidden"}`

## 5. cURL Quick Examples

### Generate outline

```bash
curl -X POST http://localhost:18080/api/outline \
  -H "Content-Type: application/json" \
  -d '{"topic":"AI in education","language":"en","level":"research_paper"}'
```

### Start generation

```bash
curl -X POST http://localhost:18080/api/generate \
  -H "Content-Type: application/json" \
  -d '{"topic":"AI in education","language":"en","outline":"## Chapter 1..."}'
```

### Subscribe SSE

```bash
curl -N http://localhost:18080/api/stream/<job_id>
```

### Approve pause point

```bash
curl -X POST http://localhost:18080/api/approve/<job_id> \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Get status

```bash
curl http://localhost:18080/api/status/<job_id>
```

### Delete user attachments by user id

```bash
curl -X DELETE "http://localhost:18080/api/opendraft/users/JLQTNVLZYB/attachments?token=<JWT>&purge_files=true"
```
