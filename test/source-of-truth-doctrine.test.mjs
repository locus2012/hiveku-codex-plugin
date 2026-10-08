/**
 * Hiveku Memory is the source of truth (Abe, 2026-10-03; plan
 * notes/memory-pages-audit-2026-09-22/agent-log-source-of-truth-plan-2026-10-03.md,
 * sections 3 and 4), in the Codex plugin's instruction files:
 *
 *   (a) the rule, in the same words as the MCP server's own instructions
 *       (MCP #100), in hiveku-orient and in the SessionStart hook, which is
 *       the one channel that reaches every session (a skill loads only when
 *       the model opens it);
 *   (b) a refused memory write (403 memory_write_refused, builder #486; MCP #101
 *       puts its message, memory_page_url and hint at the top of the tool
 *       error) is named apart from "one sensible retry, then report" wherever
 *       that rule is stated: the SessionStart hook and hiveku-orient;
 *   (c) Doing and Done lines with memory_log_add, closed with the other
 *       finishing steps (the Owner update), and the tool is not prompted (it
 *       inherits the server's approve), so recording a line never stops the
 *       session to ask. Since MCP #174 the server writes a connected app's
 *       Doing at the session's first change and its Done when the session goes
 *       quiet or ends: the plugin teaches a Done at the end in the model's own
 *       words, without `thread`, and says so in the SessionStart hook;
 *   (d) a local copy is read again from Hiveku before it is acted on, About
 *       your business with account_memory_get (MCP #174).
 *
 * Also pinned: ppc_bing_rsa_text_update prompts, mirroring the Claude Code
 * plugin's ask list (plugin 0.27.8 added it; its permission-critical test
 * compares this file with that list).
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIENT = path.join(root, 'plugins', 'hiveku', 'skills', 'hiveku-orient', 'SKILL.md');
const HOOK = path.join(root, 'plugins', 'hiveku', 'hooks', 'session-start.sh');
const MCP = path.join(root, 'plugins', 'hiveku', '.mcp.json');
const flat = (s) => s.replace(/\s+/g, ' ').trim();
/** A match on a long text that names the pattern, not the whole text, when it fails. */
const has = (text, re) => assert.ok(re.test(text), `missing: ${re}`);

/**
 * The MCP server's paragraph, as it stands in hiveku-mcp-api-server
 * src/services/mcp-instructions.service.ts (MCP #100, live 2026-10-03, with
 * the two sentences MCP #174 adds), line breaks included. The Codex plugin
 * says the same words: change both together.
 */
const MCP_PARAGRAPH = `Hiveku Memory is the source of truth for this business: read it
  before you act, and follow it over your own assumptions, local files
  or earlier conversation. When something disagrees with memory, trust
  memory and say so. About your business is read with
  \`account_memory_get\`; memory_list and memory_get leave it out. A
  local copy (ACCOUNT_MEMORY.md and the like) may be out of date: read
  it again from Hiveku before you act on it. When \`memory_log_add\` is
  listed, record your work: a Doing line when you start a task for the
  person and a Done line when it ends. Save what you learned with the
  memory_* tools.`;

/** The rule itself, and the two sentences MCP #174 puts right after it, word for word. */
const SOURCE_OF_TRUTH =
  'Hiveku Memory is the source of truth for this business: read it before you act, and follow it over your own assumptions, local files or earlier conversation. When something disagrees with memory, trust memory and say so.';
const ABOUT_YOUR_BUSINESS =
  'About your business is read with `account_memory_get`; memory_list and memory_get leave it out.';
const LOCAL_COPY =
  'A local copy (ACCOUNT_MEMORY.md and the like) may be out of date: read it again from Hiveku before you act on it.';
/** What Hiveku records itself (MCP #174), the same words as the Claude Code plugin's shim. */
const WORK_LOG =
  "Hiveku records this session's Doing at its first change and its Done when the session goes quiet or ends. When the work ends, send a Done with `memory_log_add` and a one-line summary of what you did, if you want the log to say more than the count of changes; leave `thread` out.";

/** The rule, then the two sentences, each once and in that order with nothing between. */
function assertRuleThenSentences(text, where) {
  const folded = flat(text);
  assert.equal(folded.split(SOURCE_OF_TRUTH).length, 2, `${where}: the source-of-truth sentence, word for word, once`);
  assert.ok(folded.includes(`${SOURCE_OF_TRUTH} ${ABOUT_YOUR_BUSINESS} ${LOCAL_COPY}`), `${where}: the two sentences right after it`);
}

