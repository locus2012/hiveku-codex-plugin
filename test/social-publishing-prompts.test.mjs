/**
 * Codex prompts before a person's Social Marketing acts from the Hiveku app, and before a bulk draft create.
 *
 * social_post_publish_now, social_post_approve and social_posts_bulk can put posts live on every target platform,
 * social_account_disconnect removes an account's post results, analytics and comments from Hiveku with no undo,
 * social_accounts_activate and social_accounts_import_gbp change which accounts can publish, and
 * social_posts_bulk_create writes up to 25 drafts and their calendar events in one call. The first six are taken from
 * the Hiveku app's own key alone; they prompt anyway, so a later change on the server never meets a Codex folder
 * unasked. Each is named here so a dropped or renamed entry fails, and the batch wrapper prompts too because Codex
 * decides by the called name only. The server default is "approve", so without an entry each would run with no one
 * asked.
 *
 * The Claude Code plugin gates the same seven; its mirror test keeps the two lists equal when both checkouts sit side
 * by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const WRITES = [
  'social_post_publish_now',
  'social_post_approve',
  'social_posts_bulk',
  'social_account_disconnect',
  'social_accounts_activate',
  'social_accounts_import_gbp',
  'social_posts_bulk_create',
];

test('the server default is approve, so each of these needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('each social publishing write and the bulk draft create, and the batch wrapper, require a prompt', () => {
  for (const name of [...WRITES, 'hiveku_batch']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});

test('their reads stay unprompted', () => {
  for (const name of ['social_list_posts', 'social_get_post', 'social_list_accounts', 'social_account_get']) {
    assert.equal(config.tools[name], undefined, `${name} is a read and must not prompt`);
  }
});
