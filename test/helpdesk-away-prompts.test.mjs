/**
 * Codex prompts before the help desk away message is set (HK-1504).
 *
 * helpdesk_away_reply_set switches the help desk away message on or off and sets its window and words. While the
 * window is on, every customer who emails in gets it automatically instead of the usual confirmation, and a customer
 * who replies gets it once per conversation; it turns itself off at its end. Its description says ASK THE PERSON
 * FIRST. The server default is "approve", so without an entry it would run with no one asked, and the batch wrapper
 * prompts too because Codex decides by the called name only.
 *
 * The Claude Code plugin gates the same tool; its mirror test keeps the two lists equal when both checkouts sit side
 * by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

test('the server default is approve, so the away message needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('setting the away message, and the batch wrapper, require a prompt', () => {
  for (const name of ['helpdesk_away_reply_set', 'hiveku_batch']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});

test('its read stays unprompted', () => {
  assert.equal(config.tools.helpdesk_away_reply_get, undefined, 'helpdesk_away_reply_get is a read and must not prompt');
});
