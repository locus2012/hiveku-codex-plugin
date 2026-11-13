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

test('the inbox reads beside it are not added', () => {
  for (const name of ['email_connections_list', 'gmail_list_labels', 'email_inbox_setup_guide']) {
    assert.equal(config.tools[name], undefined, `${name} is a read and must not prompt`);
  }
});
