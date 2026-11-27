/**
 * Codex prompts before Microsoft's automated extensions switch (HK-2106, 2026-11-27).
 *
 * ppc_bing_automated_extensions_set switches Microsoft Ads automated extension groups (callouts, snippets, sitelinks
 * and the rest Microsoft writes from the site) off or back on for the whole ad account, so it changes how every live ad
 * serves. It previews, then repeats with confirm: true and the preview's hash, and the model can send both. Like the
 * other Microsoft writes beside it, its MCP description does not say ASK THE PERSON FIRST, and the server default here
 * is "approve", so without its own prompt entry it would run with no one asked.
 *
 * It sits right after ppc_bing_url_tracking_set, the account-level Microsoft write with the same preview contract, in
 * the Claude Code plugin's ask list order; that plugin's mirror test keeps the two lists equal when both checkouts sit
 * side by side. Its read, ppc_bing_automated_extensions_get, changes nothing and gets no entry.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8');
const config = JSON.parse(raw).hiveku;

test('the server default is approve, so the switch needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('the switch requires a prompt, right after ppc_bing_url_tracking_set, and its read gets no entry', () => {
  const names = Object.keys(config.tools);
  assert.deepEqual(config.tools.ppc_bing_automated_extensions_set, { approval_mode: 'prompt' });
  assert.deepEqual(config.tools.ppc_bing_url_tracking_set, { approval_mode: 'prompt' });
  assert.equal(names[names.indexOf('ppc_bing_url_tracking_set') + 1], 'ppc_bing_automated_extensions_set');
  // JSON.parse keeps only the last of two equal keys, so count them in the text.
  assert.equal(raw.split('"ppc_bing_automated_extensions_set"').length - 1, 1, 'listed once');
  assert.equal(config.tools.ppc_bing_automated_extensions_get, undefined);
});
