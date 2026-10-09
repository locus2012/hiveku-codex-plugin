# Hiveku plugin for Codex

Operate a [Hiveku](https://app.hiveku.com) account from the Codex CLI, IDE extension, or ChatGPT
desktop. This plugin bundles:

- **The `hiveku` MCP server** — ~1,000 tools for content, CRM, website projects, deploys, analytics,
  email, social, and voice — authenticated per-account via the `HIVEKU_TOKEN` env var.
- **`playwright`** — for visual verification of previews.
- **Skills** carrying Hiveku's operating doctrine and workflows:
  - `hiveku-orient` — read first: identity, the you-are-not-the-only-writer rule, scratch/secrets
    hygiene, department agents, whose memory is whose (the agent that owns a rule, and what is shared
    with every agent), PM tasks + the Owner update, and connecting Google products: every one
    but Gmail runs on Hiveku's own Google app, so the agent never asks for a developer token or an own
    Google app.
  - `hiveku-remember` — save what you learned where the agents read it: an agent's Notes, a rule,
    skill, shortcut or specialist for one agent or for every agent (it asks the person which, and
    sends `department` on `memory_create`), or a one-line suggestion for About your business.
  - `hiveku-memory-changes` — what changed in the account's memory since a date, by agent: who
    changed it, from which app, when and why. Read-only.
  - `hiveku-connect` — get your account key and set `HIVEKU_TOKEN`.
  - `hiveku-ship` — save → verify → version → deploy a website project safely, and go back to an
    earlier version (`project_vcs_rollback`: a dry run first, append-only, so it can be undone). It
    also covers branches and pull requests (reviews, in the dashboard): reviewing one with comments
    or a request for changes (an agent never approves; a person does, in the dashboard), merging
    under the site's "Require an approval" rule, settling merge conflicts file by file with the
    person (`project_vcs_conflicts`, `project_vcs_resolve`), and restoring an archived branch.
  - `hiveku-diagnose-deploy` — a deploy reported ready but the live URL 403s/404s/blank.
  - `hiveku-firewall` — an automated client sees a 202, a 403 or a blank page from a hosted site: tell
    the firewall's 403 (`x-hiveku-firewall`) from the site's own, read what the edge firewall
    challenged or blocked in the last 7 days (searchable, e.g. for Googlebot), and allow one client
    by its product token (never `Mozilla`) with `site_firewall_get` / `site_firewall_client_get` /
    `site_firewall_allow` / `site_firewall_remove`.
  - `hiveku-form-capture` — choose which forms Hiveku captures on a hosted site (the capture switch,
    Marketing site or Web app, path and per-form rules, previewed before saving) and erase what was
    captured by mistake: permanent, dry run first.
  - `hiveku-website-chat` — website chats in the helpdesk: which ones wait for a person and which the
    website assistant is answering (`ai_handling`), replying to a chat as staff (a reply takes it from
    the assistant, so it waits for a yes), and what the assistant answers from, read with
    `helpdesk_assistant_knowledge_status` and explained to the owner in plain words.
  - Phone system, SMS and call tracking doctrine (`hiveku-phone-agency`) ships with the Claude plugin, not
    here; the Hiveku VS Code extension's **Set Up Codex Support** mirrors it, with its `references/`, into
    `.agents/skills/` in the account folders it scaffolds.
- **A SessionStart hook** that warns if `HIVEKU_TOKEN` is unset and reinforces the disciplines that
  prevent the most common incidents, including saving each change as a version and following Hiveku
  Memory as the source of truth (Hiveku records each session's Doing and Done in the memory log
  itself; the agent ends with a Done in its own words).
- **A versions reminder** (PreToolUse, PostToolUse and Stop hooks, see [Versions](#versions)): when a
  session changed a website project and did not save the change as a version, the agent is asked once,
  before it finishes, to save one.

## Install

```bash
# Add this repo as a marketplace, then install the plugin:
codex plugin marketplace add locus2012/hiveku-codex-plugin
codex plugin add hiveku@hiveku

# Set your account key (get it from app.hiveku.com → Settings → LLM Connectors / MCP keys):
export HIVEKU_TOKEN="hvk_..."

# Verify the MCP server authenticates:
codex mcp list   # the `hiveku` row should show Auth: Bearer token
```

Then, in a Codex session, the `hiveku-*` skills are available and the `hiveku` tools are live. Start by
reading the `hiveku-orient` skill and calling `get_account_info` to confirm which account you're on.

## One token = one account

`HIVEKU_TOKEN` selects the account. To operate multiple accounts, use separate shells or folders, each
with its own token. For a full per-account bootstrap (per-folder config + an account-specific
`AGENTS.md` + the account's saved commands mirrored into skills), use the Hiveku CLI:

```bash
npx @hiveku-apps/sync init <account-slug> --codex
```

## Versions

A save to a website project is live in the preview at once, but it is not a version. A version is a
named point the site owner sees in History and can roll back to. The skills teach one version per
change: save and verify, then `project_vcs_commit({ project_id, message })` with no files and a
plain-language name, before `deploy_site`. Going back is `project_vcs_rollback`: a dry run by default,
applied only on an explicit yes, and it never changes a live site (deploying is a separate step).

The plugin backs this up with three hooks (bash with grep, sed and tr only; no node, no credentials, no
network):

- `hooks/post-tool-use.sh` notes which projects the session changed and which it saved as a version, in
  `$TMPDIR/hiveku-vcs/<session id>.jsonl`.
- `hooks/pre-tool-use.sh` notes each attempt to save a version or apply a rollback. Codex runs
  PostToolUse only for calls that succeed, so the Stop hook reads how an attempt ended (for example
  "already a version") from the session transcript. It also refuses a `hiveku_batch` that carries a
  tool Codex asks about (see [Notes](#notes)), so each such call is asked about on its own.
- `hooks/stop.sh` asks the agent once, before it finishes, to save a version of any change that is not
  one yet. If the agent stops again without saving (for example because you asked it not to), you get
  a one-line notice instead and it does not ask again until the next change. When it cannot tell how a
  version attempt ended, it says nothing rather than guess.

To turn the reminder off for a folder, put `{"version_reminder": false}` in `.hiveku/guardrails.json`
there (or in a parent folder, below your home folder). The nearest `.hiveku/guardrails.json` decides: a
file without `version_reminder` keeps the reminder on.

The hooks need Codex 0.131 or later, and Codex runs a plugin's hooks only after you trust them: when it
starts it lists new or changed hooks under "Hooks need review" (Review hooks, or Trust all and
continue). Until then they do not run, and the skills still carry the same rule.

## Fetching a Hiveku-hosted site from your terminal

Every Hiveku-hosted site sits behind Hiveku's edge firewall. An automated client the firewall cannot
identify gets a 202 challenge (empty body, `x-amzn-waf-action: challenge`) or a 403 with
`x-hiveku-firewall: blocked`; a request from a known bulk-scraper network gets a 403 with
`x-hiveku-firewall: blocked-network`; a 403 without that header comes from the site itself. Identify
yourself and the browser check is skipped:

```bash
curl -A 'Hiveku-Session/1.0 (+https://hiveku.com)' https://<site>/   # a GET that identifies as Hiveku
curl -I https://<site>/                                             # HEAD is never challenged or blocked
```

The firewall's 202 or 403 is a refusal, not an empty site and not a failed deploy. `fetch_url` and
`deploy_doctor` run from Hiveku's own servers and are exempt; `web_scrape` and the other Firecrawl-backed
tools run from third-party browsers, so on a Hiveku-hosted site use a rendering format or `fetch_url`.

## Notes

- The plugin's MCP auth uses `bearer_token_env_var`, so the token is **never** baked into the published
  plugin — it lives only in your environment. Keep any inlined token (`.codex/config.toml`, `.env*`) out
  of git.
- **Reads and ordinary writes are pre-approved** (`default_tools_approval_mode: "approve"`), but every
  tool that sends, publishes, deploys, deletes or spends (the names in the Claude plugin's
  `data/permission-critical-tools.json`, including `email_campaign_send_now`, `email_campaign_schedule`,
  `email_campaign_test_send`, the call-tracking tools that hold a live tracking number or rewrite a
  pool's routing, such as `voice_swap_test` and `voice_pool_update`, the calls that switch ads on or
  restart them, `ppc_enable_resource`, `ppc_platform_enable_resource`, `ppc_bulk_edit`,
  `ppc_linkedin_creatives`, `ppc_tiktok_split_tests`, `ppc_recommendation_apply`, `ppc_meta_campaign_update`,
  `ppc_linkedin_campaign_update` and `ppc_linkedin_campaign_group_update` (whole tool, so their pauses, reads
  and renames prompt too), the calls that switch a workflow on or clear its automatic pause,
  `workflow_enable` and `workflow_resume`, and the form capture write and erase,
  `marketing_form_capture_settings_update` and `marketing_form_capture_purge`) is set to
  `"prompt"` per tool in `.mcp.json`, so a headless `codex exec` blocks on an approval request for those
  instead of running them. That includes saving a version (`project_vcs_commit`, whose files form
  writes the live project) and every `project_vcs_rollback` call, dry runs included: Codex cannot look
  at a call's arguments before it asks. Settling merge conflicts (`project_vcs_resolve`, which writes
  the chosen text onto a branch) and editing a pull request (`project_vcs_pr_update`, whose new target
  dismisses the approvals people gave) prompt as well; reading, reviewing and commenting on a pull
  request do not, and no agent can approve one. These memory writes prompt too: `memory_create`,
  `memory_update`, `memory_delete`, `memory_restore_version`, `memory_bulk_create` and
  `account_memory_append`. A rule, skill, shortcut or specialist created without an agent is shared
  with every agent, so `memory_create` prompts on every call, a new agent's Notes included.
  `onboarding_write_department_memory`, the onboarding interview's own write to an agent's Notes,
  does not prompt, and the skills do not use it to save notes. A folder set up with
  `npx @hiveku-apps/sync init <account-slug> --codex` writes its own `[mcp_servers.hiveku]`, and
  Codex then takes every tool's prompt from that entry, not from this plugin: until hiveku-sync
  copies this list again, `memory_create` runs there without a prompt, and the `hiveku-remember`
  skill's question about who follows a new rule is the check.
  `hiveku_batch` prompts too: a batch runs its calls on the Hiveku server, and Codex asks by the
  name of the tool it calls, so without that entry a prompted tool placed inside a batch would run
  with no prompt. A batch of reads waits for a yes as well; single reads do not.
  The plugin's PreToolUse hook also refuses a batch that carries a version save or a rollback, so the
  agent calls it on its own and you are asked about that call. If you prefer to review every call,
  change the server default to `"prompt"`. The safe-work rules
  ship as **instructions** (the `hiveku-orient` skill + the SessionStart hook); Codex's sandbox still
  governs local shell/file access.

## License

MIT — see [LICENSE](./LICENSE).
