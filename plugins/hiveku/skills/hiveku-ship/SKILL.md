---
name: hiveku-ship
description: "Ship a change to a Hiveku website project safely — save, verify, save a version, deploy, and confirm the live site actually serves; or go back to an earlier version. Use for any deploy to development / staging / production, and to roll a site back."
---
Hiveku hosts website projects on its own version system + serverless CDN (no GitHub required). **A save
is live in the preview but is not a version, and a version is not live until you deploy it.** `main` is
"Your site" whenever you name it to a person.

## The safe flow
1. **Resolve the project.** `sites_list` (every website project on the account) / `project_get` (one,
   by id) → the `project_id`. Most project tools need it. `list_projects` / `get_project` list
   project-management projects, a different id space: their ids do not work on website tools.
2. **Know what's current before you edit** (`project_version_log`, and `project_vcs_status({ project_id })`
   for what on Your site is not a version yet) — you are not the only writer.
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
5. **Verify → version → deploy.** Once the change is saved and verified, call
   `project_vcs_commit({ project_id, message })` with NO files: it saves everything pending as ONE
   version. One version per logical change the site owner would recognize, usually one per user
   request. Save as many files or batches as the change needs, verify, then call project_vcs_commit
   ONCE. Never per file or per batch. Two unrelated changes in one session get two versions. Always
   version before deploy_site. The automatic version after a few quiet minutes is a safety net, not
   the plan.
   - `message` is the version's name: a plain-language name for this version, written for a
     non-technical site owner, describing what changed for their visitors. Good examples: 'Updated the
     pricing section on the Home page', 'Added a contact form to the About page'. Never file paths,
     file extensions, code terms, 'fix:'/'feat:' prefixes, tool names or an 'AI:' byline.
   - On Your site the version holds everything not in a version yet, from every writer (the editor,
     the in-app AI, other sessions), not only yours: check
     `project_vcs_status({ project_id, detail: "files" })` first and name it for all of it.
   - A 409 `nothing_to_commit` means it is already a version: not an error. Codex asks before every
     `project_vcs_commit`.
   - Pass `branch` to version work off to the side without touching the live project — merge later
     with `project_vcs_merge`, whose `into` targets any branch, or atomically via
     `project_vcs_pr_create` + `project_vcs_pr_merge`.
   - Then `deploy_site({ project_id, environment })` — **development first**, then production. A
     production deploy saves anything still pending as a version itself (`data.vcs_commit_id` is the
     version it ships) but with a generic name, so version first. A real build takes minutes; a
     sub-minute "build" means it took the static path.
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

## Go back to an earlier version
A rollback is append-only: it saves a NEW version equal to the old one, so it can be undone and nothing
in History is lost. It moves Your site (or a branch) and its preview, never a deployed site.
1. **Find the version.** `project_vcs_history({ project_id, branch: "main" })` lists versions newest
   first, each with its name (`message`), `source`, `created_at` and `restorable` (false = its files
   can no longer be brought back).
2. **Dry run (the default).** `project_vcs_rollback({ project_id, commit_id })` writes nothing. Tell the
   person in plain words what would change: the target version's name and date, the counts in
   `changes.files` and the pages in `changes.pages`, `versions_undone` (the newer versions it undoes),
   and `auto_version` (pending changes are saved first as "Saved before rollback"). Describe it by pages
   and counts, never by file paths (`changes.entries` is for you, not the person). `noop: true` means it
   is already the same.
3. **Apply only on their explicit yes.** On Your site: `project_vcs_rollback({ project_id, commit_id,
   dry_run: false, expected_head_commit_id: <the dry run's head_commit_id>, expected_live_fingerprint:
   <the dry run's live_fingerprint> })`. `expected_head_commit_id` is required there; the fingerprint
   keeps an automatic save made while the person was deciding from counting as a change. On a branch:
   add `branch` and send `expected_head_commit_id` only. Answers:
   - 409 `branch_changed` = someone saved since (unless it answers a re-send after a timeout: see the
     last bullet): run the dry run again and ask again.
   - 409 `ai_turn_running` = an AI request is still changing the site: wait, then retry.
   - 409 `rollback_incomplete` (Your site only) = the rollback is not finished and files WERE changed,
     so never tell the person nothing changed. `applied` were put back and `failed` were not (an empty
     `failed` means every file was put back but the new version was not recorded); tell the person by
     page or count, never by path. To finish it: when the answer's `head_commit_id` is the dry run's
     `head_commit_id` or `saved_before.id`, apply again with `expected_head_commit_id` set to THIS
     answer's `head_commit_id` and without `expected_live_fingerprint` (their yes for this same version
     still stands). Any other `head_commit_id` means someone else saved as well: run the dry run again,
     show it to the person, and apply with its `head_commit_id` only on their new yes.
   - 409 `content_unavailable` = that version's files can no longer be read. When the answer names a
     checkpoint (`checkpoint_hash` is not null), offer it: first
     `project_checkpoint_restore_dry_run({ project_id, checkpoint_hash })` and tell the person what it
     would change, then `project_checkpoint_restore({ project_id, checkpoint_hash })` only on their
     explicit yes. When `checkpoint_hash` is null there is nothing to restore from: say so and stop.
   - A 524 or a timeout on the apply does NOT mean it failed: a big rollback can outlast the edge's
     limit of about 100 seconds and keep running. Call again with exactly the same arguments: an
     identical call answers 409 `idempotency_pending` while the first run is still going (wait, then
     call again). Once that run is done, the same call gives back its answer only when it succeeded and
     nothing was saved since; otherwise the call runs again, and it is refused as 409 `branch_changed`
     when the first run finished, so it never rolls back twice. When unsure, read `project_vcs_history`
     first: a version newer than the dry run's `head_commit_id` whose `rolled_back_to` is the target
     means it finished. Do not start a new dry run until you know. If the re-send answers 409
     `branch_changed`, the first run may have finished or stopped part way, so never say nothing
     changed: read `project_vcs_history`. A version newer than the dry run's `head_commit_id` whose
     `rolled_back_to` is the target means it finished. A "Saved before rollback" version at the top
     (the `branch_changed` answer's `head_commit_id`) that is the ONLY version newer than the dry run's
     `head_commit_id` means it stopped part way: finish it as for `rollback_incomplete` (apply with that
     `head_commit_id` as `expected_head_commit_id`, without `expected_live_fingerprint`, on the same
     yes). Anything else, including a "Saved before rollback" version with other versions between it
     and the dry run's `head_commit_id`, means someone else saved as well: run a new dry run and ask
     again.
4. **Deploying is a separate step with its own yes.** A rollback never changes a live site. When the
   dry run said `live_includes_undone_work: true`, offer `deploy_site({ project_id, environment })`.
5. **Undo a rollback** by rolling back again, to the version it replaced (its `rolled_back_from`).

Versions cover the site's files. The database, CMS entries and shared images (the dry run's
`assets_affected` and `skipped.shared_assets`) are not in a version. A checkpoint restore can bring the
database back, but it also rewrites every file in the checkpoint over the current site: run
`project_checkpoint_restore_dry_run({ project_id, checkpoint_hash })` first and tell the person what it
would change, then call `project_checkpoint_restore` only on their explicit yes, with
`restore_database: true` only when they asked for their data back (without it the database is left as
it is). Codex asks before every `project_vcs_rollback` call, dry runs included. Never put
`project_vcs_rollback`, `project_vcs_commit`, `deploy_site` or any other tool Codex asks about inside
`hiveku_batch`: call each on its own, so the person is asked about that call (the plugin's hook refuses
such a batch).

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
