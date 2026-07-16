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

## Notes

- The plugin's MCP auth uses `bearer_token_env_var`, so the token is **never** baked into the published
  plugin — it lives only in your environment. Keep any inlined token (`.codex/config.toml`, `.env*`) out
  of git.
- Codex ignores repo-level approval/sandbox config, so the safe-work rules ship as **instructions**
  (the `hiveku-orient` skill + the SessionStart hook), not as enforced permissions.

## License

MIT — see [LICENSE](./LICENSE).
