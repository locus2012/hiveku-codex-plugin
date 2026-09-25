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
5. **Version + deploy**: `project_vcs_commit` (default `main`; pass `branch` to version work
   off to the side without touching the live project — merge later with `project_vcs_merge`,
   whose `into` targets any branch, or atomically via `project_vcs_pr_create` +
   `project_vcs_pr_merge`), then
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
7. **Confirm** the live URL returns 200 - from a terminal send `-A 'Hiveku-Session/1.0 (+https://hiveku.com)'`
   or use `curl -I`; a 202 with an empty body, or a 403 with `x-hiveku-firewall: blocked`, is the edge
   firewall refusing a bare GET, not the site; a 403 without that header comes from the site itself.
   Allow a few minutes for CDN propagation on a first production deploy. Reserve production for
   go-live; iterate on development.

## When the preview breaks
Match the error to its source, then take exactly one branch:
1. **Error names a file NOT in the project** (check the project file list): starter leftover in the
   container. Fix it with `preview_force_recompile`. Never add the starter's package to the customer's
   package.json, and never delete or edit the container file by hand (container edits reverse-sync
   into the saved project). If the identical error persists after a plain run, run
   `preview_force_recompile` with `refresh_image: true` once.
2. **Error from inside node_modules**: `preview_reinstall_deps`. It is async - poll
   `preview_read_file({ path: '/tmp/hiveku-reinstall.log', tail_lines: 40 })` every ~15s until a
   `hiveku-reinstall: exit=` line appears (installs typically run 1-4 minutes).
3. **Error names a project-owned file**: fix the code. This is the only branch where you edit.
4. **Blank page but HTML serves**: `preview_client_errors` (hydration).

`preview_health` phase `installing`/`downloading` means a 2-5 minute dependency install: wait and
re-check; `ready: true` does not prove project files landed.

Deep flows: `hiveku_playbook_get("deploy-without-github")`, `("files-crud")`, `("rollback-a-file")`.
