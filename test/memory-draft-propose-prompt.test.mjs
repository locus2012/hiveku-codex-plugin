/**
 * Codex prompts before account_memory_draft_propose (HK-2152, 2026-11-27).
 *
 * Any key of the account may propose a whole About your business. One draft waits for an owner or admin in the Hiveku
 * app, and a newer proposal replaces the one waiting, so it asks first like account_memory_append. The server default
 * here is "approve", so without its own prompt entry it would run with no one asked. It sits right after
 * account_memory_append, in the Claude Code plugin's ask list order.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

test('account_memory_draft_propose prompts, right after account_memory_append', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  const names = Object.keys(config.tools);
  assert.deepEqual(config.tools.account_memory_draft_propose, { approval_mode: 'prompt' });
  assert.equal(names[names.indexOf('account_memory_append') + 1], 'account_memory_draft_propose');
});
