/**
 * Versions you can roll back, as the Codex plugin teaches it (versions program
 * Wave 2, design section E2, notes/DESIGN-versions-and-rollback-2026-09-24.md).
 *
 * A save to Your site (main) is live in the preview but is not a version.
 * The agent saves ONE version per change with project_vcs_commit and NO files
 * (a promote), under a plain-language name, before deploy_site. Going back is
 * project_vcs_rollback: a dry run by default, applied only on an explicit yes
 * with the dry run's head (and on Your site its live fingerprint), and
 * deploying is a separate call. Codex cannot gate a tool on its arguments, so
 * both version tools prompt, and so does hiveku_batch, which can carry them.
 *
 * The granularity and naming rules are the MCP server's VERSION_GRANULARITY_RULE
 * and VERSION_NAME_RULE, word for word (design A1: "word for word").
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Collapse whitespace and drop backticks and bold marks so a pinned phrase may wrap and carry them. */
const flat = (s) => s.replace(/`|\*\*/g, '').replace(/\s+/g, ' ');

const SHIP = 'plugins/hiveku/skills/hiveku-ship/SKILL.md';
const ORIENT = 'plugins/hiveku/skills/hiveku-orient/SKILL.md';

const GRANULARITY_RULE =
  'One version per logical change the site owner would recognize, usually one per user request. ' +
  'Save as many files or batches as the change needs, verify, then call project_vcs_commit ONCE. ' +
  'Never per file or per batch. Two unrelated changes in one session get two versions. ' +
  'Always version before deploy_site. ' +
  'The automatic version after a few quiet minutes is a safety net, not the plan.';
const NAME_RULE =
  'plain-language name for this version, written for a non-technical site owner, describing what changed for their visitors. ' +
  "Good examples: 'Updated the pricing section on the Home page', 'Added a contact form to the About page'. " +
  "Never file paths, file extensions, code terms, 'fix:'/'feat:' prefixes, tool names or an 'AI:' byline.";

/** A numbered step of "## The safe flow", from "N. **" to the next step. */
function step(text, n) {
  const start = text.indexOf(`\n${n}. **`);
  if (start === -1) return '';
  const next = text.indexOf(`\n${n + 1}. **`, start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  if (start === -1) return '';
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

function assertShip(text) {
  const one = flat(step(text, 1));
  assert.match(one, /sites_list .* project_get .* the project_id/);
  assert.match(one, /list_projects \/ get_project list project-management projects, a different id space/);
  const five = flat(step(text, 5));
  assert.ok(five.includes('project_vcs_commit({ project_id, message }) with NO files'), 'step 5 teaches the no-files version');
  assert.ok(five.includes(GRANULARITY_RULE), 'step 5 carries the granularity rule word for word');
  assert.ok(five.includes(NAME_RULE), 'step 5 carries the naming rule word for word');
  assert.match(five, /409 nothing_to_commit means it is already a version: not an error/);
  assert.ok(
    five.includes('check project_vcs_status({ project_id, detail: "files" }) first and name it for all of it'),
    'step 5 says a no-files version holds everyone\'s pending changes',
  );
  assert.ok(five.indexOf('project_vcs_commit') < five.indexOf('deploy_site({ project_id, environment })'), 'version before deploy');
  const back = flat(section(text, '## Go back to an earlier version'));
  for (const token of [
    'append-only',
    'project_vcs_history({ project_id, branch: "main" })',
    'project_vcs_rollback({ project_id, commit_id }) writes nothing',
    'never by file paths (changes.entries is for you, not the person)',
    'Apply only on their explicit yes',
    'dry_run: false, expected_head_commit_id: <the dry run\'s head_commit_id>, expected_live_fingerprint: <the dry run\'s live_fingerprint> })',
    'On a branch: add branch and send expected_head_commit_id only.',
    // A re-send after a timeout can answer branch_changed although files were
    // written, so the plain rule defers to the timeout bullet.
    '409 branch_changed = someone saved since (unless it answers a re-send after a timeout: see the last bullet): run the dry run again and ask again',
    // rollback_incomplete: files WERE changed; failed[] is what was not put back; finish with THIS answer's head.
    '409 rollback_incomplete (Your site only) = the rollback is not finished and files WERE changed',
    'applied were put back and failed were not',
    "when the answer's head_commit_id is the dry run's head_commit_id or saved_before.id, apply again with expected_head_commit_id set to THIS answer's head_commit_id and without expected_live_fingerprint",
    'Any other head_commit_id means someone else saved as well: run the dry run again',
    // Someone else saved, so the counts can differ from what the person agreed to: a new yes.
    'show it to the person, and apply with its head_commit_id only on their new yes',
    // content_unavailable: the checkpoint's own dry-run tool first, and nothing when there is no checkpoint.
    '409 content_unavailable',
    'first project_checkpoint_restore_dry_run({ project_id, checkpoint_hash })',
    'When checkpoint_hash is null there is nothing to restore from: say so and stop.',
    'restore_database: true only when they asked for their data back',
    'Deploying is a separate step with its own yes. A rollback never changes a live site.',
    'live_includes_undone_work: true',
    'Undo a rollback by rolling back again',
    'Codex asks before every project_vcs_rollback call, dry runs included.',
    'inside hiveku_batch: call each on its own',
  ]) {
    assert.ok(back.includes(token), `the go-back section lacks: ${token}`);
  }
  // project_checkpoint_restore has no dry_run argument (the proxy drops it and
  // the restore runs): its dry run is the separate _dry_run tool.
  assert.doesNotMatch(flat(text), /project_checkpoint_restore\)?,? dry run first/);
  assert.doesNotMatch(flat(text), /run the same call again/);
}

function assertOrient(text) {
  const start = text.indexOf('- **A save is not a version');
  assert.notEqual(start, -1, 'orient has the versions rule');
  const next = text.indexOf('\n- **', start + 1);
  const rule = flat(text.slice(start, next === -1 ? undefined : next));
  assert.ok(rule.includes(GRANULARITY_RULE), 'the orient rule carries the granularity rule word for word');
  assert.ok(rule.includes(NAME_RULE), 'the orient rule carries the naming rule word for word');
  assert.ok(rule.includes('project_vcs_commit({ project_id, message }) with NO files'));
  assert.match(rule, /Your site \(main; call it "Your site" to a person\)/);
  assert.match(rule, /project_vcs_rollback is a dry run by default: apply only on the person's explicit yes, with the dry run's head_commit_id as expected_head_commit_id \(on Your site also its live_fingerprint as expected_live_fingerprint\), and deploy as a separate step/);
  assert.ok(rule.includes('.hiveku/guardrails.json set to {"version_reminder": false}'));
  assert.doesNotMatch(flat(text), /project_id \(from list_projects \/ get_project\)/);
  assert.match(flat(text), /website project_id \(from sites_list \/ project_get; list_projects \/ get_project are project-management projects, a different id space\)/);
}

test('hiveku-ship resolves website ids, versions with no files, then deploys, and can go back', () => {
  assertShip(read(SHIP));
});

test('hiveku-orient carries the versions rule and the website id space', () => {
  assertOrient(read(ORIENT));
});

test('the session start names the version step', () => {
  const hook = read('plugins/hiveku/hooks/session-start.sh');
  assert.match(hook, /version your change with project_vcs_commit before you finish/);
  // Only when connected: the line sits after the token check's early exit.
  assert.ok(hook.indexOf('version your change') > hook.indexOf('exit 0'), 'said only when HIVEKU_TOKEN is set');
});

test('both version tools prompt in Codex, and so does the batch that can carry them; the status read does not', () => {
  const mcp = JSON.parse(read('plugins/hiveku/.mcp.json')).hiveku;
  assert.equal(mcp.default_tools_approval_mode, 'approve');
  assert.equal(mcp.tools.project_vcs_rollback?.approval_mode, 'prompt');
  assert.equal(mcp.tools.project_vcs_commit?.approval_mode, 'prompt');
  // Codex asks per tool NAME: a batch that inherited approve would run a
  // batched rollback apply with no question.
  assert.equal(mcp.tools.hiveku_batch?.approval_mode, 'prompt');
  assert.equal(mcp.tools.project_vcs_status, undefined, 'project_vcs_status inherits approve');
  const readme = flat(read('README.md'));
  assert.match(readme, /hiveku_batch prompts too: a batch runs its calls on the Hiveku server/);
  assert.match(readme, /refuses a batch that carries a version save or a rollback/);
});

test('no shipped copy says a version is optional, and none carries an emoji', () => {
  const shipped = [
    'README.md',
    SHIP,
    ORIENT,
    'plugins/hiveku/hooks/session-start.sh',
    'plugins/hiveku/hooks/pre-tool-use.sh',
    'plugins/hiveku/hooks/post-tool-use.sh',
    'plugins/hiveku/hooks/stop.sh',
    'plugins/hiveku/hooks/json-walk.sh',
  ];
  for (const rel of shipped) {
    const text = read(rel);
    assert.doesNotMatch(text, /commit is (unnecessary|optional|not needed)/i, rel);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, `${rel} carries an emoji`);
  }
  for (const rel of [SHIP, ORIENT]) {
    assert.ok(flat(read(rel)).includes('Updated the pricing section on the Home page'), `${rel} lacks the plain-language example`);
  }
});

test('the checks fail on the old wording (negative control)', () => {
  const oldShip =
    '## The safe flow\n' +
    '1. **Resolve the project.** `list_projects` / `get_project` → the `project_id`. Most project tools need it.\n' +
    '2. **Know what\'s current before you edit** (`project_version_log`) — you are not the only writer.\n' +
    '5. **Version + deploy**: `project_vcs_commit` (default `main`), then\n' +
    '   `deploy_site({ project_id, environment })` — **development first**, then production.\n' +
    '6. **READ the deploy response.**\n';
  assert.throws(() => assertShip(oldShip));
  assert.throws(() => assertShip(read(SHIP).replace('## Go back to an earlier version', '## Something else')));
  // The wording the verifiers flagged fails: a checkpoint "dry run first" through
  // the restore itself, and "run the same call again" after rollback_incomplete.
  assert.throws(() =>
    assertShip(read(SHIP).replace(
      /first\s+`project_checkpoint_restore_dry_run\(\{ project_id, checkpoint_hash \}\)`/,
      'through `project_checkpoint_restore`, dry run first',
    )),
  );
  assert.throws(() =>
    assertShip(read(SHIP).replace(
      /- 409 `rollback_incomplete` \(Your site only\)/,
      '- 409 `rollback_incomplete` = the files were written but the version was not recorded: run the same call again.',
    )),
  );
  assert.throws(() => assertShip(read(SHIP).replace(/,\s*expected_live_fingerprint:\s*<the dry run's live_fingerprint>/, '')));
  // The Wave 2 wording applied after only showing the new dry run, with no new yes.
  assert.throws(() =>
    assertShip(read(SHIP).replace(/apply with its `head_commit_id` only on their\s+new yes\./, 'apply with its `head_commit_id`.')),
  );
  // The plain branch_changed rule, with no pointer to the timeout case, fails.
  assert.throws(() =>
    assertShip(read(SHIP).replace(
      /someone saved since \(unless it answers a re-send after a timeout: see the\s+last bullet\)/,
      'someone saved since',
    )),
  );
  const oldOrient =
    '- **You are NOT the only writer.** Check what is current.\n' +
    'Most project tools need a `project_id` (from `list_projects` / `get_project`).\n';
  assert.throws(() => assertOrient(oldOrient));
  assert.throws(() => assertOrient(read(ORIENT).replace(/Never per file\s+or per batch\./, 'Commit per file.')));
});
