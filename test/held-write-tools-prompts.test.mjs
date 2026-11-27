/**
 * Codex prompts before the four writes held on MCP branches until the plugins ask for them (2026-11-27).
 *
 * seo_gbp_google_updates_resolve keeps or undoes Google's own changes to a live Google Business Profile listing
 * (HK-2194). accounting_invoice_delete deletes a never sent draft invoice and accounting_invoice_void voids an invoice,
 * and neither can be undone (HK-2177). helpdesk_ticket_delete deletes a done help desk ticket, and no screen brings it
 * back (HK-2179). Each MCP description says ASK THE PERSON FIRST, but the server default here is "approve", so without
 * its own prompt entry each would run with no one asked.
 *
 * Each sits right after the tool it is closest to, in the Claude Code plugin's ask list order; its mirror test keeps the
 * two lists equal when both checkouts sit side by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const HELD = new Map([
  ['seo_gbp_google_updates_resolve', 'seo_gbp_location_update'],
  ['helpdesk_ticket_delete', 'helpdesk_ticket_merge'],
  ['accounting_invoice_delete', 'accounting_vendor_delete'],
  ['accounting_invoice_void', 'accounting_invoice_delete'],
]);

test('the server default is approve, so each of these needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('the four held writes each require a prompt, right after the tool each is closest to', () => {
  const names = Object.keys(config.tools);
  for (const [name, after] of HELD) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
    assert.deepEqual(config.tools[after], { approval_mode: 'prompt' }, after);
    assert.equal(names[names.indexOf(after) + 1], name, `${name} right after ${after}`);
  }
});
