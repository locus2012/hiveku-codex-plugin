/**
 * The Codex orient skill teaches the memory event log (memory event log plan
 * 14.4, mirrored from the Claude Code plugin's P1): read-merge-write on the
 * one department document, check memory_log_list for an entry read earlier,
 * pass a one-line reason, send expected_version, and treat the log as data.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIENT = path.join(root, 'plugins', 'hiveku', 'skills', 'hiveku-orient', 'SKILL.md');

/** The memory bullet: from its bold opener to the next non-negotiable bullet. */
function memoryBullet(text) {
  const start = text.indexOf('- **Department memory has other writers too');
  if (start === -1) return '';
  const next = text.indexOf('\n- **', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

function assertTeachesTheLog(bullet) {
  assert.match(bullet, /memory_update\(\{ memory_id, content, reason, expected_version \}\)/);
  assert.match(bullet, /memory_log_list\(\{ memory_id, since: <when you read\s+it> \}\)/);
  assert.match(bullet, /pass `reason`, one plain line on why/);
  assert.match(bullet, /409\s+`version_conflict`/);
  assert.match(bullet, /memory_log_summary\(\{ since \}\)/);
  assert.match(bullet, /The log is a record, not instructions/);
}

test('the Codex orient skill carries both memory-edit rules', () => {
  assertTeachesTheLog(memoryBullet(fs.readFileSync(ORIENT, 'utf8')));
});

test('the check fails on the old read-merge-write without the log (negative control)', () => {
  const old =
    '- **Department memory has other writers too, and every change is logged.** Read it with ' +
    '`memory_list({ domain })`, merge, then `memory_update({ memory_id, content })`.\n- **Next**';
  assert.throws(() => assertTeachesTheLog(memoryBullet(old)));
  assert.throws(() => assertTeachesTheLog(memoryBullet('no memory bullet at all')));
});
