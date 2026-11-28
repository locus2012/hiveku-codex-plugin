/**
 * Codex prompts before a recording upload's finalize (HK-1922, 2026-11-28).
 *
 * crm_activity_recording_finalize is step 2 of a recording upload: it saves the uploaded file on its CRM activity, where
 * it stays in the account's storage and counts toward the plan's storage until the activity is deleted. Its MCP
 * description does not say ASK THE PERSON FIRST, and the server default here is "approve", so without its own prompt
 * entry it would run with no one asked. Step 1, crm_activity_recording_presign, changes nothing the person keeps and
 * gets no entry.
 *
 * It sits at the end, as in the Claude Code plugin's ask list (0.27.320); that plugin's mirror test keeps the two lists
 * equal when both checkouts sit side by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8');
const config = JSON.parse(raw).hiveku;

test('the server default is approve, so the finalize needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('the finalize requires a prompt, at the end of the list, and the presign gets no entry', () => {
  const names = Object.keys(config.tools);
  assert.deepEqual(config.tools.crm_activity_recording_finalize, { approval_mode: 'prompt' });
  assert.equal(names.at(-1), 'crm_activity_recording_finalize');
  // JSON.parse keeps only the last of two equal keys, so count them in the text.
  assert.equal(raw.split('"crm_activity_recording_finalize"').length - 1, 1, 'listed once');
  assert.equal(config.tools.crm_activity_recording_presign, undefined);
});
