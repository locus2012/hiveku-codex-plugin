---
name: hiveku-ship
description: "Ship a change to a Hiveku website project safely — save, verify, deploy, and confirm the live site actually serves. Use for any deploy to development / staging / production."
---
Hiveku hosts website projects on its own VCS + serverless CDN (no GitHub required). **Commit ≠ live.**

## The safe flow
1. **Resolve the project.** `list_projects` / `get_project` → the `project_id`. Most project tools need it.
2. **Know what's current before you edit** (`project_version_log`) — you are not the only writer.
3. **Save code in ONE bulk call**, not N singles: `project_files_bulk_save`. This is the default and it
   works for essentially everything, including large trees (batch it). SVGs are **text** — save with
   `utf-8` (the default), NEVER base64: an SVG pasted into a base64 field is rejected (and previously
   produced a 6-byte file). Binaries (png/jpg/woff/...) go through `assets_upload` as real base64.
   ALWAYS `dry_run: true` before any `delete_missing`, and read the would-delete list.
   - **Presigned lanes (`project_import_presign`, `project_files_presign`) upload from YOUR machine
     directly to S3, so they can fail with `403 ... explicit deny ...` even though the presign call
     succeeded** — the URL is signed server-side but the PUT comes from your IP, which the platform's
     network controls may refuse. If you hit that: do NOT retry the lane. Fall back to
     `project_files_bulk_save` (code) + `assets_upload` (binaries), which upload *through* the API and
     are unaffected, and report the 403 to Hiveku with the bucket name.
4. **Verify before shipping**: `verify_typecheck` / `verify_lint` / `project_test_build`. On a failed
   build read `project_build_error_get` + `preview_logs`. A framework project MUST include its root
   files (package.json, next.config.*, tsconfig.json) — without package.json Hiveku classifies it as a
   static site and would ship raw source (403).
5. **Version + deploy**: `project_vcs_commit` (on `main`), then
   `deploy_site({ project_id, environment })` — **development first**, then production. A real build
   takes minutes; a sub-minute "build" means it took the static path.
6. **READ the deploy response `warnings[]`.** Every deploy is smoke-verified — the pipeline requests the
   live URL through the CDN and only reports success if real routes serve. Act on:
   - `reserved_cdn_prefix_page_collision` → a PAGE route sits under a reserved CDN asset prefix
     (`videos/`, `media/`, `images/`, `img/`, `icons/`, `documents/`, `fonts/`, `audio/`, `screenshots/`,
     `brand/`, …) and WILL 403 on the deployed URL. Rename the route (e.g. `/videos` → `/video`). See
     `hiveku_docs_get("Reserved CDN Asset Path Prefixes")`.
   - A deploy that FAILS with "live site FAILS verification" → the artifacts shipped but the site is not
     serving. Do NOT blindly retry (it reproduces the same result). Switch to the
     `hiveku-diagnose-deploy` skill.
7. **Confirm** the live URL returns 200 (allow a few minutes for CDN propagation on a first production
   deploy). Reserve production for go-live; iterate on development.

Deep flows: `hiveku_playbook_get("deploy-without-github")`, `("files-crud")`, `("rollback-a-file")`.
