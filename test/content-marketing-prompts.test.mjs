/**
 * Codex prompts before the Content Marketing writes that can put a post's page on the live website or take it off.
 *
 * content_editor_save saves a post, and a scheduled publish time it sends queues a public publish at that time (the
 * save itself never publishes). content_archive with remove_from_site and content_unpublish take a post's page off the
 * live website. content_delete with remove_from_site does too, and deletes the post's versions and comments.
 * content_unpublish_from_site rewrites the post's entry on its site as a draft, so the page comes down with the site's
 * next deploy. The first three are new for the Hiveku app's Content page and say ASK THE PERSON FIRST; the last two
 * are served today and ran with no one asked. Each is named here so a dropped or renamed entry fails, and the batch
 * wrapper prompts too because Codex decides by the called name only. The server default is "approve", so without an
 * entry each would run with no one asked.
 *
 * The Claude Code plugin gates the same five; its mirror test keeps the two lists equal when both checkouts sit side
 * by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const WRITES = [
  'content_editor_save',
  'content_archive',
  'content_unpublish',
  'content_delete',
  'content_unpublish_from_site',
];

test('the server default is approve, so each of these needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('each Content Marketing write that can change the live site, and the batch wrapper, require a prompt', () => {
  for (const name of [...WRITES, 'hiveku_batch']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});

test('they sit beside the publish, which already prompts', () => {
  const names = Object.keys(config.tools);
  const at = names.indexOf('content_publish_to_site');
  assert.ok(at >= 0, 'content_publish_to_site prompts');
  for (const name of WRITES) assert.ok(names.indexOf(name) > at, `${name} comes after content_publish_to_site`);
});

test('their reads stay unprompted', () => {
  for (const name of ['content_get', 'content_list', 'content_versions_list', 'content_schedule_list']) {
    assert.equal(config.tools[name], undefined, `${name} is a read and must not prompt`);
  }
});
