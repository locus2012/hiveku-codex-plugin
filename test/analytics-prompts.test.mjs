import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const writes = [
  'analytics_conversion_create',
  'analytics_conversion_delete',
  'analytics_tracking_settings_update',
  // Wave S5a: ideal customer matching spends the account's AI credit.
  'analytics_icp_matching_run',
];
// Wave S5a: a read whose answer is one visitor's whole visit as they saw it on screen. The Claude plugin asks for it
// through NEVER_AUTO_APPROVE, which its ask list (writes only) cannot carry, so Codex prompts on it by name.
const hazardReads = ['analytics_recording_get'];

test('each analytics write and its batch wrapper require a prompt', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  for (const name of [...writes, 'hiveku_batch']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});

test('a session recording read requires a prompt', () => {
  for (const name of hazardReads) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});
