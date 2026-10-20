/**
 * The checks and the preview Hiveku starts for each open pull request, in the
 * ship skill (CI checks plan, steps 4 and 5; hiveku_builder #1643 and #1648,
 * MCP #252). A review uses `checks` when they are current and builds the
 * branch itself only without them; the merge line builds the merged result
 * again with "Build before merging"; an open pull request's preview is used,
 * and `live_data` is explained, never worked around without the person's yes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flat = (s) => s.replace(/`|\*\*/g, '').replace(/\s+/g, ' ');
const SHIP = flat(fs.readFileSync(path.join(root, 'plugins/hiveku/skills/hiveku-ship/SKILL.md'), 'utf8'));

test("a review reads the checks Hiveku ran on the branch, and builds it only without them", () => {
  assert.match(SHIP, /checks in project_vcs_pr_get is the build and the site's checks that Hiveku runs on the branch: use it when current is true/);
  assert.match(SHIP, /project_test_build_log_get\(\{ project_id, session_id \}\) has the log/);
  assert.match(SHIP, /Otherwise build it yourself: project_test_build\(\{ project_id, use_db_state: true, branch: <source_branch> \}\)/);
});

test('the merge line builds the merged result again, and a failure names the check', () => {
  assert.match(SHIP, /with "Build before merging" on that the merged result builds and passes the site's checks \(a failure sends it back naming the check/);
});

test("an open pull request's preview is used; live data is explained, never worked around unasked", () => {
  assert.match(SHIP, /preview\.url is a preview of the branch Hiveku started for the pull request/);
  assert.match(SHIP, /preview\.reason: "live_data" means none is started because the site's development settings reach live data/);
  assert.match(SHIP, /start one by hand only on the person's yes/);
  assert.match(SHIP, /a separate Hiveku database for development, DATABASE_URL_DEV, and test keys fix it; never a database outside Hiveku/);
});
