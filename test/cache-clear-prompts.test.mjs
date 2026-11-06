/**
 * Codex prompts before a site's cache clear (HK-1166, 2026-11-06).
 *
 * project_cache_clear clears what the CDN keeps for one deployed environment of
 * a site, and project_cdn_invalidate is the same clear under its older name.
 * Each clear costs money past the free allowance and spends a limit of 6 an
 * hour per environment and 40 a day per account. The server default is
 * "approve", so without an entry each would run with no one asked. The read of
 * a clear, project_cache_clear_status, is free and stays unprompted.
 *
 * The Claude Code plugin gates the same two names; its mirror test keeps the
 * two lists equal when both checkouts sit side by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const CLEARS = ['project_cache_clear', 'project_cdn_invalidate'];

test('both names of a cache clear prompt, and reading whether one finished does not', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  for (const name of CLEARS) assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  assert.equal(config.tools.project_cache_clear_status, undefined, 'the read of a clear stays unprompted');
});

test('the README names both in its list of prompts', () => {
  for (const name of CLEARS) assert.ok(readme.includes(`\`${name}\``), name);
});
