/**
 * Codex prompts before every call that can switch ads on (release 0.1.16).
 *
 * Budgets, bids, bidding strategy and campaign create already prompted here,
 * but the call that turns a paused campaign, ad set, ad group or ad back on did
 * not: the server default is "approve", so ppc_enable_resource and
 * ppc_platform_enable_resource ran with no one asked, and neither has a confirm
 * step or a budget check of its own. The Claude Code plugin gates the same five
 * names (its data/permission-critical-tools.json and its hook); its mirror test
 * keeps the two lists equal when both checkouts sit side by side.
 *
 * Three of the five also pause or read (ppc_bulk_edit, ppc_linkedin_creatives,
 * ppc_tiktok_split_tests). A Codex prompt entry names a tool, not its
 * arguments, so they prompt on every call. Pausing one resource stays
 * unprompted: it is the safe direction.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP_JSON = path.join(root, 'plugins', 'hiveku', '.mcp.json');

const SPEND_START = [
  'ppc_enable_resource',
  'ppc_platform_enable_resource',
  'ppc_bulk_edit',
  'ppc_linkedin_creatives',
  'ppc_tiktok_split_tests',
];
const PAUSES = ['ppc_pause_resource', 'ppc_platform_pause_resource'];

function assertSpendStartPrompts(cfg) {
  const server = cfg?.hiveku ?? {};
  // The per-tool entries are the gate only because the default approves.
  assert.equal(server.default_tools_approval_mode, 'approve');
  const tools = server.tools ?? {};
  for (const name of SPEND_START) {
    assert.equal(tools[name]?.approval_mode, 'prompt', `${name} can switch ads on, so Codex must prompt before it`);
  }
  for (const name of PAUSES) {
    assert.notEqual(tools[name]?.approval_mode, 'prompt', `${name} only pauses, the safe direction; it must not prompt`);
  }
}

test('every call that can switch ads on prompts, and a single pause does not', () => {
  assertSpendStartPrompts(JSON.parse(fs.readFileSync(MCP_JSON, 'utf8')));
});

test('the check fails on the 0.1.15 map, which had no entry for the enables (negative control)', () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, 'utf8'));
  for (const name of SPEND_START) {
    const without = structuredClone(cfg);
    delete without.hiveku.tools[name];
    assert.throws(() => assertSpendStartPrompts(without), new RegExp(name));
  }
  const pausePrompts = structuredClone(cfg);
  pausePrompts.hiveku.tools.ppc_pause_resource = { approval_mode: 'prompt' };
  assert.throws(() => assertSpendStartPrompts(pausePrompts), /ppc_pause_resource/);
});
