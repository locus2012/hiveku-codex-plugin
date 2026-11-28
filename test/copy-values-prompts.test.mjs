/**
 * Codex prompts before the server-side copies of stored keys, and before the Webflow live writes (2026-11-28).
 *
 * env_group_copy_from_site copies a site's stored values into an account environment group, and every site using the
 * group gets them in its running functions at once; project_secrets_copy_from_group copies a group's values into a
 * site's own variables; project_secrets_copy_between_environments copies between one site's environments. Each
 * writes through the same paths as env_group_set and project_secrets_set, which prompt, and with replace: true each
 * overwrites a value nobody can see to compare. Their MCP descriptions do not say ASK THE PERSON FIRST, and the server
 * default here is "approve", so without their own prompt entries they would run with no one asked. They sit right
 * after env_group_unpick, in this order, as on the Claude Code plugin's ask list (0.27.330).
 *
 * The nine Webflow live writes have been on the Claude Code plugin's ask list since 0.27.327 (CMS items published at
 * once, scripts registered for good, the Hiveku snippet removed, and the store's products and stock). This list had
 * not caught up, so in Codex they ran unasked. Each sits right after the sibling the plugin puts it after.
 *
 * The plugin's mirror test keeps the two lists equal when both checkouts sit side by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8');
const config = JSON.parse(raw).hiveku;
const names = Object.keys(config.tools);

/** Each new name, and the one it sits right after. */
const AFTER = [
  ['env_group_copy_from_site', 'env_group_unpick'],
  ['project_secrets_copy_from_group', 'env_group_copy_from_site'],
  ['project_secrets_copy_between_environments', 'project_secrets_copy_from_group'],
  ['webflow_cms_item_create_live', 'webflow_cms_item_delete_bulk'],
  ['webflow_cms_item_update_live', 'webflow_cms_item_create_live'],
  ['webflow_cms_item_update_live_bulk', 'webflow_cms_item_update_live'],
  ['webflow_script_register_inline', 'webflow_asset_delete'],
  ['webflow_script_register_hosted', 'webflow_script_register_inline'],
  ['webflow_hiveku_snippet_remove', 'webflow_hiveku_snippet_install'],
  ['webflow_product_create', 'webflow_order_refund'],
  ['webflow_product_update', 'webflow_product_create'],
  ['webflow_inventory_update', 'webflow_product_update'],
];

test('the server default is approve, so each copy and Webflow live write needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('each prompts, is listed once, and sits right after its sibling', () => {
  for (const [name, before] of AFTER) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, `${name} must prompt`);
    // JSON.parse keeps only the last of two equal keys, so count them in the text.
    assert.equal(raw.split(`"${name}"`).length - 1, 1, `${name} listed once`);
    assert.equal(names[names.indexOf(before) + 1], name, `${name} right after ${before}`);
  }
});

test('the header names this release', () => {
  const plugin = JSON.parse(readFileSync(new URL('../plugins/hiveku/.codex-plugin/plugin.json', import.meta.url), 'utf8'));
  assert.equal(config.http_headers['X-Hiveku-Client'], `codex-plugin/${plugin.version}`);
});

test('the README names the copies with the other group writes, and the Webflow live writes', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /`env_group_copy_from_site` \(a site's value into a group, which every site using the\s+group gets at once\)/);
  assert.match(readme, /`project_secrets_copy_from_group` \(a group's value into a site\)/);
  assert.match(readme, /`project_secrets_copy_between_environments` \(between a site's environments\)/);
  for (const [name] of AFTER.filter(([n]) => n.startsWith('webflow_'))) {
    assert.ok(readme.includes(`\`${name}\``), `the README names ${name}`);
  }
});

/** A phrase as a pattern whose spaces match any run of spaces and line breaks (the skill wraps its lines). */
const phrase = (words) => new RegExp(words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));

test('the orient skill teaches the copies and that a Production value stays in Production', () => {
  const orient = readFileSync(new URL('../plugins/hiveku/skills/hiveku-orient/SKILL.md', import.meta.url), 'utf8');
  assert.match(orient, /never ask for it in chat/);
  assert.match(orient, phrase('global variables (an environment group), with a note on each name saying what it is for'));
  assert.match(orient, phrase('Choose a key by its name and note'));
  assert.match(orient, phrase('to share a site\'s key with other sites, copy it into a group with `env_group_copy_from_site`, then link the group (`env_group_link`) or pick the name (`env_group_pick`)'));
  // A copy from a group is the site's own value from then on: without this line, an agent shares a global key by
  // copying it, and the site keeps the old value after the group's key is rotated.
  assert.match(orient, phrase('copying from a group into a site (`project_secrets_copy_from_group`) makes it that site\'s own value, which later group changes never reach, so to follow the group, link or pick instead'));
  assert.match(orient, /A Production value stays in Production/);
});

test('the orient skill says only what is true of values: the reads return none, and a person can approve a reveal', () => {
  const orient = readFileSync(new URL('../plugins/hiveku/skills/hiveku-orient/SKILL.md', import.meta.url), 'utf8');
  assert.doesNotMatch(orient, /to you\s+or anyone/);
  assert.match(orient, phrase('these reads never return a value. A site\'s value that is not hidden reaches you only through `project_secrets_reveal`, after a person approves it; a hidden value, and a group\'s, never does'));
});
