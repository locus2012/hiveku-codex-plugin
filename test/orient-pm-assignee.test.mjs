/**
 * The Codex orient skill teaches PM assignment as it works since projects and
 * sections gained a default assignee (builder PR #205):
 *   - omitting assigned_to_id applies the section's, then the project's,
 *     default; null (or '') creates the task unassigned; an id assigns;
 *   - assignee ids come from pm_project_team (both companies on a shared
 *     project), crm_list_users is this account's own team;
 *   - defaults are set with default_assignee_id on projects and sections;
 *   - review feedback tasks can have their own assignee (review_assignee_id),
 *     picked from project_annotation_settings_get's review_assignee.people;
 *   - review feedback lands in the site's oldest linked PM project that is not
 *     archived; unlinking each older project moves it (unlinking only the
 *     oldest of three hands it to the next-oldest), and archiving is only for
 *     a project whose work is finished (it hides the project's open tasks).
 * The old text said "create tasks unassigned (omit `assigned_to_id`)", which
 * now hands the task to the default assignee instead.
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

/** From the PM tasks bullet to the Owner update bullet. */
function pmSection(text) {
  const start = text.indexOf('- **PM tasks are required**');
  if (start === -1) return '';
  const end = text.indexOf('- **Every completed task ends with an "Owner update"**', start);
  return text.slice(start, end === -1 ? undefined : end);
}

function assertTeachesDefaults(section) {
  assert.match(section, /`pm_project_team\(\{ project_id \}\)`/);
  assert.match(section, /`crm_list_users` is this account's own team only/);
  assert.match(section, /create\s+tasks unassigned by passing `assigned_to_id: null`/);
  assert.match(section, /omit `assigned_to_id` to let the section's default assignee, then the project's, apply/);
  assert.match(section, /pass `null` \(or `''`\) to create the task unassigned/);
  assert.match(section, /`pm_projects_update\(\{ id, default_assignee_id \}\)`/);
  assert.match(section, /`pm_sections_update\(\{ project_id, section_id, default_assignee_id \}\)`/);
  assert.match(section, /`field: 'default_assignee_id'`/);
  assert.match(section, /Moving\s+an unassigned task into a section with a default assigns it/);
  assert.match(section, /review_assignee_id/);
  // review2 C2: the review assignee's id comes with the setting (no
  // crm_list_users on a dev key, no pm_project_team before a project is linked).
  assert.match(section, /Take the id from `project_annotation_settings_get`'s `review_assignee\.people`, which lists the team even\s+before a PM project is linked/);
  assert.doesNotMatch(section, /unassigned \(omit `assigned_to_id`\)/);
  // One primary linked PM project (2026-09-27): review feedback lands in the
  // oldest linked project that is not archived, and the skill says how to move
  // it: unlink first; archive only a finished project, because archiving hides
  // it and its open tasks.
  assert.match(section, /Review feedback lands in\s+the site's oldest linked PM project that is not archived \(`review_assignee\.pm_project`\), and the review\s+assignee must be on that project's team/);
  assert.match(section, /To move it, unlink each older one \(`pm_projects_update` with\s+`website_project_id: null`\); archive it \(`status: 'archived'`\) only when its work is finished, because\s+archiving hides it and all its open tasks from every list/);
  // The retired singular: with three or more linked projects, unlinking only
  // the oldest hands feedback to the next-oldest, not to the one wanted.
  assert.doesNotMatch(section, /unlink the older (project|one)\b/i);
  assert.match(section, /When no linked project is left the next\s+writer creates one, so read `review_assignee\.pm_project` rather than assuming a name/);
  assert.doesNotMatch(section, /archive or unlink/i);
  assert.doesNotMatch(section, /arbitrar/i);
}

test('the Codex orient skill teaches default assignees and the project roster', () => {
  assertTeachesDefaults(pmSection(fs.readFileSync(ORIENT, 'utf8')));
});

test('the check fails on the pre-default wording (negative control)', () => {
  const old =
    '- **PM tasks are required** — create one when you start work, comment as you go, complete it when done,\n' +
    '  attributed to the authenticated user when `crm_list_users` lists them. If it is empty or lacks the\n' +
    '  connected email, that is a real answer: create tasks unassigned (omit `assigned_to_id`), sign comments\n' +
    '  with `author_codename` set to the connected person\'s name. Never borrow another member\'s id or an id\n' +
    '  from another account.\n';
  assert.throws(() => assertTeachesDefaults(pmSection(old)));
});
