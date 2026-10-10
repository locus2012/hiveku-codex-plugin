/**
 * The plugin's .mcp.json declares `X-Hiveku-Client: codex-plugin/<version>`
 * (plan "Server-side approval"; builder src/lib/secrets/reveal-client.ts, MCP
 * src/utils/declared-client.ts).
 *
 * The declaration tells Hiveku "this client asks a person before a reveal",
 * and a release at or above the builder's listed minimum then skips the
 * dashboard approval. It is set by this file, never by the model, and it is
 * true only while project_secrets_reveal (and hiveku_batch, which can carry
 * it) prompt here.
 *
 * Pinned:
 *  1. The header is exactly `codex-plugin/<plugin.json version>`, so a release
 *     that forgets to bump one of the two fails here instead of declaring an
 *     old version (or a new one that does not ship the prompts).
 *  2. It is in the form the builder parses (its DECLARED_RE, copied here).
 *  3. The static headers carry nothing else: the key stays in HIVEKU_TOKEN.
 *  4. The prompts the declaration rests on are still there.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcp = JSON.parse(fs.readFileSync(path.join(root, 'plugins', 'hiveku', '.mcp.json'), 'utf8')).hiveku;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugins', 'hiveku', '.codex-plugin', 'plugin.json'), 'utf8'));

// The builder's DECLARED_RE (hiveku_builder src/lib/secrets/reveal-client.ts), character for character.
const BUILDER_DECLARED_RE = /^([a-z][a-z0-9-]{0,39})\/(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,5})$/;

test('X-Hiveku-Client is codex-plugin/<the plugin.json version>', () => {
  assert.equal(mcp.http_headers?.['X-Hiveku-Client'], `codex-plugin/${manifest.version}`);
});

test('the declaration is in the form the builder reads', () => {
  assert.match(mcp.http_headers['X-Hiveku-Client'], BUILDER_DECLARED_RE);
});

test('the static headers carry only the declaration: the key stays in HIVEKU_TOKEN', () => {
  assert.deepEqual(Object.keys(mcp.http_headers), ['X-Hiveku-Client']);
  assert.equal(mcp.bearer_token_env_var, 'HIVEKU_TOKEN');
});

test('the prompts the declaration rests on are still there', () => {
  assert.deepEqual(mcp.tools.project_secrets_reveal, { approval_mode: 'prompt' });
  assert.deepEqual(mcp.tools.hiveku_batch, { approval_mode: 'prompt' });
});
