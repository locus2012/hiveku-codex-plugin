import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('shared account settings writes always prompt', () => {
  const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8'));
  const text = JSON.stringify(config);
  for (const name of ['account_settings_update', 'account_settings_logo_set', 'account_settings_logo_remove']) {
    assert.match(text, new RegExp(`"${name}":\\{"approval_mode":"prompt"\\}`));
  }
});
