# Hiveku plugin for Codex

Operate a [Hiveku](https://app.hiveku.com) account from the Codex CLI, IDE extension, or ChatGPT
desktop. This plugin bundles:

- **The `hiveku` MCP server** — ~1,000 tools for content, CRM, website projects, deploys, analytics,
  email, social, and voice — authenticated per-account via the `HIVEKU_TOKEN` env var.
- **`playwright`** — for visual verification of previews.
- **Skills** carrying Hiveku's operating doctrine and workflows:
  - `hiveku-orient` — read first: identity, the you-are-not-the-only-writer rule, scratch/secrets
    hygiene, department agents, PM tasks + the Owner update.
  - `hiveku-connect` — get your account key and set `HIVEKU_TOKEN`.
  - `hiveku-ship` — save → verify → deploy a website project safely.
  - `hiveku-diagnose-deploy` — a deploy reported ready but the live URL 403s/404s/blank.
  - `hiveku-firewall` — an automated client sees a 202 or a blank page from a hosted site: read what
    the edge firewall challenged or blocked in the last 7 days and allow one client by its product
    token (never `Mozilla`) with `site_firewall_get` / `site_firewall_allow` / `site_firewall_remove`.
  - `hiveku-form-capture` — choose which forms Hiveku captures on a hosted site (the capture switch,
    Marketing site or Web app, path and per-form rules, previewed before saving) and erase what was
    captured by mistake: permanent, dry run first.
  - Phone system, SMS and call tracking doctrine (`hiveku-phone-agency`) ships with the Claude plugin, not
    here; the Hiveku VS Code extension's **Set Up Codex Support** mirrors it, with its `references/`, into
    `.agents/skills/` in the account folders it scaffolds.
- **A SessionStart hook** that warns if `HIVEKU_TOKEN` is unset and reinforces the two disciplines that
  prevent the most common incidents.

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

## Fetching a Hiveku-hosted site from your terminal

Every Hiveku-hosted site sits behind Hiveku's edge firewall, which challenges unidentified automated
clients with HTTP 202 and an empty body (header `x-amzn-waf-action: challenge`). Identify yourself and
the check is skipped:

```bash
curl -A 'Hiveku-Session/1.0 (+https://hiveku.com)' https://<site>/   # a GET that identifies as Hiveku
curl -I https://<site>/                                             # HEAD is never challenged
```

A 202 with an empty body is the challenge, not an empty site and not a failed deploy. `fetch_url` and
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
  pool's routing, such as `voice_swap_test` and `voice_pool_update`, and the form capture write and
  erase, `marketing_form_capture_settings_update` and `marketing_form_capture_purge`) is set to
  `"prompt"` per tool in `.mcp.json`, so a headless `codex exec` blocks on an approval request for those
  instead of running them. If you prefer to review every call, change the server default to `"prompt"`. The safe-work rules
  ship as **instructions** (the `hiveku-orient` skill + the SessionStart hook); Codex's sandbox still
  governs local shell/file access.

## License

MIT — see [LICENSE](./LICENSE).
