/**
 * Email series, topics and template copies (2026-11-12): Codex prompts before the two sends (turning on a series
 * connected to a form, tag or store, so each new person it adds gets its emails, and a form's confirm-by-email step,
 * which emails every new sign-up) and the four live changes (a series' disconnect stops a live automation, a topic's
 * create and update change the public preference page and who sends leave out, and a template copy writes into
 * another client's account). Their reads follow the default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

const SENDS = ['email_sequence_connection_turn_on', 'marketing_form_confirm_signups_set'];
const LIVE_CHANGES = ['email_sequence_disconnect', 'email_topic_create', 'email_topic_update', 'marketing_template_copy_to_account'];

test('the email series sends and live changes prompt, in order, after the private Discussions reads', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  for (const name of [...SENDS, ...LIVE_CHANGES]) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
  const names = Object.keys(config.tools);
  const at = names.indexOf('discussion_private_search');
  assert.deepEqual(names.slice(at + 1, at + 7), [...SENDS, ...LIVE_CHANGES], 'appended after the other prompts');
});

test('their reads are not added', () => {
  for (const name of ['email_subscription_list', 'marketing_template_copy_targets', 'email_sequence_starters_list']) {
    assert.equal(config.tools[name], undefined, name);
  }
});
