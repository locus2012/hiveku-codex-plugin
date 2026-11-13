/**
 * Codex prompts before a connected Gmail inbox is limited to one label (HK-1636, 2026-11-12).
 *
 * email_connection_read_label limits what Hiveku reads of a connected Gmail inbox to one label, changes the label, or
 * removes the limit. A label narrows what Hiveku reads, so a reply without it no longer stops a sequence or opens a
 * ticket; removing the limit lets Hiveku read the whole mailbox again. Hiveku takes it from the inbox's own person only
 * (an owner or admin for an inbox no one owns). The server default is "approve", so without an entry it would run with
 * no one asked, and the batch wrapper prompts too because Codex decides by the called name only. It sits right after
 * the help desk away message, as the Claude Code plugin's ask list has it; that plugin's mirror test keeps the two
 * lists equal when both checkouts sit side by side. The inbox reads beside it follow the default.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

test('limiting an inbox to one Gmail label requires a prompt, right after the help desk away message', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  for (const name of ['email_connection_read_label', 'hiveku_batch']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
  const names = Object.keys(config.tools);
  assert.equal(names.filter((name) => name === 'email_connection_read_label').length, 1, 'listed once');
  assert.equal(names[names.indexOf('helpdesk_away_reply_set') + 1], 'email_connection_read_label', 'beside the help desk away message');
});

test("the orient skill names everyone Hiveku lets change the label, as Hiveku decides it", () => {
  // Hiveku takes the label from the inbox's own person, from an owner or admin for an inbox no one owns, and keeps a
  // label someone chose theirs while they are on the account. A passage that named the inbox's person alone sent an
  // admin away from limiting a shared inbox no one owns.
  const md = readFileSync(new URL('../plugins/hiveku/skills/hiveku-orient/SKILL.md', import.meta.url), 'utf8');
  const start = md.indexOf('**One label only, when the owner asks.**');
  assert.ok(start >= 0, 'the read label bullet is in the orient skill');
  const end = md.indexOf('\n\n', start);
  const passage = md.slice(start, end < 0 ? undefined : end).replace(/\s+/g, ' ');
  for (const words of [
    "Only the inbox's own person may set, change or remove it, whatever their role",
    'an inbox no one owns: an owner or admin',
    'a label someone else chose stays theirs while they are on the account',
    '`read_label_not_yours`',
    '`read_label_owner_or_admin_required`',
    '`read_label_chosen_by_someone_else`',
    'Codex prompts before it runs',
  ]) {
    assert.ok(passage.includes(words), `the bullet says: ${words}`);
  }
  assert.doesNotMatch(passage, /[–—]/, 'no dashes in the bullet');
});

test('the inbox reads beside it are not added', () => {
  for (const name of ['email_connections_list', 'gmail_list_labels', 'email_inbox_setup_guide']) {
    assert.equal(config.tools[name], undefined, `${name} is a read and must not prompt`);
  }
});
