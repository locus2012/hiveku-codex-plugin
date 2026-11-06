import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const writes = ['analytics_conversion_create', 'analytics_conversion_delete', 'analytics_tracking_settings_update'];

test('each analytics write and its batch wrapper require a prompt', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  for (const name of [...writes, 'hiveku_batch']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});
