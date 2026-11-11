/**
 * Discussions wave S5c (2026-11-11): bringing a team's chat history over from a chat history export. An export holds
 * the whole company's messages and its people's names and emails, so Codex prompts before the start (it begins the
 * upload), the run (up to 500,000 messages into channels the whole team can read), the cancel (before the run it
 * deletes the uploaded file) and the undo (it deletes everything the import brought, for good). The import's reads,
 * the upload's finish (it starts a practice run that writes nothing) and its people matching (it changes only who a
 * not-yet-run import writes as) follow the default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

const IMPORT_WRITES = ['discussion_import_start', 'discussion_import_run', 'discussion_import_cancel', 'discussion_import_undo'];

test('a chat history import\'s start, run, cancel and undo require a prompt, right after the channel delete', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  for (const name of IMPORT_WRITES) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
  const names = Object.keys(config.tools);
  const at = names.indexOf('discussion_delete');
  assert.deepEqual(names.slice(at + 1, at + 1 + IMPORT_WRITES.length), IMPORT_WRITES, 'beside the other Discussions writes');
});

test('the import\'s reads, the upload\'s finish and the people matching are not added', () => {
  for (const name of [
    'discussion_import_list', 'discussion_import_status', 'discussion_import_uploaded',
    'discussion_import_people_list', 'discussion_import_people_map',
  ]) {
    assert.equal(config.tools[name], undefined, name);
  }
});
