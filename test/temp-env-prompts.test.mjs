/**
 * Codex prompts before every temporary environment write (2026-11-13).
 *
 * A temporary environment shows one branch of a site on its own address and Hiveku link for 1, 3 or 7 days, at 50
 * cents a day. The tool server adds fifteen project_vcs_temp_env* tools (MCP feature/temporary-environments), and this
 * plugin ships its prompts first, so Codex asks from the day the server serves them. The server default here is
 * "approve", so without an entry each would run with nobody asked.
 *
 * All ten writes prompt. Codex asks only while approvals are on, and with approvals and the sandbox off nothing
 * prompts (README, Notes), so a prompt here is the ask-mode answer, which the plan gives every write: the seven that
 * ask in full access too (create, extend, revive and try_again, which add 50 cents a day to the account's bill;
 * password_set, settings_set and delete) and the three that ask in ask mode only (update, request_dismiss, open). The
 * five reads follow the default. The entries sit right after project_vcs_checks_rerun, in the order of the Claude Code
 * plugin's ask list, whose mirror test keeps the two lists equal when both checkouts sit side by side.
 *
 * A batch cannot carry one past the person: hiveku_batch prompts itself, and the hooks plugin refuses a batch that
 * carries any tool this map prompts, naming it, so the agent calls it on its own (pinned for these ten below, through
 * the real hook). The tool server also refuses the seven as batch members (its DIRECT_CALL_ONLY_TOOLS).
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
const config = JSON.parse(fs.readFileSync(path.join(root, 'plugins', 'hiveku', '.mcp.json'), 'utf8')).hiveku;
const PRE_HOOK = path.join(root, 'plugins', 'hiveku-hooks', 'hooks', 'pre-tool-use.sh');
const LONG = 600_000; // the machine can be heavily loaded

/** The ten writes, in the Claude Code plugin's ask list order. */
const WRITES = [
  'project_vcs_temp_env_create',
  'project_vcs_temp_env_update',
  'project_vcs_temp_env_extend',
  'project_vcs_temp_env_revive',
  'project_vcs_temp_env_try_again',
  'project_vcs_temp_env_password_set',
  'project_vcs_temp_env_settings_set',
  'project_vcs_temp_env_delete',
  'project_vcs_temp_env_request_dismiss',
  'project_vcs_temp_env_open',
];
const READS = [
  'project_vcs_temp_envs_list',
  'project_vcs_temp_env_get',
  'project_vcs_temp_envs_find',
  'project_vcs_temp_envs_requests_list',
  'project_vcs_temp_envs_usage_get',
];

/** Runs the hooks plugin's real PreToolUse script on a hiveku_batch carrying `tools`. */
function runBatch(tools) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-codex-temp-env-'));
  const run = spawnSync('bash', [PRE_HOOK], {
    input: JSON.stringify({
      session_id: '019a0000-0000-7000-8000-00000000c0de',
      turn_id: 't1',
      transcript_path: null,
      cwd: os.tmpdir(),
      hook_event_name: 'PreToolUse',
      model: 'gpt-5-codex',
      permission_mode: 'default',
      tool_name: 'mcp__hiveku__hiveku_batch',
      tool_input: {
        calls: tools.map((tool) => ({ tool, args: { project_id: '8f14e45f-ceea-467a-9575-2f3b5e6a1c01', branch: 'feature/x' } })),
      },
      tool_use_id: 'call_batch_1',
    }),
    encoding: 'utf8',
    timeout: LONG,
    env: { PATH: process.env.PATH, HOME: tmp, TMPDIR: `${tmp}/` },
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

test('every temporary environment write prompts, right after project_vcs_checks_rerun, each listed once', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  for (const name of [...WRITES, 'hiveku_batch']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
  const names = Object.keys(config.tools);
  for (const name of WRITES) assert.equal(names.filter((n) => n === name).length, 1, `${name} listed once`);
  const at = names.indexOf('project_vcs_checks_rerun');
  assert.ok(at >= 0, 'project_vcs_checks_rerun is in the map');
  assert.deepEqual(names.slice(at + 1, at + 1 + WRITES.length), WRITES, 'in the ask list order, after the checks rerun');
});

test('the five reads follow the default and do not prompt', () => {
  for (const name of READS) assert.equal(config.tools[name], undefined, `${name} is a read and must not prompt`);
});

test('the hooks plugin refuses a batch carrying any of them and names each, and lets the reads through', () => {
  for (const name of WRITES) {
    const out = runBatch(['project_vcs_env_bindings', name]);
    assert.notEqual(out, '', `a batch carrying ${name} ran: Codex would ask once for the batch, not for ${name}`);
    const { permissionDecision, permissionDecisionReason } = JSON.parse(out).hookSpecificOutput;
    assert.equal(permissionDecision, 'deny', name);
    assert.match(permissionDecisionReason, new RegExp(`^Not run: this hiveku_batch carries ${name}, which Codex asks`));
  }
  assert.equal(runBatch(READS), '', 'a batch of the reads is not refused');
});
