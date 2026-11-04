# Releasing and updating Hiveku Hooks

## Why Codex asks again

Codex fingerprints the whole `hiveku-hooks` plugin folder, not just `hooks.json` or the hook being run. A changed manifest, script, filename or other bundled file invalidates its previous content approval. This is an intentional security boundary. Hook approval is separate from ordinary tool approval.

Keep hooks in their own plugin so releases of `hiveku` alone do not invalidate hook approval. Keep generated state, logs and caches outside the hook plugin folder.

## Release checklist

1. Any change inside `plugins/hiveku-hooks/` requires a strictly newer `major.minor.patch` version in its `.codex-plugin/plugin.json`. Treat a version already on `main` as published, even if nobody has announced it. Never overwrite its files or its existing fingerprint pin.
2. Add the new version's fingerprint to `PINNED_BUNDLE` in `test/hooks-plugin-split.test.mjs`; preserve the old pins.
3. Commit the candidate, then run `node scripts/check-hook-release.mjs origin/main` and `node --test test/*.test.mjs`. The Git comparison checks committed trees. CI runs both checks for pull requests and pushes to `main`.
4. Explain that users must review and approve changed hooks. A new version does not inherit approval for an old fingerprint. Never distribute preapproved trust hashes, edit users' trust configuration automatically, or recommend bypassing hook trust.

The cross-commit guard prevents editing the current test pin to make a reused version pass. Its tests cover changed bytes, added/deleted/renamed files, downgrades, legitimate new releases and unrelated main-plugin updates. Maintainers must retain this CI check and require it in repository branch rules if merges are to be enforced rather than advisory.

## Updating an installation

Run these commands with the same `CODEX_HOME` used by the affected Codex account. Managed accounts in Orca can have a different Codex home from a terminal's default.

```sh
codex plugin marketplace upgrade hiveku
codex plugin add hiveku-hooks@hiveku
codex plugin list --json
```

In that account's Codex terminal, open `/hooks`, inspect the Hiveku Hooks entries and press `t` to trust the reviewed hooks. Do not use an indiscriminate trust-all action if unrelated hooks are present.

If a fresh Codex process reports the current fingerprint as trusted but an existing session still reports `plugin contents changed; hook approval required`, the existing backend may hold old approval/config state. Close and reopen the affected Codex backend, then resume the conversation. A new conversation on the same backend may not reload its state. Restart only the affected backend after its current work is stopped or checkpointed; do not restart every agent or delete session history.

A successful `hooks/list` readback proves persisted approval, not that an already-running thread has refreshed its hook engine. Verify the next Stop event in the actual resumed session before declaring the runtime problem resolved.

## 1.0.2

Hook behavior is unchanged from 1.0.1. This release introduces a cross-commit version guard in CI and these update/reapproval instructions. The version bump changes the plugin fingerprint, so it requires a fresh review. It does not fix Codex or Orca's in-memory configuration refresh behavior.
