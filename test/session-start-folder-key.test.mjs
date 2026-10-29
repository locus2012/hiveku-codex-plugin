/**
 * HK-897 (2026-10-29): the SessionStart hook knows a folder's own Hiveku key.
 *
 * Codex 0.165.0 combines the hiveku plugin's .mcp.json server (bearer_token_env_var
 * HIVEKU_TOKEN) with a Codex config.toml's [mcp_servers.hiveku] like this, checked
 * against codex-rs (codex-mcp catalog.rs, core config/mod.rs to_mcp_config,
 * app-server config_manager.rs) and against Codex 0.165.0 itself with a local stub
 * server:
 *   - a configured server outranks a plugin's server of the same name and replaces
 *     it whole (no field merge): in a session started in a trusted folder whose
 *     .codex/config.toml carries its own Authorization header, the tools load with
 *     that key and HIVEKU_TOKEN is not needed;
 *   - with no folder entry, the plugin's server runs on HIVEKU_TOKEN;
 *   - the config layers themselves merge key by key, so a bearer_token_env_var in
 *     the Codex home's own [mcp_servers.hiveku] reaches a folder's entry and stops
 *     it when the variable is unset, and when it is set Codex sends the variable's
 *     key in place of the folder's own (the bearer goes over the configured
 *     Authorization header: every request a 0.165.0 session sent carried it);
 *   - a read with no session (app-server mcpServerStatus/list without a threadId)
 *     never reads a folder's config, so it reports the plugin's server.
 *
 * The hook told every folder-key session "HIVEKU_TOKEN is not set ... tools will
 * 401. Run the hiveku-connect skill" and held back Hiveku's working rules, while
 * the session's Hiveku tools worked. Pinned here, each run with its own HOME and
 * folders, the session's folder handed over as Codex hands it (stdin "cwd"):
 *   (a) a folder key with no HIVEKU_TOKEN: connected, the rules said;
 *   (b) a token with no folder key, and neither: unchanged;
 *   (c) the folder key wins over a token, as in Codex;
 *   (d) Codex's layers: the project root (a .git) down to the session's folder,
 *       and the session's folder alone without one;
 *   (e) the merge trap (unset: the server will not start, and setting the variable
 *       is never offered as the fix; set: the session hears that the variable's key
 *       replaces the folder's), a sync folder's own variable, an entry switched off,
 *       an entry with no key, and another server's key;
 *   (f) the key itself is never printed;
 *   (g) a key pasted where a variable's NAME belongs (bearer_token_env_var, or an
 *       Authorization entry in env_http_headers) is never printed either: a Hiveku
 *       key's prefix, a long run of hex digits or a name over 40 characters is
 *       reported by its setting alone (review of 1.0.1: the first cut echoed it twice);
 *   (h) single-quoted names are read like double-quoted ones, and a key in a form the
 *       hook does not read (a name that is not a plain one, an inline or dotted
 *       entry, an env_http_headers table) is reported as unread, never as "no key",
 *       with the working rules after it.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(root, 'plugins', 'hiveku-hooks', 'hooks', 'session-start.sh');
// A stand-in for an account key, assembled so no scanner reads it as a real one.
const SECRET = ['hvk', 'fixture', 'only'].join('_');
// A stand-in shaped like a real one (a prefix and 64 hex digits), assembled at run time.
const KEY_SHAPED = ['hvk', 'c0ffee'.repeat(10) + 'abcd'].join('_');
const NOT_SET = /^Hiveku: HIVEKU_TOKEN is not set, so the hiveku MCP server will not authenticate/;
const RULES = 'Hiveku: Hiveku Memory is the source of truth for this business';

/** The block Hiveku Desktop writes (hiveku-desktop src/main/hiveku/context/account-context-sync.ts writeCodexMcp). */
const DESKTOP_BLOCK = [
  '# >>> hiveku (managed by Hiveku Desktop)',
  '[mcp_servers.hiveku]',
  'url = "https://core.hiveku.com/mcp"',
  `http_headers = { "Authorization" = "Bearer ${SECRET}", "X-Hiveku-Client" = "hiveku-desktop" }`,
  'default_tools_approval_mode = "approve"',
  '# <<< hiveku',
  '',
].join('\n');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-session-start-'));
  const home = path.join(dir, 'home');
  fs.mkdirSync(home);
  return { dir, home };
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** Runs the hook as Codex does: the payload on stdin, the hook run in the session's folder unless `from` says otherwise. */
function runHook({ home, cwd, env = {}, from = cwd, payload = true }) {
  const input = payload
    ? JSON.stringify({ session_id: 's-1', transcript_path: null, cwd, hook_event_name: 'SessionStart', model: 'm', permission_mode: 'default', source: 'startup' })
    : '';
  const run = spawnSync('bash', [HOOK], {
    input,
    cwd: from,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: home, ...env },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '', 'nothing on stderr');
  assert.ok(!run.stdout.includes(SECRET), 'the key is never printed');
  assert.ok(!run.stdout.includes('c0ffee'), 'no part of a key-shaped value is ever printed');
  return run.stdout;
}

