/**
 * Discussions notices (2026-11-12): what a feature sends to a team chat outside Hiveku (help desk alerts, website form
 * leads, site review comments, customer reviews) can also post in a Discussions channel. Codex prompts before the set
 * (it turns that copy on or off and picks its channel, so a stranger's words reach everyone who reads the channel, in
 * the person's name). Reading where each alert goes follows the default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

test('turning a feature\'s alerts on or off in a Discussions channel requires a prompt, right after the import\'s writes', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  assert.deepEqual(config.tools.discussion_notice_route_set, { approval_mode: 'prompt' });
  const names = Object.keys(config.tools);
  assert.equal(names[names.indexOf('discussion_import_undo') + 1], 'discussion_notice_route_set', 'beside the other Discussions writes');
});

test('reading where each alert goes is not added', () => {
  assert.equal(config.tools.discussion_notice_routes_list, undefined);
});
