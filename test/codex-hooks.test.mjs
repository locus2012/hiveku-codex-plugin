/**
 * The Codex versions hooks (versions program Wave 2, design section E2):
 * hooks/post-tool-use.sh keeps a per-session ledger of writes and versions,
 * hooks/pre-tool-use.sh records version attempts (Codex 0.131 runs PostToolUse
 * only for calls that succeeded) and refuses a hiveku_batch that carries a
 * tool Codex asks about, hooks/stop.sh asks once for a version before the
 * agent finishes.
 *
 * The behaviour itself is pinned by the shell suite test/codex-hooks.test.sh
 * (bash with grep, sed and tr; runs where node is absent); this file runs it, and pins
 * what the shell suite cannot see: the hooks.json registration Codex 0.131
 * reads (a regex matcher on "mcp__<server>__<tool>", hooks/src/events/common.rs
 * matches_matcher, the same for PreToolUse and PostToolUse), that the matcher
 * and the script agree on the tool list, that the batch refusal covers exactly
 * the tools .mcp.json sets to prompt, that the answers are valid JSON, and
 * that the scripts stay bash-only and offline with no environment-variable
 * switch.
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
const HOOKS = path.join(root, 'plugins', 'hiveku', 'hooks');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const hooksJson = JSON.parse(read('plugins/hiveku/hooks/hooks.json'));
const postScript = read('plugins/hiveku/hooks/post-tool-use.sh');
const preScript = read('plugins/hiveku/hooks/pre-tool-use.sh');
const stopScript = read('plugins/hiveku/hooks/stop.sh');
const walkScript = read('plugins/hiveku/hooks/json-walk.sh');
const LONG = 600_000; // the machine can be heavily loaded

/**
 * The tools the design's PostToolUse matcher covers (E1, reused by E2), less
 * assets_upload: it writes the shared asset store, which versions do not
 * cover (the Claude plugin leaves it out for the same reason).
 */
const LEDGER_TOOLS = [
  'project_file_save', 'project_file_save_async', 'project_files_bulk_save', 'project_file_delete',
  'project_files_bulk_delete', 'project_file_restore', 'project_file_move', 'project_folder_create',
  'project_folder_delete', 'project_import_finalize', 'project_files_finalize',
  'project_checkpoint_restore', 'checkpoint_restore', 'history_restore_to_time', 'project_vcs_commit',
  'project_vcs_rollback', 'deploy_site', 'hiveku_batch',
];
/** The PreToolUse matcher: the two version tools (attempts) and the batch (refusal). */
const PRE_TOOLS = ['project_vcs_commit', 'project_vcs_rollback', 'hiveku_batch'];

/** Every tool post-tool-use.sh classifies: its two lists, its case arms and its batch arm. */
function scriptTools(script) {
  const list = (name) => (script.match(new RegExp(`^${name}=" ([^"]*) "$`, 'm'))?.[1] ?? '').split(' ').filter(Boolean);
  const arms = [...script.matchAll(/^ {4}([a-z_]+)\)$/gm)].map((m) => m[1]);
  const batch = /^ {4}mcp__hiveku__hiveku_batch\) /m.test(script) ? ['hiveku_batch'] : [];
  return [...list('WRITE_TOOLS'), ...list('RESTORE_TOOLS'), ...arms, ...batch];
}

function matcherRegex(json, event = 'PostToolUse') {
  const groups = json.hooks?.[event] ?? [];
  assert.equal(groups.length, 1, `one ${event} group`);
  return new RegExp(groups[0].matcher);
}

/** The tools .mcp.json sets to "prompt". */
function promptTools() {
  const mcp = JSON.parse(read('plugins/hiveku/.mcp.json')).hiveku;
  return Object.entries(mcp.tools).filter(([, v]) => v.approval_mode === 'prompt').map(([k]) => k);
}

