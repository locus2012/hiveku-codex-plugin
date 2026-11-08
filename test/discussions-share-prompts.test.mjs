import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

test('sending or cancelling a request to share a channel, and editing a channel, require a prompt', () => {
  for (const name of ['discussion_channel_share_request', 'discussion_channel_share_request_cancel', 'discussion_update']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});
