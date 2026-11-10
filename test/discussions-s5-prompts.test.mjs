/**
 * Discussions waves S5 and S5b (2026-11-10): Codex prompts before making many channels at once and before every read
 * of the person's own direct messages, group messages and private channels, and the orient skill teaches Discussions.
 *
 * Codex asks by the called name only. discussion_channels_bulk_create is a practice run unless dry_run is false, and
 * the Claude Code plugin asks only for the write; here every call prompts, as discussion_update does. The three private
 * reads are GETs whose answer is the hazard: the other people in those conversations never chose to show them to an
 * AI. The server refuses them inside hiveku_batch, and hiveku_batch prompts here anyway.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const orient = readFileSync(new URL('../plugins/hiveku/skills/hiveku-orient/SKILL.md', import.meta.url), 'utf8');

const BULK = 'discussion_channels_bulk_create';
const PRIVATE_READS = ['discussion_private_list', 'discussion_private_messages', 'discussion_private_search'];

test('making many channels and each private read prompt, and so does their batch wrapper', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  for (const name of [BULK, ...PRIVATE_READS, 'hiveku_batch']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});

test('the channel reads, the post and the private door\'s switches are not added', () => {
  // Reading and posting in channels follow the default; the switches are taken from the Hiveku app's own key alone.
  for (const name of [
    'discussion_list', 'discussion_messages_list', 'discussion_search', 'discussion_reply', 'discussion_create',
    'discussion_private_connections_get', 'discussion_private_connection_set', 'discussion_private_workspace_set',
  ]) {
    assert.equal(config.tools[name], undefined, name);
  }
});

/** The orient skill's Discussions section. */
function discussionsSection() {
  const start = orient.indexOf('## Discussions: the team\'s chat');
  assert.ok(start !== -1, 'the orient skill has no Discussions section');
  const end = orient.indexOf('\n## ', start + 1);
  return orient.slice(start, end === -1 ? undefined : end);
}

test('the orient skill teaches Discussions: the tools, the yes, the practice run and the person\'s own messages', () => {
  const section = discussionsSection();
  assert.match(section, /hiveku_playbook_get\(\{ playbook: "team-discussions" \}\)/);
  for (const name of [
    'discussion_list', 'discussion_messages_list', 'discussion_search', 'discussion_team_members', 'discussion_reply',
    'discussion_create', BULK, 'discussion_participant_add', 'discussion_channel_share_request', ...PRIVATE_READS,
  ]) {
    assert.ok(section.includes(`\`${name}\``), `the section names ${name}`);
  }
  assert.match(section, /act only on the person's yes/);
  assert.match(section, /makes nothing unless\s+`dry_run` is `false`/);
  assert.match(section, /Ask before each read, every time/);
  assert.match(section, /read only/);
  assert.match(section, /private_reads_off/);
  assert.match(section, /workspace_private_reads_off/);
  assert.match(section, /in the Hiveku app/);
  // Plain words: no em dash, and no other chat product's name in what a customer reads.
  assert.doesNotMatch(section, /\u2014|\u2013/);
  assert.doesNotMatch(section, /slack/i);
});