function runPre(input) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-codex-pre-node-'));
  const run = spawnSync('bash', [path.join(HOOKS, 'pre-tool-use.sh')], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: LONG,
    env: { PATH: process.env.PATH, HOME: tmp, TMPDIR: `${tmp}/` },
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

const batchPayload = (tools) => ({
  session_id: '019a0000-0000-7000-8000-00000000c0de',
  turn_id: 't1',
  transcript_path: null,
  cwd: os.tmpdir(),
  hook_event_name: 'PreToolUse',
  model: 'gpt-5-codex',
  permission_mode: 'default',
  tool_name: 'mcp__hiveku__hiveku_batch',
  tool_input: { calls: tools.map((tool) => ({ tool, args: { project_id: '8f14e45f-ceea-467a-9575-2f3b5e6a1c01' } })) },
  tool_use_id: 'call_batch_1',
});

test('the shell suite passes (bash with grep, sed and tr; fixture payloads)', () => {
  const run = spawnSync('bash', [path.join(root, 'test', 'codex-hooks.test.sh')], { encoding: 'utf8', timeout: LONG });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /^# pass \d+ fail 0$/m);
});

test('PostToolUse is registered for exactly the ledger tools on the hiveku server', () => {
  const re = matcherRegex(hooksJson);
  for (const tool of LEDGER_TOOLS) assert.ok(re.test(`mcp__hiveku__${tool}`), `matcher misses ${tool}`);
  for (const miss of [
    'mcp__hiveku__project_file_get', 'mcp__hiveku__project_vcs_status', 'mcp__hiveku__project_vcs_history',
    'mcp__hiveku__project_file_save_extra', 'xmcp__hiveku__project_file_save', 'mcp__other__project_file_save',
    'project_file_save', 'mcp__hiveku__deploy_site ', 'Bash',
  ]) {
    assert.ok(!re.test(miss), `matcher should not match ${miss}`);
  }
  const hook = hooksJson.hooks.PostToolUse[0].hooks;
  assert.deepEqual(hook, [{ type: 'command', command: 'bash "${PLUGIN_ROOT}/hooks/post-tool-use.sh"', timeout: 5 }]);
});

test('the matcher and the script agree on every tool', () => {
  const handled = scriptTools(postScript);
  assert.deepEqual([...handled].sort(), [...LEDGER_TOOLS].sort());
  assert.ok(!matcherRegex(hooksJson).test('mcp__hiveku__assets_upload'), 'assets_upload is not a change to version');
});

test('PreToolUse is registered for the version tools and the batch, and nothing else', () => {
  const re = matcherRegex(hooksJson, 'PreToolUse');
  for (const tool of PRE_TOOLS) assert.ok(re.test(`mcp__hiveku__${tool}`), `matcher misses ${tool}`);
  for (const miss of [
    'mcp__hiveku__project_file_save', 'mcp__hiveku__deploy_site', 'mcp__hiveku__project_vcs_status',
    'mcp__hiveku__project_vcs_commit_extra', 'mcp__other__project_vcs_commit', 'project_vcs_commit', 'Bash',
  ]) {
    assert.ok(!re.test(miss), `matcher should not match ${miss}`);
  }
  assert.deepEqual(hooksJson.hooks.PreToolUse[0].hooks, [
    { type: 'command', command: 'bash "${PLUGIN_ROOT}/hooks/pre-tool-use.sh"', timeout: 5 },
  ]);
  for (const arm of PRE_TOOLS) assert.ok(preScript.includes(`mcp__hiveku__${arm})`), `pre-tool-use.sh handles ${arm}`);
});

test('a batch is refused for exactly the tools .mcp.json sets to prompt', () => {
  const prompted = promptTools().filter((t) => t !== 'hiveku_batch');
  assert.ok(prompted.includes('project_vcs_rollback') && prompted.includes('deploy_site'));
  const out = JSON.parse(runPre(batchPayload([...prompted, 'project_vcs_status', 'project_file_save'])));
  assert.deepEqual(Object.keys(out), ['hookSpecificOutput']);
  const { hookEventName, permissionDecision, permissionDecisionReason } = out.hookSpecificOutput;
  assert.equal(hookEventName, 'PreToolUse');
  assert.equal(permissionDecision, 'deny');
  const named = permissionDecisionReason.match(/^Not run: this hiveku_batch carries (.*), which Codex asks/)[1].split(', ');
  assert.deepEqual(named, prompted);
  for (const allowed of ['project_vcs_status', 'project_file_save', 'project_file_restore', 'project_vcs_history']) {
    assert.equal(runPre(batchPayload([allowed])), '', `${allowed} is not asked about, so a batch may carry it`);
  }
});

test('Stop is registered, and the SessionStart entry is unchanged (its trust hash stays valid)', () => {
  assert.deepEqual(Object.keys(hooksJson.hooks), ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop']);
  assert.deepEqual(hooksJson.hooks.Stop, [
    { hooks: [{ type: 'command', command: 'bash "${PLUGIN_ROOT}/hooks/stop.sh"', timeout: 20 }] },
  ]);
  assert.deepEqual(hooksJson.hooks.SessionStart, [
    {
      hooks: [
        {
          type: 'command',
          command: 'bash ${PLUGIN_ROOT}/hooks/session-start.sh',
          statusMessage: 'Hiveku: checking account connection',
        },
      ],
    },
  ]);
  for (const f of ['pre-tool-use.sh', 'post-tool-use.sh', 'stop.sh', 'session-start.sh']) {
    assert.ok(fs.statSync(path.join(HOOKS, f)).mode & 0o100, `${f} is executable`);
  }
});

test('the checks fail on a wrong registration (negative control)', () => {
  const wrong = { hooks: { PostToolUse: [{ matcher: 'mcp__hiveku__project_file_save', hooks: [] }] } };
  assert.throws(() => {
    const re = matcherRegex(wrong);
    for (const tool of LEDGER_TOOLS) assert.ok(re.test(`mcp__hiveku__${tool}`));
  });
  const unanchored = { hooks: { PostToolUse: [{ matcher: 'mcp__hiveku__(deploy_site)', hooks: [] }] } };
  assert.ok(matcherRegex(unanchored).test('mcp__hiveku__deploy_site_extra'), 'an unanchored matcher over-matches');
  assert.notDeepEqual([...scriptTools('WRITE_TOOLS=" project_file_save "\n')].sort(), [...LEDGER_TOOLS].sort());
  // The prompt-tool check fails when the refusal misses a tool.
  const named = 'project_vcs_rollback, deploy_site'.split(', ');
  assert.notDeepEqual(named, promptTools().filter((t) => t !== 'hiveku_batch'));
});

function runStop(fixture, ledgerLines) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-codex-hooks-node-'));
  const cwd = path.join(tmp, 'cwd');
  fs.mkdirSync(path.join(tmp, 'hiveku-vcs'), { recursive: true });
  fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(tmp, 'hiveku-vcs', '019a0000-0000-7000-8000-00000000c0de.jsonl'), ledgerLines.join('\n') + '\n');
  const input = read(`test/fixtures/codex-hooks/${fixture}`).replace('__CWD__', cwd);
  const run = spawnSync('bash', [path.join(HOOKS, 'stop.sh')], {
    input,
    encoding: 'utf8',
    timeout: LONG,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: `${tmp}/` },
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

const P1 = '8f14e45f-ceea-467a-9575-2f3b5e6a1c01';
const write = (branch) => `{"t":1,"kind":"write","project_id":"${P1}","branch":"${branch}"}`;

test('the Stop answers are valid JSON in the shape Codex reads', () => {
  const block = JSON.parse(runStop('stop.json', [write('main'), write('feature/new-pricing')]));
  assert.deepEqual(Object.keys(block), ['decision', 'reason']);
  assert.equal(block.decision, 'block');
  assert.ok(block.reason.length <= 800, `reason is ${block.reason.length} chars`);
  assert.match(block.reason, /^Before you finish: your changes to project `[^`]+` on branch `feature\/new-pricing` are live in the preview but not saved as a version\. /);
  assert.match(block.reason, /project_vcs_commit\(\{ project_id: "[^"]+", branch: "feature\/new-pricing", message: "a plain-language name of what changed for visitors, such as Updated the pricing section on the Home page" \}\)` with NO files/);
  // Codex HTML-escapes a hook prompt, so the reason carries no angle brackets.
  assert.doesNotMatch(block.reason, /[<>]/);
  // A no-files version holds everyone's unsaved changes (as the Claude plugin says).
  assert.ok(block.reason.includes("It also holds others' unsaved changes: check `project_vcs_status({ project_id, detail: \"files\" })` first and name it for all of it."));
  assert.match(block.reason, /name it for all of it\. Do the same for project `[^`]+`\. If the user asked you not to save a version yet, say so in one line and stop\.$/);

  const notice = JSON.parse(runStop('stop-active.json', [write('main')]));
  assert.deepEqual(Object.keys(notice), ['systemMessage']);
  // A person reads this one: main is "Your site", it says "version", never
  // commit, names no id, and promises no automatic save it cannot vouch for.
  assert.equal(
    notice.systemMessage,
    'Hiveku: your changes to Your site are saved but not a named version yet. Ask Codex to save one, or Hiveku saves them as a version before the next publish.',
  );
  assert.doesNotMatch(notice.systemMessage, /\bmain\b|commit|HEAD|revert|project|[0-9a-f]{8}-|automatically|minutes/i);
});

test('the hooks stay bash-only and offline, with no environment-variable switch', () => {
  const scripts = [
    ['pre-tool-use.sh', preScript, ['TMPDIR']],
    ['post-tool-use.sh', postScript, ['TMPDIR']],
    ['stop.sh', stopScript, ['HOME', 'PWD', 'TMPDIR']],
    ['json-walk.sh', walkScript, []],
  ];
  for (const [name, script, env] of scripts) {
    const code = script.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    assert.doesNotMatch(code, /\b(node|python3?|jq|awk|perl|ruby|curl|wget|nc)\b/, `${name} needs only bash, grep, sed and tr`);
    assert.doesNotMatch(script, /HIVEKU_[A-Z_]*/, `${name} reads no HIVEKU_* variable (the opt-out is .hiveku/guardrails.json)`);
    const envReads = new Set([...code.matchAll(/\$\{?([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]));
    const own = new Set([
      'WRITE_TOOLS', 'DRY_RUN_TOOLS', 'RESTORE_TOOLS', 'ALWAYS_PROMPT', 'ID_RE', 'BRANCH_RE', 'SESSION_RE',
      'CALL_RE', 'TOOL_RE', 'MAX_NAMED', 'INPUT', 'ANSWER', 'LEDGER', 'HOOK_DIR', 'HEADER', 'TOOL_NAME',
    ]);
    const outside = [...envReads].filter((v) => !own.has(v));
    assert.deepEqual(outside.sort(), env, `${name} reads only ${env.join(', ') || 'no'} environment variables`);
  }
  // HOME only bounds the opt-out lookup, as in the Claude plugin.
  assert.match(stopScript, /home=\$\{HOME%\/\}/);
  assert.match(stopScript, /\.hiveku\/guardrails\.json/);
  assert.match(stopScript, /top_level_scalar version_reminder\)" = false/);
});
