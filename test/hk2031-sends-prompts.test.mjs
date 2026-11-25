/**
 * Codex prompts before four sends that each reach people outside the team in one call (2026-11-25, HK-2031). The
 * Hiveku desktop app has asked before them since desktop PR #770; the Claude Code plugin's ask list and this file did
 * not name them, so they ran unasked:
 *   - marketing_template_test_send sends a real test of a marketing template to the one address the call names, from
 *     noreply@ the account's own sending domain;
 *   - email_send_test sends a real email with the call's own subject and words to up to 10 addresses it names, from
 *     Hiveku's platform address or one on a domain the account has verified;
 *   - accounting_invoice_send emails or texts an invoice with its pay link to the customer, or to up to 10 addresses
 *     the call names, and marks a draft invoice sent (without confirm: true it only previews, but the model fills that
 *     in, and Codex cannot look at a call's arguments before it asks, so the preview prompts too);
 *   - survey_send sends a survey or review request by email or text to up to 200 contacts or addresses.
 * Each sits right after the send it is closest to, as the Claude Code plugin's ask list has them; that plugin's mirror
 * test keeps the two lists equal when both checkouts sit side by side. The reads and drafts beside them follow the
 * default.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

/** Each send, and the prompt it sits right after. */
const SENDS = new Map([
  ['marketing_template_test_send', 'workflow_email_step_test_send'],
  ['email_send_test', 'marketing_template_test_send'],
  ['accounting_invoice_send', 'crm_estimate_send'],
  ['survey_send', 'marketing_report_send'],
]);

test('the four sends of HK-2031 require a prompt, each listed once, right after the send it is closest to', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  const names = Object.keys(config.tools);
  for (const [name, after] of SENDS) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
    assert.equal(names.filter((each) => each === name).length, 1, `${name} is listed once`);
    assert.equal(names[names.indexOf(after) + 1], name, `${name} right after ${after}`);
  }
});

test('the reads and drafts beside them are not added', () => {
  for (const name of [
    'marketing_template_quality_check',
    'marketing_template_usage',
    'marketing_merge_preview',
    'accounting_invoice_create',
    'accounting_invoice_get',
    'survey_create',
    'survey_results',
  ]) {
    assert.equal(config.tools[name], undefined, `${name} follows the default and must not prompt`);
  }
});
