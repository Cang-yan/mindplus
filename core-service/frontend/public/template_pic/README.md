# template_pic

This directory is the Vue-front-end owned fallback location for template cover images.

- Public URL base: `/slide/template_pic/`
- Source of truth: deployment asset sync or CDN mirror
- Keep this directory in `frontend/public` to avoid relying on the repository root `template_pic/` path

If local files are missing, the UI falls back to remote `coverUrl` values returned by the API.
