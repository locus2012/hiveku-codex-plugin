/**
 * Codex prompts before the site database's writes and the writes and deletes of its app's sign-in, file storage, row
 * security and server functions.
 *
 * The server default is "approve", so a tool with no entry here runs with no one asked. Until 2026-11-10 none of
 * these had one: SQL that changes any number of rows, a migration, a deleted user, bucket, file or function, a wider
 * row security rule, a server function run for real, and a sign-in link for a user of the site's app all ran
 * unprompted. Each is named here so a dropped or renamed entry fails, and the batch wrapper prompts too, because Codex
 * decides by the called name only. Their reads stay unprompted.
 *
 * The 2026-11-10 review added three: database_provision and database_repair write the connections the live site runs
 * on (repair gives the database a new password at once), and supabase_storage_object_signed_url answers with a link
 * that opens a private file for anyone for up to 7 days, which the builder treats as minting a credential. The
 * database reads are named below with the storage and sign-in reads, and none of them prompts.
 *
 * The Claude Code plugin gates the same 31; its mirror test keeps the two lists equal when both checkouts sit side by
 * side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;

const WRITES = [
  'database_execute',
  'database_provision',
  'database_repair',
  'supabase_migration_apply',
  'supabase_table_row_insert',
  'supabase_table_row_update',
  'supabase_table_row_delete',
  'supabase_policy_create',
  'supabase_policy_update',
  'supabase_policy_delete',
  'supabase_auth_user_create',
  'supabase_auth_user_update',
  'supabase_auth_user_delete',
  'supabase_auth_user_generate_link',
  'supabase_auth_config_update',
  'supabase_sync_redirect_urls',
  'supabase_configure_oauth',
  'supabase_configure_smtp',
  'supabase_configure_hiveku_smtp',
  'supabase_storage_create',
  'supabase_storage_delete',
  'supabase_storage_empty',
  'supabase_storage_object_upload',
  'supabase_storage_object_move',
  'supabase_storage_object_copy',
  'supabase_storage_object_delete',
  'supabase_storage_object_signed_url',
  'supabase_edge_functions_deploy',
  'supabase_edge_functions_delete',
  'supabase_edge_functions_invoke',
  'supabase_edge_functions_set_secrets',
];

const READS = [
  'database_describe',
  'database_query',
  'database_status',
  'database_tables',
  'supabase_auth_config_get',
  'supabase_auth_user_get',
  'supabase_auth_users_list',
  'supabase_edge_functions_get_source',
  'supabase_edge_functions_list',
  'supabase_gen_types',
  'supabase_migrations_list',
  'supabase_policies_list',
  'supabase_storage_list',
  'supabase_storage_object_download',
  'supabase_storage_objects_list',
  'supabase_table_rows_list',
];

test('the server default is approve, so each of these needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('each database and storage write, delete and run, and the batch wrapper, require a prompt', () => {
  for (const name of [...WRITES, 'hiveku_batch']) {
    assert.deepEqual(config.tools[name], { approval_mode: 'prompt' }, name);
  }
});

test('they sit together after the checkpoint delete, which already prompts', () => {
  const names = Object.keys(config.tools);
  const at = names.indexOf('checkpoint_delete');
  assert.ok(at >= 0, 'checkpoint_delete prompts');
  assert.deepEqual(names.slice(at + 1, at + 1 + WRITES.length), WRITES);
});

test('their reads stay unprompted', () => {
  for (const name of READS) {
    assert.equal(config.tools[name], undefined, `${name} is a read and must not prompt`);
  }
});
