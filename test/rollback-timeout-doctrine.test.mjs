/**
 * A rollback apply that times out (versions program, Wave 3).
 *
 * The MCP tool (hiveku-mcp-api-server src/tools/versions-tools.ts,
 * project_vcs_rollback): a 524 or a timeout on an apply does NOT mean it
 * failed. A big rollback outlasts the edge's ~100 s limit and keeps running;
 * an identical call carries the same Idempotency-Key, so it answers 409
 * idempotency_pending while the first run is going and that run's answer once
 * it is done. When unsure, project_vcs_history first (a new version whose
 * rolled_back_to is the target means it finished); no new dry run until then.
 * The Claude Code plugin's /hiveku:rollback and the VS Code /hiveku-rollback
 * carry the same bullet.
 *
 * Wave 3c: the builder replays a cached answer only when that run succeeded
 * and nothing was saved since (versionStillCurrent); otherwise the re-send
 * runs again and can answer 409 branch_changed although files WERE written
 * (the first run finished, or stopped after its "Saved before rollback"
 * version). So the replay promise is qualified, the History check is tied to
 * the dry run's head (an older rollback to the same target also has that
 * rolled_back_to), and a branch_changed re-send never reads as "nothing
 * changed".
 *
 * Wave 3c review: "Saved before rollback" is the name every rollback's
 * save-first version gets (a teammate's dashboard rollback, an AI-turn Undo),
 * so a re-send's branch_changed finishes on the same yes only when that
 * version is the ONLY one newer than the dry run's head; anything else is a
 * new dry run and a new yes.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIP = 'plugins/hiveku/skills/hiveku-ship/SKILL.md';
/** Collapse whitespace and drop backticks so a pinned phrase may wrap and carry them. */
const flat = (s) => s.replace(/`/g, '').replace(/\s+/g, ' ');

/** The "## Go back to an earlier version" section, up to the next heading. */
function goBack(text) {
  const start = text.indexOf('## Go back to an earlier version');
  assert.notEqual(start, -1, 'the ship skill has the go-back section');
  const next = text.indexOf('\n## ', start + 1);
  return flat(text.slice(start, next === -1 ? undefined : next));
}

/** The whole timeout bullet in the ship skill (its prose wraps, so \s+ between words). */
const BULLET = /\n {3}- A 524 or a timeout on the apply[\s\S]*?run\s+a\s+new\s+dry\s+run\s+and\s+ask\s+again\./;

function assertTimeoutBullet(text) {
  const back = goBack(text);
  for (const token of [
    'A 524 or a timeout on the apply does NOT mean it failed',
    'Call again with exactly the same arguments',
    'answers 409 idempotency_pending while the first run is still going',
    'the same call gives back its answer only when it succeeded and nothing was saved since',
    'so it never rolls back twice',
    "read project_vcs_history first: a version newer than the dry run's head_commit_id whose rolled_back_to is the target means it finished",
    'Do not start a new dry run until you know.',
    // A re-send can answer branch_changed although files were written.
    'If the re-send answers 409 branch_changed, the first run may have finished or stopped part way, so never say nothing changed: read project_vcs_history.',
    "A version newer than the dry run's head_commit_id whose rolled_back_to is the target means it finished.",
    // Tied to the dry run's head: the name "Saved before rollback" is shared by
    // every rollback (a teammate's dashboard rollback, an AI-turn Undo), so only
    // one sitting directly on the dry run's head can be this rollback's own.
    'A "Saved before rollback" version at the top (the branch_changed answer\'s head_commit_id) that is the ONLY version newer than the dry run\'s head_commit_id means it stopped part way: finish it as for rollback_incomplete (apply with that head_commit_id as expected_head_commit_id, without expected_live_fingerprint, on the same yes).',
    'Anything else, including a "Saved before rollback" version with other versions between it and the dry run\'s head_commit_id, means someone else saved as well: run a new dry run and ask again.',
  ]) {
    assert.ok(back.includes(token), `the go-back section lacks: ${token}`);
  }
  // Any "Saved before rollback" at the top, whoever made it, finished on the same yes.
  assert.doesNotMatch(back, /version at the top \(the branch_changed answer's head_commit_id\) means it stopped part way/);
  // The unqualified replay promise, and a History check any earlier rollback
  // to the same target would also satisfy.
  assert.doesNotMatch(back, /call again\) and that run's own answer once it is done/);
  assert.doesNotMatch(back, /a new version whose rolled_back_to is the target/);
  // It sits with the apply's answers (step 3), before the separate deploy step.
  assert.ok(back.indexOf('A 524 or a timeout') < back.indexOf('Deploying is a separate step'));
}

test('ship: a timed-out rollback apply is re-sent with the same arguments or checked in History, never re-dry-run first', () => {
  assertTimeoutBullet(fs.readFileSync(path.join(root, SHIP), 'utf8'));
});

test('negative control: the go-back section without the bullet fails', () => {
  const text = fs.readFileSync(path.join(root, SHIP), 'utf8');
  const without = text.replace(BULLET, '');
  assert.notEqual(without, text, 'the bullet was found and removed');
  assert.throws(() => assertTimeoutBullet(without));
});

test('negative control: the Wave 2 bullet (unqualified replay, no branch_changed case) fails', () => {
  const text = fs.readFileSync(path.join(root, SHIP), 'utf8');
  const wave2 =
    '\n   - A 524 or a timeout on the apply does NOT mean it failed: a big rollback can outlast the edge\'s\n' +
    '     limit of about 100 seconds and keep running. Call again with exactly the same arguments: an\n' +
    '     identical call answers 409 `idempotency_pending` while the first run is still going (wait, then\n' +
    '     call again) and that run\'s own answer once it is done, so it never rolls back twice. When unsure,\n' +
    '     read `project_vcs_history` first: a new version whose `rolled_back_to` is the target means it\n' +
    '     finished. Do not start a new dry run until you know.';
  const old = text.replace(BULLET, wave2);
  assert.notEqual(old, text, 'the bullet was found and replaced');
  assert.throws(() => assertTimeoutBullet(old));
});

test('negative control: the Wave 3c finish rule (any "Saved before rollback" at the top) fails', () => {
  const text = fs.readFileSync(path.join(root, SHIP), 'utf8');
  const unanchored = text.replace(
    /\) that is the ONLY version newer than the dry run's\s+`head_commit_id` means it stopped part way/,
    ') means it stopped part way',
  );
  assert.notEqual(unanchored, text, 'the anchor was found and removed');
  assert.throws(() => assertTimeoutBullet(unanchored));
});
