/**
 * Codex prompts before hiveku_batch, as it does for the gated tools (HK-29, 2026-09-26).
 *
 * A batch runs its calls on the Hiveku server, and Codex decides whether to ask
 * by the name of the tool it calls. The server default here is "approve", so
 * with no hiveku_batch entry the per-tool prompts in plugins/hiveku/.mcp.json
 * covered direct calls only: deploy_site, project_indexing_set or any other
 * prompted tool placed inside a batch ran with nobody asked. Prompting on
 * hiveku_batch itself closes that for every member, including tools gated
 * after this release, at the cost of a prompt on a batch of reads too.
 *
 * The Claude Code plugin's test/permission-critical.test.mjs compares this map
 * with its ask list when this repo is checked out beside it, and names
 * hiveku_batch there as the one Codex-only prompt. This file pins it without
 * the sibling.
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
const raw = fs.readFileSync(MCP_JSON, 'utf8');
const tools = JSON.parse(raw).hiveku?.tools ?? {};

test('hiveku_batch prompts, so no prompted tool runs inside a batch unasked', () => {
  assert.deepEqual(
    tools.hiveku_batch,
    { approval_mode: 'prompt' },
    'hiveku_batch must prompt: Codex asks by the called tool name, and a batch carries other tools',
  );
});

test('no tool is listed twice in the prompt map', () => {
  // JSON.parse keeps the last of two equal keys without a word, so a merge of two
  // branches that each add the same entry would pass every check above. Read the
  // keys from the text instead.
  const start = raw.indexOf('"tools": {');
  const end = raw.indexOf('"playwright"');
  assert.ok(start >= 0 && end > start, 'could not find the hiveku tools block in .mcp.json');
  const block = raw.slice(start + '"tools": {'.length, end);
  const names = [...block.matchAll(/^\s*"([A-Za-z0-9_]+)"\s*:\s*\{/gm)].map((m) => m[1]);
  const seen = new Set();
  const repeated = names.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
  assert.deepEqual(repeated, [], `listed more than once: ${repeated.join(', ')}`);
  // Also fails if the scan above found nothing, so a format change cannot pass it vacuously.
  assert.equal(names.length, Object.keys(tools).length, 'the text and the parsed map list a different number of tools');
});
