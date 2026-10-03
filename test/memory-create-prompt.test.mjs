/**
 * Codex asks before memory_create, as it does before memory_update,
 * memory_delete, memory_restore_version, memory_bulk_create and
 * account_memory_append (memory surfaces audit 2026-09-27, G7, Codex part;
 * release 0.3.0).
 *
 * A rule, skill, shortcut (command) or specialist (agent) created without an
 * agent is "Shared with every agent" on the Memory page, and every agent
 * follows it. The plugin prompted before account_memory_append,
 * memory_update, memory_delete, memory_restore_version and
 * memory_bulk_create, but not before memory_create, so a rule made from Codex
 * could become shared with nobody asked. Codex decides whether to ask by the
 * tool NAME, before it sees the arguments, so memory_create prompts on every
 * call, a new agent's Notes included; the memory reads stay unprompted.
 *
 * The PreToolUse hook refuses a hiveku_batch that carries any tool .mcp.json
 * prompts (hooks/pre-tool-use.sh), so with this entry a memory_create inside a
 * batch is refused and the agent calls it on its own, where the person is
 * asked. That half runs the real hook against the real .mcp.json, and against
 * a copy without the entry, where the same batch goes through (the negative
 * control).
 *
 * The Claude Code plugin's test/permission-critical.test.mjs compares this
 * map with its ask list when both checkouts sit side by side. memory_create is
 * not on that list (its hook asks by argument), so it needs a
 * CODEX_ONLY_PROMPTS entry there.
 *
 * Not every memory write prompts (PR #25 review, F5):
 * onboarding_write_department_memory, the onboarding interview's own write to
 * an agent's Notes, is not in this map, and the Claude Code plugin keeps it
 * silent too (its tool-safety negative control). The README and the
 * hiveku-remember skill say so, so this test pins that it stays unprompted:
 * give it a prompt and change those two together.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(root, 'plugins', 'hiveku');
const MCP_JSON = path.join(PLUGIN, '.mcp.json');
const LONG = 600_000; // the machine can be heavily loaded

/** The memory writes the skills and the README name: each one asks the person first. */
const MEMORY_WRITES = [
  'memory_create',
  'memory_update',
  'memory_delete',
  'memory_restore_version',
  'memory_bulk_create',
  'account_memory_append',
];
/** Memory writes the skills and the README say do not prompt (F5). */
const UNPROMPTED_MEMORY_WRITES = ['onboarding_write_department_memory'];
/** The memory reads: none of them may prompt, or every look at memory stalls. */
const MEMORY_READS = [
  'memory_list',
  'memory_get',
  'memory_log_list',
  'memory_log_summary',
  'memory_list_versions',
  'account_memory_get',
  'account_context_get',
];

function assertMemoryPrompts(cfg) {
  const server = cfg?.hiveku ?? {};
  // The per-tool entries are the gate only because the default approves.
  assert.equal(server.default_tools_approval_mode, 'approve');
  const tools = server.tools ?? {};
  for (const name of MEMORY_WRITES) {
    assert.equal(tools[name]?.approval_mode, 'prompt', `${name} changes what the agents know, so Codex must ask before it`);
  }
  for (const name of MEMORY_READS) {
    assert.notEqual(tools[name]?.approval_mode, 'prompt', `${name} only reads; it must not prompt`);
  }
  for (const name of UNPROMPTED_MEMORY_WRITES) {
    assert.notEqual(
      tools[name]?.approval_mode,
      'prompt',
      `${name}: the README and hiveku-remember say it does not prompt; change them together with this entry`,
    );
  }
}

const readConfig = () => JSON.parse(fs.readFileSync(MCP_JSON, 'utf8'));

test('memory_create prompts with the other memory writes, and the memory reads do not', () => {
  assertMemoryPrompts(readConfig());
});

test('the check fails when memory_create is missing, a read prompts, or the doctrine goes stale (negative control)', () => {
  const without = readConfig();
  delete without.hiveku.tools.memory_create;
  assert.throws(() => assertMemoryPrompts(without), /memory_create/);
  const readPrompts = readConfig();
  readPrompts.hiveku.tools.memory_list = { approval_mode: 'prompt' };
  assert.throws(() => assertMemoryPrompts(readPrompts), /memory_list/);
  const onboardingPrompts = readConfig();
  onboardingPrompts.hiveku.tools.onboarding_write_department_memory = { approval_mode: 'prompt' };
  assert.throws(() => assertMemoryPrompts(onboardingPrompts), /onboarding_write_department_memory/);
});

const batchPayload = (calls) => ({
  session_id: '019a0000-0000-7000-8000-00000000c0de',
  turn_id: 't1',
  transcript_path: null,
  cwd: os.tmpdir(),
  hook_event_name: 'PreToolUse',
  model: 'gpt-5-codex',
  permission_mode: 'default',
  tool_name: 'mcp__hiveku__hiveku_batch',
  tool_input: { calls },
  tool_use_id: 'call_batch_memory',
});

const MEMORY_BATCH = [
  { tool: 'memory_list', args: { type: 'rule' } },
  {
    tool: 'memory_create',
    args: {
      type: 'rule',
      name: 'refund-wording',
      content: '<!-- department: helpdesk -->\nAlways say "refund", never "credit". {not: [structure]}',
    },
  },
];

/** Runs pre-tool-use.sh from `pluginDir`/hooks, which reads `pluginDir`/.mcp.json. */
function runPre(pluginDir, input) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-codex-memory-pre-'));
  const run = spawnSync('bash', [path.join(pluginDir, 'hooks', 'pre-tool-use.sh')], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: LONG,
    env: { PATH: process.env.PATH, HOME: tmp, TMPDIR: `${tmp}/` },
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

/** A copy of the plugin's hooks beside a .mcp.json changed by `edit`. */
function pluginCopy(edit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-codex-memory-plugin-'));
  fs.mkdirSync(path.join(dir, 'hooks'));
  for (const f of ['pre-tool-use.sh', 'json-walk.sh']) {
    fs.copyFileSync(path.join(PLUGIN, 'hooks', f), path.join(dir, 'hooks', f));
  }
  const cfg = readConfig();
  edit(cfg);
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify(cfg, null, 2));
  return dir;
}

test('a hiveku_batch carrying memory_create is refused, so the create is asked about on its own', () => {
  const out = JSON.parse(runPre(PLUGIN, batchPayload(MEMORY_BATCH)));
  const { hookEventName, permissionDecision, permissionDecisionReason } = out.hookSpecificOutput;
  assert.equal(hookEventName, 'PreToolUse');
  assert.equal(permissionDecision, 'deny');
  assert.equal(
    permissionDecisionReason,
    'Not run: this hiveku_batch carries memory_create, which Codex asks the person about before every call. ' +
      'Call it on its own, not inside hiveku_batch, so the person is asked about that call; batch only the other calls',
  );
  // A batch of memory reads alone still goes through.
  assert.equal(runPre(PLUGIN, batchPayload([MEMORY_BATCH[0], { tool: 'memory_log_summary', args: {} }])), '');
});

test('without the memory_create entry the same batch goes through unasked (negative control)', () => {
  const dir = pluginCopy((cfg) => {
    delete cfg.hiveku.tools.memory_create;
  });
  assert.equal(runPre(dir, batchPayload(MEMORY_BATCH)), '');
  // The copy itself is sound: with the entry back, the batch is refused again.
  const intact = pluginCopy(() => {});
  assert.equal(JSON.parse(runPre(intact, batchPayload(MEMORY_BATCH))).hookSpecificOutput.permissionDecision, 'deny');
});
