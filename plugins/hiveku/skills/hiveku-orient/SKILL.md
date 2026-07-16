---
name: hiveku-orient
description: "How to operate a Hiveku account safely from Codex — read this FIRST before any Hiveku work. Identity, the you-are-not-the-only-writer rule, scratch/secrets hygiene, department agents, PM tasks, and the Owner update."
---
Read and follow this before using any Hiveku (`hiveku`) MCP tool.

## What Hiveku is
Hiveku is a marketing / website-builder / CRM platform. The `hiveku` MCP server exposes ~1,000 tools
(content, CRM, website projects, deploys, analytics, email, social, voice). Your account is selected by
the `HIVEKU_TOKEN` env var — **one token = one account**. If a Hiveku tool returns 401 / "Not logged
in", HIVEKU_TOKEN is unset or wrong: run the `hiveku-connect` skill.

## Non-negotiables (load-bearing — these prevent real incidents)
- **Verify identity before ANY write.** Call `get_account_info` (or `account_context_get`) and confirm
  it is the account you intend. Never operate a different account than HIVEKU_TOKEN selects.
- **You are NOT the only writer.** Other agents and people push to these same projects while you work.
  Check what is current BEFORE you start (`project_version_log`) and AGAIN before you push
  (`project_files_status` — `changed` = they edited it, `only_remote` = they added files you lack).
  Before any tree-replace (`delete_missing: true`), `dry_run` first and READ the would-delete list — a
  file you did not send may be someone else's NEW work, not a leftover. Never blind-overwrite.
- **Start strategic work with `account_context_get({ domain })`** — it returns persona, brand voice,
  avatars, memory, skills, rules. Skipping it is the #1 cause of off-brand output.
- **Generative/strategic work → `talk_to_department({ domain, message })`** (runs the department agent
  with full hydration), then persist with the matching direct tool (`content_create`, `crm_create_deal`,
  …). Pure CRUD (status flips, list queries, metadata) → direct tools.
- **Keep ALL scratch work in `.hiveku/tmp/`.** This machine may run many account folders at once, so
  `/tmp` is shared ground — two accounts writing `/tmp/site.tar.gz` overwrite each other and leak across
  sessions. Never write temp files to `/tmp`, your home dir, or the repo root.
- **Never ingest local agent config into a project push.** `.codex/config.toml`, `.mcp.json`, `.env*`
  carry this account's key/secrets — exclude them from every tar / bulk-save (the server refuses them
  too). Secrets belong in `project_secrets_*`, never in project code. Never read or print `.env.local`.
- **PM tasks are required** — create one when you start work, comment as you go, complete it when done,
  attributed to the authenticated user (resolve via `crm_list_users`).
- **Every completed task ends with an "Owner update"** — 2–4 calm, plain-language sentences a busy owner
  can skim: benefit first, no alarm vocabulary, no self-blaming narration, accurate.
- Video generation is paid + capped — `marketing_generate_video` with `dry_run: true` first.

## Finding the right tool (there are ~1,000)
Don't guess tool names. Discover with `hiveku_docs_search` / `hiveku_docs_get`, and use
`hiveku_playbooks_list` / `hiveku_playbook_get` for step-by-step flows (deploying, files CRUD, rollback,
debugging a failed deploy). Most project tools need a `project_id` (from `list_projects` / `get_project`).

## Related skills
- `hiveku-connect` — set HIVEKU_TOKEN / fix 401s.
- `hiveku-ship` — save → verify → deploy a website project safely.
- `hiveku-diagnose-deploy` — a deploy reported ready but the live URL 403s/404s/blank.