const firstLine = (out) => out.split('\n')[0];

test('(a) a folder key and no HIVEKU_TOKEN: connected through the folder key, with the rules', () => {
  const { dir, home } = sandbox();
  const dept = path.join(dir, 'Northwind', 'departments', 'sales');
  write(path.join(dept, '.codex', 'config.toml'), DESKTOP_BLOCK);
  const out = runHook({ home, cwd: dept });
  assert.match(firstLine(out), /^Hiveku connected \(this folder's own account key in its \.codex\/config\.toml, which Codex uses instead of HIVEKU_TOKEN once it trusts the folder\)\. Before any write/);
  assert.doesNotMatch(out, /HIVEKU_TOKEN is not set/);
  assert.ok(out.includes(RULES), 'the working rules follow');
  // Without the payload, the folder Codex runs the hook in is the session's.
  assert.match(firstLine(runHook({ home, cwd: dept, payload: false })), /^Hiveku connected \(this folder's own account key/);
  // The payload names the session's folder even when the hook runs elsewhere.
  assert.match(firstLine(runHook({ home, cwd: dept, from: dir })), /^Hiveku connected \(this folder's own account key/);
});

test('(b) a token with no folder key, and neither, read as before', () => {
  const { dir, home } = sandbox();
  const plain = path.join(dir, 'plain');
  fs.mkdirSync(plain);
  assert.match(firstLine(runHook({ home, cwd: plain, env: { HIVEKU_TOKEN: SECRET } })), /^Hiveku connected \(HIVEKU_TOKEN set\)\. Before any write/);
  const unset = runHook({ home, cwd: plain });
  assert.match(unset, NOT_SET);
  assert.doesNotMatch(unset, /source of truth/);
  assert.equal(unset.trim().split('\n').length, 1, 'one line only');
  // A payload whose cwd is not a folder falls back to the folder the hook runs in.
  assert.match(firstLine(runHook({ home, cwd: path.join(dir, 'missing'), from: plain })), NOT_SET);
});

test('(c) the folder key wins over HIVEKU_TOKEN, as the folder entry replaces the plugin server in Codex', () => {
  const { dir, home } = sandbox();
  const dept = path.join(dir, 'acct', 'departments', 'marketing');
  write(path.join(dept, '.codex', 'config.toml'), DESKTOP_BLOCK);
  const out = runHook({ home, cwd: dept, env: { HIVEKU_TOKEN: 'hvk_global_other_account' } });
  assert.match(firstLine(out), /^Hiveku connected \(this folder's own account key/);
  assert.ok(!out.includes('hvk_global_other_account'));
});

test("(d) Codex's layers: the project root down to the session's folder, or that folder alone", () => {
  const { dir, home } = sandbox();
  // No .git anywhere: Codex reads the session folder's own config only, never a parent's.
  const acct = path.join(dir, 'acct');
  write(path.join(acct, '.codex', 'config.toml'), DESKTOP_BLOCK);
  const site = path.join(acct, 'sites', 'main');
  fs.mkdirSync(site, { recursive: true });
  assert.match(runHook({ home, cwd: site }), NOT_SET);
  // A .git folder with HEAD at the account folder makes it the project root: its layer counts.
  write(path.join(acct, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  assert.match(firstLine(runHook({ home, cwd: site })), /^Hiveku connected \(this folder's own account key/);
  // A .git folder without HEAD is not a root (Codex skips it); a worktree's .git file is.
  const loose = path.join(dir, 'loose');
  write(path.join(loose, '.codex', 'config.toml'), DESKTOP_BLOCK);
  fs.mkdirSync(path.join(loose, '.git'));
  fs.mkdirSync(path.join(loose, 'sub'));
  assert.match(runHook({ home, cwd: path.join(loose, 'sub') }), NOT_SET);
  const worktree = path.join(dir, 'worktree');
  write(path.join(worktree, '.codex', 'config.toml'), DESKTOP_BLOCK);
  write(path.join(worktree, '.git'), 'gitdir: /elsewhere\n');
  fs.mkdirSync(path.join(worktree, 'sub'));
  assert.match(firstLine(runHook({ home, cwd: path.join(worktree, 'sub') })), /^Hiveku connected \(this folder's own account key/);
  // A key in the Codex home's own config counts too (CODEX_HOME first, else ~/.codex).
  const plain = path.join(dir, 'plain');
  fs.mkdirSync(plain);
  write(path.join(home, '.codex', 'config.toml'), DESKTOP_BLOCK);
  assert.match(firstLine(runHook({ home, cwd: plain })), /^Hiveku connected \(the account key in your Codex config\.toml, used instead of HIVEKU_TOKEN\)/);
  const codexHome = path.join(dir, 'managed-codex-home');
  fs.mkdirSync(codexHome);
  assert.match(runHook({ home, cwd: plain, env: { CODEX_HOME: codexHome } }), NOT_SET);
});

test('(e) the merge trap, a variable of its own, an entry switched off, no key, another server', () => {
  const { dir, home } = sandbox();
  const dept = path.join(dir, 'acct', 'departments', 'sales');
  write(path.join(dept, '.codex', 'config.toml'), DESKTOP_BLOCK);
  // The Codex home's own entry with bearer_token_env_var merges into the folder's: Codex refuses to start it.
  write(path.join(home, '.codex', 'config.toml'), '[mcp_servers.hiveku]\nurl = "https://core.hiveku.com/mcp"\nbearer_token_env_var = "HIVEKU_TOKEN"\n');
  const merged = runHook({ home, cwd: dept });
  assert.match(merged, /^Hiveku: HIVEKU_TOKEN is not set, and the \[mcp_servers\.hiveku\] entry in your Codex home's config\.toml names it \(bearer_token_env_var\)\. Codex merges that entry into this folder's own/);
  assert.doesNotMatch(merged, /source of truth/);
  // Setting the variable is never offered as the fix: Codex would send its key in place of the
  // folder's own (Codex 0.165.0 sent the variable's key on every request, the folder's never).
  assert.match(merged, /Take bearer_token_env_var, or the whole entry, out of your Codex home's config\.toml: the hiveku plugin already provides the server\. Setting HIVEKU_TOKEN instead would start the server with that key in place of this folder's own\.$/m);
  assert.doesNotMatch(merged, /, or set HIVEKU_TOKEN/);
  // Set, it starts with the variable's key, not the folder's: the session is told so.
  const sent = firstLine(runHook({ home, cwd: dept, env: { HIVEKU_TOKEN: SECRET } }));
  assert.match(sent, /^Hiveku connected \(HIVEKU_TOKEN set, which Codex sends in place of this folder's own key because the \[mcp_servers\.hiveku\] entry in your Codex home's config\.toml names it, so check that get_account_info names this folder's account\)\. Before any write/);
  // The Codex home's entry with a key of its own beside the variable is not a merge into a folder's key.
  write(path.join(home, '.codex', 'config.toml'),
    `[mcp_servers.hiveku]\nurl = "https://core.hiveku.com/mcp"\nbearer_token_env_var = "HIVEKU_TOKEN"\nhttp_headers = { "Authorization" = "Bearer ${SECRET}" }\n`);
  const plain = path.join(dir, 'plain-folder');
  fs.mkdirSync(plain);
  assert.match(firstLine(runHook({ home, cwd: plain, env: { HIVEKU_TOKEN: SECRET } })), /^Hiveku connected \(HIVEKU_TOKEN set, as the Codex config here asks\)/);
  assert.match(runHook({ home, cwd: plain }), /^Hiveku: HIVEKU_TOKEN is not set, and the Codex config here names it for the hiveku MCP server/);
  fs.rmSync(path.join(home, '.codex'), { recursive: true });

  // hiveku-sync's fallback block names OLYMPUS_API_KEY.
  const sync = path.join(dir, 'sync-folder');
  write(path.join(sync, '.codex', 'config.toml'),
    '[mcp_servers.hiveku]\nurl = "https://core.hiveku.com/mcp"\nbearer_token_env_var = "OLYMPUS_API_KEY"\nhttp_headers = { "X-Hiveku-Client" = "hiveku-sync/0.5.16" }\n');
  assert.match(runHook({ home, cwd: sync, env: { HIVEKU_TOKEN: SECRET } }), /^Hiveku: OLYMPUS_API_KEY is not set, and the Codex config here names it for the hiveku MCP server/);
  assert.match(firstLine(runHook({ home, cwd: sync, env: { OLYMPUS_API_KEY: SECRET } })), /^Hiveku connected \(OLYMPUS_API_KEY set, as the Codex config here asks\)/);

  // The header as its own table.
  const table = path.join(dir, 'table-form');
  write(path.join(table, '.codex', 'config.toml'),
    `[mcp_servers."hiveku"]\nurl = "https://core.hiveku.com/mcp"\n\n[mcp_servers.hiveku.http_headers]\n"Authorization" = "Bearer ${SECRET}"  # the account key\n`);
  assert.match(firstLine(runHook({ home, cwd: table })), /^Hiveku connected \(this folder's own account key/);

  // Switched off, or an entry with no key of its own.
  const off = path.join(dir, 'off');
  write(path.join(off, '.codex', 'config.toml'),
    `[mcp_servers.hiveku]\nurl = "https://core.hiveku.com/mcp"\nhttp_headers = { "Authorization" = "Bearer ${SECRET}" }\nenabled = false\n`);
  assert.match(runHook({ home, cwd: off, env: { HIVEKU_TOKEN: SECRET } }), /^Hiveku: the hiveku MCP server is switched off here \(enabled = false/);
  const nokey = path.join(dir, 'nokey');
  write(path.join(nokey, '.codex', 'config.toml'), '[mcp_servers.hiveku]\nurl = "https://core.hiveku.com/mcp"\n');
  assert.match(runHook({ home, cwd: nokey, env: { HIVEKU_TOKEN: SECRET } }), /^Hiveku: the Codex config here defines the hiveku MCP server without an account key/);

  // Another server's Authorization header, or the hiveku server's tool tables, are not a hiveku key.
  const other = path.join(dir, 'other');
  write(path.join(other, '.codex', 'config.toml'),
    `[mcp_servers.other]\nurl = "https://example.invalid/mcp"\nhttp_headers = { "Authorization" = "Bearer ${SECRET}" }\n\n[mcp_servers.hivekuX]\nhttp_headers = { "Authorization" = "x" }\n`);
  assert.match(runHook({ home, cwd: other }), NOT_SET);
  // A commented-out entry is not an entry.
  const commented = path.join(dir, 'commented');
  write(path.join(commented, '.codex', 'config.toml'), DESKTOP_BLOCK.split('\n').map((l) => (l ? `# ${l}` : l)).join('\n'));
  assert.match(runHook({ home, cwd: commented }), NOT_SET);
});

test('(f) the hook never prints, or keeps, a value it read from a config file', () => {
  const src = fs.readFileSync(HOOK, 'utf8');
  // Every quoted value is blanked before a line is kept; only variable NAMES survive.
  assert.match(src, /s\/=\[\[:space:\]\]\*"\(\[\^"\\\\\]\|\\\\\.\)\*"\/=_\/g/, 'quoted values are blanked');
  // runHook asserts the key is absent from stdout and stderr in every case above; one more with every form at once.
  const { dir, home } = sandbox();
  const all = path.join(dir, 'all');
  write(path.join(all, '.codex', 'config.toml'),
    `${DESKTOP_BLOCK}\n[mcp_servers.hiveku.http_headers]\nAuthorization = '${SECRET}'\n`);
  runHook({ home, cwd: all });
});

const KEY_IN_NAME = /^Hiveku: a Codex config\.toml here puts what looks like an account key where the name of an environment variable belongs \((bearer_token_env_var|env_http_headers) in the hiveku MCP server's entry\), so the server will not authenticate \(tools will 401 or not load\)\. Put the key in an environment variable and name that variable there, or send the key as an Authorization header in http_headers, or run the hiveku-connect skill\.$/;

test('(g) a key pasted where a variable name belongs is never printed, only the setting it sits in', () => {
  const { dir, home } = sandbox();
  const entry = (line) => `[mcp_servers.hiveku]\nurl = "https://core.hiveku.com/mcp"\n${line}\n`;
  const cases = [
    ['bearer', entry(`bearer_token_env_var = "${KEY_SHAPED}"`), 'bearer_token_env_var'],
    ['bearer-single', entry(`bearer_token_env_var = '${KEY_SHAPED}'`), 'bearer_token_env_var'],
    ['envheader', entry(`env_http_headers = { "Authorization" = "${KEY_SHAPED}" }`), 'env_http_headers'],
    ['olp', entry(`bearer_token_env_var = "${KEY_SHAPED.replace('hvk_', 'olp_')}"`), 'bearer_token_env_var'],
    ['gwk', entry(`bearer_token_env_var = "${KEY_SHAPED.replace('hvk_', 'gwk_')}"`), 'bearer_token_env_var'],
    // A Hiveku key's prefix alone (a cut-off paste), each one.
    ['hvk-short', entry('bearer_token_env_var = "hvk_partial"'), 'bearer_token_env_var'],
    ['olp-short', entry('bearer_token_env_var = "olp_partial"'), 'bearer_token_env_var'],
    ['gwk-short', entry('env_http_headers = { "Authorization" = "GWK_partial" }'), 'env_http_headers'],
    // No prefix: a run of 32 or more hex digits, or a name over 40 characters.
    ['hex', entry(`bearer_token_env_var = "KEY_${'c0ffee'.repeat(6)}"`), 'bearer_token_env_var'],
    ['long', entry(`bearer_token_env_var = "${'C0FFEE_'.repeat(6)}X"`), 'bearer_token_env_var'],
  ];
  for (const [name, config, slot] of cases) {
    const folder = path.join(dir, name);
    write(path.join(folder, '.codex', 'config.toml'), config);
    // runHook asserts no part of the value reaches stdout; set or not, the answer is the same.
    for (const env of [{}, { HIVEKU_TOKEN: SECRET }]) {
      const out = runHook({ home, cwd: folder, env });
      assert.match(out.trim(), KEY_IN_NAME, name);
      assert.equal(out.trim().match(KEY_IN_NAME)[1], slot, name);
      assert.equal(out.trim().split('\n').length, 1, `${name}: one line, no rules`);
    }
  }
  // Merged in from the Codex home's own entry, it is never printed there either.
  const dept = path.join(dir, 'dept');
  write(path.join(dept, '.codex', 'config.toml'), DESKTOP_BLOCK);
  write(path.join(home, '.codex', 'config.toml'), entry(`bearer_token_env_var = "${KEY_SHAPED}"`));
  assert.match(runHook({ home, cwd: dept }).trim(), KEY_IN_NAME);
  // A plain, short name is still named, as before.
  write(path.join(home, '.codex', 'config.toml'), '');
  const plain = path.join(dir, 'plain-name');
  write(path.join(plain, '.codex', 'config.toml'), entry('bearer_token_env_var = "HIVEKU_TOKEN_NORTHWIND_COFFEE"'));
  assert.match(runHook({ home, cwd: plain }), /^Hiveku: HIVEKU_TOKEN_NORTHWIND_COFFEE is not set, and the Codex config here names it/);
});

const UNREAD = /^Hiveku: a Codex config\.toml here gives the hiveku MCP server its key in a form this check does not read \(([^)]*)\), so it cannot say which key the session uses\. If the Hiveku tools do not load or answer 401, check that entry, or run the hiveku-connect skill\. Before any write: verify identity with get_account_info/;

test('(h) single quotes read like double quotes; a form the hook cannot read is unread, never "no key", and the rules follow', () => {
  const { dir, home } = sandbox();
  const at = (name, config) => {
    const folder = path.join(dir, name);
    write(path.join(folder, '.codex', 'config.toml'), config);
    return folder;
  };
  // Single quotes, the way TOML allows them.
  const single = at('single', "[mcp_servers.hiveku]\nurl = 'https://core.hiveku.com/mcp'\nbearer_token_env_var = 'MY_TOKEN'\n");
  assert.match(firstLine(runHook({ home, cwd: single, env: { MY_TOKEN: SECRET } })), /^Hiveku connected \(MY_TOKEN set, as the Codex config here asks\)/);
  assert.match(runHook({ home, cwd: single }), /^Hiveku: MY_TOKEN is not set, and the Codex config here names it/);
  const singleEnv = at('single-env', "[mcp_servers.hiveku]\nenv_http_headers = { 'Authorization' = 'MY_TOKEN' }\n");
  assert.match(firstLine(runHook({ home, cwd: singleEnv, env: { MY_TOKEN: SECRET } })), /^Hiveku connected \(MY_TOKEN set, as the Codex config here asks\)/);
  const singleHeader = at('single-header', `[mcp_servers.hiveku]\nurl = "https://core.hiveku.com/mcp"\n\n[mcp_servers.hiveku.http_headers]\n'Authorization' = 'Bearer ${SECRET}'\n`);
  assert.match(firstLine(runHook({ home, cwd: singleHeader })), /^Hiveku connected \(this folder's own account key/);

  // Forms it does not read: said so, with the rules, never "without an account key" or "not set".
  const unread = [
    ['hyphen', '[mcp_servers.hiveku]\nbearer_token_env_var = "MY-TOKEN"\n', 'a bearer_token_env_var that is not a plain variable name'],
    ['pasted-bearer', `[mcp_servers.hiveku]\nbearer_token_env_var = "Bearer ${SECRET}"\n`, 'a bearer_token_env_var that is not a plain variable name'],
    ['env-hyphen', '[mcp_servers.hiveku]\nenv_http_headers = { "Authorization" = "MY-TOKEN" }\n', 'an env_http_headers Authorization entry that is not a plain variable name'],
    ['inline', `[mcp_servers]\nhiveku = { url = "https://core.hiveku.com/mcp", http_headers = { Authorization = "Bearer ${SECRET}" } }\n`, 'a hiveku entry written inline under [mcp_servers]'],
    ['dotted', `mcp_servers.hiveku.url = "https://core.hiveku.com/mcp"\nmcp_servers.hiveku.http_headers = { Authorization = "Bearer ${SECRET}" }\n`, 'mcp_servers.hiveku keys outside a table'],
    ['env-table', '[mcp_servers.hiveku]\nurl = "https://core.hiveku.com/mcp"\n\n[mcp_servers.hiveku.env_http_headers]\nAuthorization = "MY_TOKEN"\n', 'an [mcp_servers.hiveku.env_http_headers] table'],
    // "_" is bash's own $_ (the last argument of the last command), never a variable to look up.
    ['underscore', '[mcp_servers.hiveku]\nbearer_token_env_var = "_"\n', 'a bearer_token_env_var that is not a plain variable name'],
  ];
  for (const [name, config, form] of unread) {
    const out = runHook({ home, cwd: at(name, config) });
    assert.match(out, UNREAD, name);
    assert.equal(out.match(UNREAD)[1], form, name);
    assert.doesNotMatch(out, /without an account key|is not set/, name);
    assert.ok(out.includes(RULES), `${name}: the working rules follow`);
  }
  // Another server written inline is not the hiveku server, and neither is a top-level key named hiveku.
  assert.match(runHook({ home, cwd: at('other-inline', '[mcp_servers]\nhivekuX = { url = "https://example.invalid/mcp" }\n') }), NOT_SET);
  assert.match(runHook({ home, cwd: at('top-key', 'hiveku = "a setting of some other tool"\n') }), NOT_SET);
});
