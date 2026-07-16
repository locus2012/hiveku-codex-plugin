---
name: hiveku-connect
description: "Connect Codex to a Hiveku account — get your account key and set HIVEKU_TOKEN so the hiveku MCP server authenticates. Use when hiveku tools return 401 / 'Not logged in'."
---
The `hiveku` MCP server authenticates with a per-account key supplied via the `HIVEKU_TOKEN`
environment variable (the plugin's `.mcp.json` references it as `bearer_token_env_var`). One token =
one account.

## 1. Get your account key
1. Sign in at https://app.hiveku.com and open **Settings → LLM Connectors / MCP keys** (the CLI /
   connector setup card).
2. Create an MCP key for the account you want to operate, and copy the `hvk_...` token.

## 2. Set HIVEKU_TOKEN
Pick ONE:
- **This shell only:** `export HIVEKU_TOKEN="hvk_..."`, then launch Codex from that shell.
- **Persistent (all projects):** add `export HIVEKU_TOKEN="hvk_..."` to `~/.zshrc` / `~/.bashrc`.
- **Per-project (recommended for multi-account work):** in the folder's `.codex/config.toml`, keep the
  token out of a global env by setting it under the server directly. Either export `HIVEKU_TOKEN` from a
  per-folder `.env` you source, or override the header inline:
  ```toml
  [mcp_servers.hiveku]
  url = "https://core.hiveku.com/mcp"
  http_headers = { "Authorization" = "Bearer hvk_..." }
  ```
  If you inline the token, add `.codex/config.toml` and `.env*` to `.gitignore` — never commit it.

  > Tip: the Hiveku CLI `hiveku-sync init <account> --codex` writes this per-folder config, an
  > account-specific `AGENTS.md`, and mirrors the account's saved commands into skills — so a Codex
  > user gets the same per-account setup a Claude Code user gets. Use it for a full bootstrap.

## 3. Verify
- `codex mcp list` → the `hiveku` row should show **Auth: Bearer token**.
- In a Codex session, call `get_account_info` and confirm it returns the account you expect.

To operate multiple accounts, use separate shells/folders each with their own HIVEKU_TOKEN. Never operate
a different account than the token selects.
