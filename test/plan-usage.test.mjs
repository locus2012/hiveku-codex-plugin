/**
 * The account's plan and its limits in the Codex plugin (agent plan and usage,
 * notes/plans-update-2026-10-09/agent-plan-usage-plan.md sections 5, 6 and 8).
 * The builder writes the words once (builder #1332,
 * src/lib/platform-guide/plan-usage.ts, served with no key at
 * /api/public/platform-guide/plan-usage) and every surface copies them byte
 * for byte. The MCP server carries the tool text and lifts limit_kind,
 * message, hint and billing_url to the top of a refused tool's error (MCP #225).
 *
 * Pinned here, against the builder's sha256:
 *   (a) the SessionStart hook prints the builder's PLAN_LIMIT_LINE and where to
 *       read the plan, on the line right after the memory_write_refused
 *       carve-out, only when connected, as static text;
 *   (b) hiveku-orient's "Your plan and its limits" carries PLAN_USAGE_RULES
 *       byte for byte, and "Not Hiveku defects" carries the limit line right
 *       after the memory refusal (which still comes first, inside the doctrine
 *       test's 500 characters);
 *   (c) the email section states Outbound's price and its refusal.
 * The release (plugin.json and the X-Hiveku-Client header moving together) is
 * pinned by test/declared-client.test.mjs.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The builder's pins (builder #1332, src/lib/platform-guide/plan-usage.ts). */
const PINS = {
  rules: '47c67705703688cccb9517b4487f80cc83f113a3f5ab621ee243d1feb3161460',
  limitLine: '4060de89cfddad4ff37857bd24c7776e23a32c565fdf9b14ca63dbaf401aad1b',
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(root, 'plugins', 'hiveku', 'hooks', 'session-start.sh');
const ORIENT = path.join(root, 'plugins', 'hiveku', 'skills', 'hiveku-orient', 'SKILL.md');
const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
/** Prose as one line: whitespace collapsed. */
const flat = (text) => text.replace(/\s+/g, ' ').trim();

const RULES_HEAD = "Hiveku rules: the account's plan and its limits";
const RULES_TAIL = "- Say this only to the account's own people, never to a customer or caller.";
const LIMIT_HEAD = 'A tool answer with limit_kind (';
const READ_THE_PLAN = ' Before work the plan counts, call account_usage_get.';

function runHook(env) {
  const run = spawnSync('bash', [HOOK], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

/** The rules block from its heading to its last bullet, or null. */
function rulesBlock(text) {
  const start = text.indexOf(RULES_HEAD);
  if (start < 0) return null;
  const end = text.indexOf(RULES_TAIL, start);
  return end < 0 ? null : text.slice(start, end + RULES_TAIL.length);
}

/** The limit line from its first words to the end of its line, or null. */
function limitLine(text) {
  const start = text.indexOf(LIMIT_HEAD);
  if (start < 0) return null;
  const end = text.indexOf('\n', start);
  return text.slice(start, end < 0 ? undefined : end);
}

test("(a) the SessionStart hook prints the builder's limit line right after the carve-out, only when connected", () => {
  const lines = runHook({ HIVEKU_TOKEN: 'hvk_test' }).trim().split('\n');
  const carveOut = lines.findIndex((line) => line.includes('memory_write_refused'));
  assert.ok(carveOut >= 0, 'the hook prints the memory_write_refused carve-out');
  const line = lines[carveOut + 1] ?? '';
  assert.ok(line.startsWith(`Hiveku: ${LIMIT_HEAD}`), 'the limit line follows the carve-out line');
  assert.ok(line.endsWith(READ_THE_PLAN), 'and says where to read the plan');
  const copied = line.slice('Hiveku: '.length, line.length - READ_THE_PLAN.length);
  assert.equal(sha256(copied), PINS.limitLine, "the hook line is not the builder's PLAN_LIMIT_LINE");
  assert.doesNotMatch(runHook({}), /limit_kind|account_usage_get/, 'nothing about the plan without a token');
  const src = fs.readFileSync(HOOK, 'utf8').split('\n').find((l) => l.includes(LIMIT_HEAD));
  assert.match(src, /^echo "Hiveku: /);
  assert.doesNotMatch(src, /\$/, 'no variable is expanded into the line');
  assert.ok(!src.includes('`'), 'nothing in the line runs as a command');
});

test("(b) hiveku-orient carries the builder's rules and limit line byte for byte, in their places", () => {
  const orient = fs.readFileSync(ORIENT, 'utf8');
  const start = orient.indexOf('## Your plan and its limits');
  assert.ok(start > 0, 'orient has the section "Your plan and its limits"');
  const section = orient.slice(start, orient.indexOf('\n## ', start + 1));
  assert.equal(sha256(rulesBlock(section) ?? ''), PINS.rules, "the section does not carry the builder's PLAN_USAGE_RULES byte for byte");
  assert.match(section, /`account_usage_get`/);
  assert.match(flat(section), /`limit_kind` at the top/);
  const defects = orient.slice(orient.indexOf('**Not Hiveku defects:**'), orient.indexOf('- **Only problems you hit yourself.**'));
  const refusal = defects.indexOf('memory_write_refused');
  const limit = defects.indexOf(LIMIT_HEAD);
  assert.ok(refusal > 0 && limit > refusal, 'the limit line follows the memory refusal');
  assert.equal(sha256(limitLine(defects.slice(limit)) ?? ''), PINS.limitLine, "the defects list does not carry the builder's PLAN_LIMIT_LINE byte for byte");
});

test("(c) the email section states Outbound's price and its refusal", () => {
  assert.ok(
    flat(fs.readFileSync(ORIENT, 'utf8')).includes(
      'Outbound is a paid add-on at $125 a month, by request (hello@hiveku.com); without it, outbound tools answer 402 `outbound_not_enabled` (limit_kind add_on).',
    ),
  );
});

test('(a, b) the pins fail on a reworded or missing copy (negative control)', () => {
  const orient = fs.readFileSync(ORIENT, 'utf8');
  assert.notEqual(sha256(rulesBlock(orient).replace('never from memory', 'not from memory')), PINS.rules);
  assert.equal(rulesBlock(orient.replace(RULES_HEAD, 'Hiveku rules: the plan')), null, 'a renamed block is not found');
  const line = limitLine(orient.slice(orient.indexOf('**Not Hiveku defects:**')));
  assert.notEqual(sha256(line.replace('Never retry it unchanged', 'Do not retry it')), PINS.limitLine);
  assert.equal(limitLine('the carve-out as it was, with no limit line'), null);
});
