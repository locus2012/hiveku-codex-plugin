/**
 * Codex prompts before the calls that can switch ads on or restart them, and
 * before the calls that switch a workflow on (release 0.1.17).
 *
 * Budgets, bids, bidding strategy and campaign create already prompted here,
 * but the call that turns a paused campaign, ad set, ad group or ad back on did
 * not: the server default is "approve", so ppc_enable_resource and
 * ppc_platform_enable_resource ran with no one asked, and neither has a confirm
 * step or a budget check of its own. This release prompts before:
 *   - the five that can switch ads on by status: the two enables,
 *     ppc_bulk_edit, ppc_linkedin_creatives and ppc_tiktok_split_tests;
 *   - the four that can restart or widen delivery without a status change:
 *     ppc_recommendation_apply, and the end-date edits on
 *     ppc_meta_campaign_update, ppc_linkedin_campaign_update and
 *     ppc_linkedin_campaign_group_update;
 *   - workflow_resume, which clears a workflow's automatic pause.
 *     workflow_enable, the one tool that switches a workflow on, already
 *     prompted; it is pinned here with it.
 * The Claude Code plugin gates the same names (its
 * data/permission-critical-tools.json and its hook); its mirror test keeps the
 * two lists equal when both checkouts sit side by side. Since 0.1.16 every
 * hiveku_batch call prompts too (test/batch-prompt.test.mjs), so none of these
 * runs inside a batch unasked.
 *
 * Six of them also pause, read or rename (ppc_bulk_edit,
 * ppc_linkedin_creatives, ppc_tiktok_split_tests and the three update tools).
 * A Codex prompt entry names a tool, not its arguments, so they prompt on
 * every call. Pausing one resource, switching a workflow off and adding
 * keywords stay unprompted.
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
  'ppc_recommendation_apply',
  'ppc_meta_campaign_update',
  'ppc_linkedin_campaign_update',
  'ppc_linkedin_campaign_group_update',
];
const WORKFLOW_ON = ['workflow_enable', 'workflow_resume'];
const PAUSES = ['ppc_pause_resource', 'ppc_platform_pause_resource'];
/** The safe direction and ordinary build work: these must not prompt. */
const UNPROMPTED = [...PAUSES, 'workflow_disable', 'ppc_keyword_add', 'ppc_platform_keyword_add'];

function assertSpendStartPrompts(cfg) {
  const server = cfg?.hiveku ?? {};
  // The per-tool entries are the gate only because the default approves.
  assert.equal(server.default_tools_approval_mode, 'approve');
  const tools = server.tools ?? {};
  for (const name of SPEND_START) {
    assert.equal(tools[name]?.approval_mode, 'prompt', `${name} can switch ads on or restart them, so Codex must prompt before it`);
  }
  for (const name of WORKFLOW_ON) {
    assert.equal(tools[name]?.approval_mode, 'prompt', `${name} lets a workflow's triggers run it for real, so Codex must prompt before it`);
  }
  for (const name of UNPROMPTED) {
    assert.notEqual(tools[name]?.approval_mode, 'prompt', `${name} is the safe direction or ordinary build work; it must not prompt`);
  }
}

test('the calls that switch ads on, restart them or switch a workflow on prompt, and a single pause does not', () => {
  assertSpendStartPrompts(JSON.parse(fs.readFileSync(MCP_JSON, 'utf8')));
});

test('the check fails when any entry is missing, as on the 0.1.16 map (negative control)', () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, 'utf8'));
  for (const name of [...SPEND_START, ...WORKFLOW_ON]) {
    const without = structuredClone(cfg);
    delete without.hiveku.tools[name];
    assert.throws(() => assertSpendStartPrompts(without), new RegExp(name));
  }
  const pausePrompts = structuredClone(cfg);
  pausePrompts.hiveku.tools.ppc_pause_resource = { approval_mode: 'prompt' };
  assert.throws(() => assertSpendStartPrompts(pausePrompts), /ppc_pause_resource/);
});
