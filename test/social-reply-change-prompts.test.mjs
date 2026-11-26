/**
 * Codex prompts before a reply Hiveku sent is deleted or its words are changed (HK-2293, 2026-11-26).
 *
 * social_comment_reply_delete deletes a public reply this account sent to a Facebook or Instagram comment, and
 * social_comment_reply_edit rewrites the words of one on Facebook. Each answers a preview first and acts on a second
 * call with confirm true, but the model fills in confirm itself, so the preview asks nobody. The server default here
 * is "approve", so without its own prompt entry each would run with no one asked, the way social_comment_reply and
 * social_linkedin_comment_delete would.
 *
 * The Claude Code plugin gates the same two; its mirror test keeps the two lists equal when both checkouts sit side
 * by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const WRITES = ['social_comment_reply_delete', 'social_comment_reply_edit'];

test('the server default is approve, so each of these needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('deleting and editing a reply Hiveku sent each require a prompt, as sending one does', () => {
  for (const name of [...WRITES, 'social_comment_reply', 'social_linkedin_comment_delete']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});