/** The Doing/Done teaching since MCP #174: Hiveku records the run; no thread anywhere. */
function assertWorkLog(text, where) {
  const folded = flat(text);
  assert.match(folded, /Hiveku records this session's (work in the memory log itself: its )?Doing/, `${where}: Hiveku records the Doing`);
  assert.match(folded, /goes quiet/, `${where}: the Done when the session goes quiet`);
  assert.match(folded, /`thread` out/, `${where}: leave thread out`);
  assert.doesNotMatch(folded, /line, thread(, outcome)? \}\)|the same `thread`/, `${where}: no thread in a call form`);
}

function assertRefusalCarveOut(text, where) {
  assert.match(text, /memory_write_refused/, `${where}: must name memory_write_refused`);
  assert.match(text, /message/, `${where}: must say to show the message`);
  assert.match(text, /link|memory_page_url/, `${where}: must say to give the link`);
  assert.match(
    text,
    /do not retry it or report it|never retry it unchanged or report it/,
    `${where}: must say not to retry it or report it`,
  );
}

function runHook(env) {
  const r = spawnSync('bash', [HOOK], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('(a) hiveku-orient states the rule in the MCP server\'s words, with the local-copy rule', () => {
  const text = flat(fs.readFileSync(ORIENT, 'utf8'));
  assert.ok(text.includes(flat(MCP_PARAGRAPH)), 'orient states the rule in the MCP server\'s words');
  assertRuleThenSentences(text, 'hiveku-orient');
  has(text, /A local copy is a mirror, and memory wins\./);
  has(text, /re-read the entry live \(`memory_get\(\{ memory_id \}\)` with the `id` in its front matter/);
  // (d) About your business with account_memory_get; department data with the tool its file names.
  has(text, /About your business, `hiveku-data\/account\/ACCOUNT_MEMORY\.md`, with `account_memory_get`, since those two leave it out/);
  has(text, /before you act on a row, read it again live with the tool its file names/);
  has(text, /send its `version` as `expected_version`/);
  // The description names it, so the skill loads for a question about it.
  const front = fs.readFileSync(ORIENT, 'utf8').split('\n---')[0];
  assert.match(front, /^description: ".*Hiveku Memory as the source of truth/m);
});

test('(c) hiveku-orient: Hiveku records the run, the model ends with its own Done, before finishing', () => {
  const text = flat(fs.readFileSync(ORIENT, 'utf8'));
  const work = text.slice(text.indexOf('**Doing and Done lines.**'), text.indexOf('**A refused memory write is an answer, not a fault.**'));
  assertWorkLog(work, 'orient "Doing and Done lines"');
  has(work, /its Doing at the session's first change for an agent, and its Done when the session goes quiet or ends/);
  has(work, /`memory_log_add\(\{ phase: "done", department, line, outcome \}\)`\. It closes the session's run with your line\./);
  has(work, /`memory_log_add\(\{ phase: "doing", department, line \}\)`, becomes the session's Doing/);
  has(work, /answers `already_open`, which is not an error/);
  has(work, /`result` \(`written`, `already_open`, `refused`, `not_installed` or `error`\) never needs a retry/);
  has(text, /Never a customer's words, a secret or anyone's personal details\./);
  has(text, /memory_log_list\(\{ kind: "doing,done" \}\)/);
  const close = text.slice(text.indexOf('**Close the work\'s Doing line.**'));
  assert.ok(close.length < text.length, 'the closing bullet is there');
  has(close.slice(0, 400), /Hiveku closes the session's Doing itself when the session goes quiet or ends/);
  has(close.slice(0, 400), /memory_log_add\(\{ phase: "done", department, line, outcome \}\)/);
  assert.doesNotMatch(text, /line, thread(, outcome)? \}\)|the same `thread`/, 'no call form sends a thread');
  // It sits with the other finishing steps: right after the Owner update.
  assert.ok(text.indexOf('**Close the work\'s Doing line.**') > text.indexOf('**Every completed task ends with an "Owner update"**'));
});

test('(b) hiveku-orient names a refused memory write apart from retry-then-report', () => {
  const text = flat(fs.readFileSync(ORIENT, 'utf8'));
  const refusal = text.slice(text.indexOf('**A refused memory write is an answer, not a fault.**'));
  assert.ok(refusal.length < text.length, 'the refusal bullet is there');
  has(refusal, /403 `memory_write_refused`, with `message` \(one plain sentence\), `memory_page_url` and `hint`/);
  has(refusal, /do not retry it or report it with `hiveku_report_issue`/);
  has(refusal, /`detail: "unclear_owner"`/);
  const defects = text.slice(text.indexOf('**Not Hiveku defects:**'));
  assertRefusalCarveOut(defects.slice(0, 500), 'orient "Not Hiveku defects"');
});

test('(a, b) the SessionStart hook says the rule and the carve-out, only when connected', () => {
  const connected = runHook({ HIVEKU_TOKEN: 'hvk_test' });
  const lines = connected.trim().split('\n');
  const rule = lines.find((l) => l.startsWith('Hiveku: Hiveku Memory is the source of truth'));
  assert.ok(rule, 'the hook prints the rule');
  assert.equal(flat(rule.replace(/^Hiveku: /, '')), flat(MCP_PARAGRAPH), 'in the MCP server\'s words');
  assertRuleThenSentences(rule, 'the hook');
  // What Hiveku records itself, on the line right after the rule.
  assert.equal(lines[lines.indexOf(rule) + 1], `Hiveku: ${WORK_LOG}`);
  assertWorkLog(WORK_LOG, 'the hook work-log line');
  const feedback = lines.find((l) => l.includes('hiveku_report_issue'));
  assertRefusalCarveOut(feedback, 'the hook feedback line');
  // Not connected: only the token warning, as before.
  const unset = runHook({});
  assert.match(unset, /HIVEKU_TOKEN is not set/);
  assert.doesNotMatch(unset, /source of truth|memory_write_refused/);
  // Static text only: nothing in the hook expands a variable into these lines.
  const src = fs.readFileSync(HOOK, 'utf8');
  const echoed = src.split('\n').filter((l) => l.includes('source of truth') || l.includes('memory_write_refused') || l.includes('Hiveku records'));
  assert.ok(echoed.length >= 5, 'the rule, the work-log line, the carve-out and their comments were found');
  for (const l of echoed) {
    assert.doesNotMatch(l, /\$/, 'no variable is expanded into these lines');
    assert.ok(!l.replace(/\\`/g, '').includes('`'), 'every backtick is escaped, so nothing runs as a command');
  }
});

test('(b) the carve-out detector fails on the hook line as it was before (negative control)', () => {
  const before =
    'Hiveku: if a Hiveku tool keeps failing after one sensible retry, or a capability you need is missing, report it ' +
    'with hiveku_report_issue or hiveku_request_feature, and mention it to the user only if it changes what they get.';
  assert.throws(() => assertRefusalCarveOut(before, 'the old line'));
});

test('(c) memory_log_add inherits approve, so a Doing or Done line never stops to ask; the Bing ad text edit prompts', () => {
  const mcp = JSON.parse(fs.readFileSync(MCP, 'utf8')).hiveku;
  assert.equal(mcp.default_tools_approval_mode, 'approve');
  assert.equal(mcp.tools.memory_log_add, undefined);
  assert.equal(mcp.tools.ppc_bing_rsa_text_update?.approval_mode, 'prompt');
  // Its Google twin prompts too.
  assert.equal(mcp.tools.ppc_google_ad_text_update?.approval_mode, 'prompt');
});

test('(a, c, d) negative controls: a removed or reworded sentence, or the old Doing/Done words, fail', () => {
  const hook = runHook({ HIVEKU_TOKEN: 'hvk_test' }).split('\n').find((l) => l.startsWith('Hiveku: Hiveku Memory is the source of truth'));
  assert.throws(() => assertRuleThenSentences(hook.replace(`${ABOUT_YOUR_BUSINESS} `, ''), 'hook without About your business'));
  assert.throws(() => assertRuleThenSentences(hook.replace('may be out of date', 'can be stale'), 'hook reworded'));
  assert.throws(() => assert.equal(flat(hook.replace(`${LOCAL_COPY} `, '').replace(/^Hiveku: /, '')), flat(MCP_PARAGRAPH)));
  const oldBullet =
    '**Doing and Done lines.** When you start a piece of work for the person, record `memory_log_add({ phase: "doing", department, line, thread })`, ' +
    'and when it ends, before your final answer, `memory_log_add({ phase: "done", department, line, thread, outcome })` with the same `thread`.';
  assert.throws(() => assertWorkLog(oldBullet, 'the old orient bullet'));
  const oldMirror = 're-read the entry live (`memory_get({ memory_id })` with the `id` in its front matter, or `memory_list`): follow what that read says';
  assert.doesNotMatch(oldMirror, /with `account_memory_get`/, 'the old local-copy bullet does not name account_memory_get');
});
