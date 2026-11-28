/**
 * Codex prompts before a site picks or drops single variables of an environment group (2026-11-28).
 *
 * env_group_pick gives a site only some variables of an account environment group, synced into its running functions
 * in the call; env_group_unpick takes them off at once, which can break code that reads them. That is the effect
 * env_group_link and env_group_unlink have for the whole group, and they prompt, so these two prompt the same way.
 * Their MCP descriptions do not say ASK THE PERSON FIRST, and the server default here is "approve", so without their
 * own prompt entries they would run with no one asked.
 *
 * They sit right after env_group_unlink, as in the Claude Code plugin's ask list (0.27.322); that plugin's mirror test
 * keeps the two lists equal when both checkouts sit side by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8');
const config = JSON.parse(raw).hiveku;

test('the server default is approve, so a pick and an unpick need their own prompt entries', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('env_group_pick and env_group_unpick prompt, right after env_group_link and env_group_unlink, each listed once', () => {
  const names = Object.keys(config.tools);
  for (const name of ['env_group_link', 'env_group_unlink', 'env_group_pick', 'env_group_unpick']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, `${name} must prompt`);
    // JSON.parse keeps only the last of two equal keys, so count them in the text.
    assert.equal(raw.split(`"${name}"`).length - 1, 1, `${name} listed once`);
  }
  const at = names.indexOf('env_group_unlink');
  assert.deepEqual(names.slice(at, at + 3), ['env_group_unlink', 'env_group_pick', 'env_group_unpick']);
});

test('the README names both with the other group writes that prompt', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /`env_group_pick` and\s+`env_group_unpick` \(a site gains or loses only the variables it picked, at once\)/);
});
