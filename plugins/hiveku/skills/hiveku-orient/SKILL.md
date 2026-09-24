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
- **The account memory is the owners' document.** Its `account` section in `account_context_get` (or
  `account_memory_get` for the whole text) holds the business facts every department agent reads.
  Owners and admins edit it on the Hiveku dashboard (Account memory); no tool sets or replaces it.
  `account_memory_append({ text })` only suggests one line for an owner to keep or remove. It is
  internal: never quote it to customers or publish it unless the user asks.
- **Generative/strategic work → `talk_to_department({ domain, message })`** (runs the department agent
  with full hydration), then persist with the matching direct tool (`content_create`, `crm_create_deal`,
  …). Pure CRUD (status flips, list queries, metadata) → direct tools.
- **Keep ALL scratch work in `.hiveku/tmp/`.** This machine may run many account folders at once, so
  `/tmp` is shared ground — two accounts writing `/tmp/site.tar.gz` overwrite each other and leak across
  sessions. Never write temp files to `/tmp`, your home dir, or the repo root.
- **Never ingest local agent config into a project push.** `.codex/config.toml`, `.mcp.json`, `.env*`
  carry this account's key/secrets — exclude them from every tar / bulk-save (the server refuses them
  too). Secrets belong in `project_secrets_*`, never in project code. Never read or print `.env.local`.
- **Fetching a Hiveku-hosted site: identify as Hiveku.** Every terminal `curl` against a customer
  site carries `-A 'Hiveku-Session/1.0 (+https://hiveku.com)'`, or is a `curl -I` (HEAD) when only
  status and headers matter. Never spoof `Googlebot` or `Mozilla`: a spoofed Googlebot is challenged
  on purpose. A 202 with an empty body, or any response carrying `x-amzn-waf-action`, is the edge
  firewall's challenge to an unidentified client - not an empty site and not a failed deploy. Say
  "the edge firewall challenged this client", then identify and retry before reporting. `fetch_url`
  runs from Hiveku's own servers as `Hiveku-Agent/1.0` and is exempt; a bare GET from this machine
  is not. `web_scrape` and the other Firecrawl-backed web tools run from third-party browsers: a
  rendering format (a screenshot, `web_actions`, `waitFor`) passes the challenge, and a plain-fetch
  format on a Hiveku-hosted site can answer `scrape_failed` with `reason: 'bot_challenge'` and a
  202 - switch format or use `fetch_url`, do not report a fetcher defect. A customer's own monitor
  or audit tool that is challenged is allowed by its product token (never by `Mozilla`) in
  Site > Hosting > Firewall: the `hiveku-firewall` skill.
- **PM tasks are required** — create one when you start work, comment as you go, complete it when done,
  attributed to the authenticated user when `crm_list_users` lists them. That list is the account's Team
  Members only (home users plus invited members); agency/SaaS staff working the account without an
  invitation are not on it and cannot be assigned. If it is empty or lacks the connected email, that is a
  real answer: create tasks unassigned (omit `assigned_to_id`), sign comments with `author_codename` set to
  the connected person's name, and tell the user once that inviting them under Team Members makes them
  assignable. Never borrow another member's id or an id from another account.
- **Every completed task ends with an "Owner update"** — 2–4 calm, plain-language sentences a busy owner
  can skim: benefit first, no alarm vocabulary, no self-blaming narration, accurate.
- Video generation is paid + capped — `marketing_generate_video` with `dry_run: true` first.

## Sending email
A campaign send reaches real inboxes and cannot be recalled, so it is a ladder, never one call:
1. `email_campaign_send_now({ id, dry_run: true })` — materializes the recipient list and reports
   totalQueued / totalSkipped / noOptInCount WITHOUT sending or changing status. A call without `dry_run`
   on a draft IS the send.
2. `email_campaign_test_send({ id, to: [a real mailbox you own] })` — real mail, up to 5 addresses. Never
   a test address on a reserved domain (example.com, test.com, localhost, .invalid): the server refuses it
   with `reserved_test_address`, because a bounce there counts against the account's sender reputation
   and two of them caused a platform-wide outage on 2026-08-07. The no-inbox check is
   success@simulator.amazonses.com.
3. Confirm the recipient count with the operator — name the totalQueued figure from the dry run — and only
   on their explicit yes call `email_campaign_send_now({ id })` or `email_campaign_schedule({ id, scheduled_for })`.
   Relay refusal codes verbatim (`email_service_suspended`, `audience_not_opted_in`, `empty_audience`,
   `plan_cap`, `domain_unverified`, `tenant_identity_not_attached`). `email_campaign_pause` / `_resume` hold
   and continue an in-flight send.
The `hiveku` server is configured to prompt before every send-class tool (the list in the Claude Code
plugin's `data/permission-critical-tools.json`), so expect an approval request on steps 2 and 3.

## Finding the right tool (there are ~1,000)
Don't guess tool names. Discover with `hiveku_docs_search` / `hiveku_docs_get`, and use
`hiveku_playbooks_list` / `hiveku_playbook_get` for step-by-step flows (deploying, files CRUD, rollback,
debugging a failed deploy). Most project tools need a `project_id` (from `list_projects` / `get_project`).

## Related skills
- `hiveku-connect` — set HIVEKU_TOKEN / fix 401s.
- `hiveku-ship` — save → verify → deploy a website project safely.
- `hiveku-diagnose-deploy` — a deploy reported ready but the live URL 403s/404s/blank.
- `hiveku-firewall` — an automated client (a monitor, an audit tool, a script) sees a 202 or a blank
  page from a hosted site; read what the edge firewall challenged or blocked, allow one client by
  its product token, never by `Mozilla`.
