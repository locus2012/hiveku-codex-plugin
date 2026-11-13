/**
 * Codex prompts before a before/after grid row or a design layer is removed, and never for the steps that build
 * them (2026-11-13, MCP 837cfd4b).
 *
 * The tool server builds a before/after grid one row at a time and a design one layer at a time, so a person who has
 * the grid or the design open watches it fill in. The two removes ask, as customer_journey_stage_delete does: a version
 * of the grid or the design is kept before the first of a run of removes, and the version history brings it back. The
 * steps that add, change or move a row or a layer are everyday changes and follow the server default, as
 * before_after_grid_update and design_update do; before_after_grid_state_get is a read. The two sit right after the
 * journey stage delete, as the Claude Code plugin's ask list has them; that plugin's mirror test keeps the two lists
 * equal when both checkouts sit side by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const REMOVES = ['before_after_grid_row_delete', 'design_layer_delete'];

test('removing a grid row or a design layer requires a prompt, right after the journey stage delete', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
  for (const name of REMOVES) assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  const names = Object.keys(config.tools);
  for (const name of REMOVES) assert.equal(names.filter((each) => each === name).length, 1, `${name} is listed once`);
  const at = names.indexOf('customer_journey_stage_delete');
  assert.deepEqual(names.slice(at + 1, at + 3), REMOVES, 'beside the journey stage delete');
});

test('the steps that build a grid or a design, and the grid state read, are not added', () => {
  for (const name of [
    'before_after_grid_row_add',
    'before_after_grid_row_update',
    'before_after_grid_row_move',
    'before_after_grid_state_get',
    'design_layer_add',
    'design_layer_update',
    'design_layer_move',
  ]) {
    assert.equal(config.tools[name], undefined, `${name} follows the default and must not prompt`);
  }
});
