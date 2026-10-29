/**
 * The hooks are their own plugin, hiveku-hooks@hiveku (2026-10-29).
 *
 * Codex trusts a plugin's hooks against a sha256 of the WHOLE plugin folder:
 * every file's relative name, size and bytes, skipping only __pycache__,
 * .venv, *.pyc and *.egg-info (codex-rs hooks/src/engine/plugin_fingerprint.rs
 * and plugin_trust.rs, Codex 0.165.0). When any file differs from the folder
 * the person trusted, every hook of that plugin fails with "plugin contents
 * changed; hook approval required" until they trust the hooks again with
 * /hooks. The hiveku plugin was released 16 times in a week, nearly all to add
 * one tool to the ask list in its .mcp.json, and each release stopped every
 * Hiveku hook for every person. So the hooks moved to plugins/hiveku-hooks,
 * whose folder changes only when a hook changes.
 *
 * Pinned:
 *  (a) plugins/hiveku-hooks holds only .codex-plugin/plugin.json, LICENSE,
 *      hooks/hooks.json and the scripts it runs or they source: nothing
 *      generated, nothing unused, no link (Codex cannot hash one), and in a
 *      git checkout git tracks every one of them (a copy without git reports
 *      a skip); its manifest declares the hooks and nothing else, and its
 *      copy says the SessionStart hook checks that HIVEKU_TOKEN is set (or a
 *      folder's own key), never that it checks the connection;
 *  (b) plugins/hiveku has no hooks folder and no "hooks" field (Codex reads
 *      hooks/hooks.json by default when the field is absent), under a version
 *      above every hiveku that shipped the hooks (Codex replaces a plugin it
 *      installed from a local marketplace only when the version changes);
 *  (c) the marketplace lists both plugins, each at its own folder, with
 *      policy values Codex accepts (codex-rs core-plugins/src/marketplace.rs);
 *  (d) installed the way Codex installs them, each at
 *      <CODEX_HOME>/plugins/cache/<marketplace>/<plugin>/<version>
 *      (core-plugins/src/store.rs), the batch refusal reads the hiveku
 *      plugin's real .mcp.json from beside the hooks plugin, and every
 *      registered command, with the plugin path written into it as Codex
 *      writes it, runs under zsh, bash and sh from a plugin root with a space
 *      in its path. The fixture cases (two versions, none, a checkout) are in
 *      test/codex-hooks.test.sh;
 *  (e) the hooks plugin's folder hash, in Codex's own algorithm, is pinned to
 *      its version: a change to the folder makes every person trust the hooks
 *      again, so it comes with a new version and a new pin, on purpose.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_PLUGIN = path.join(root, 'plugins', 'hiveku-hooks');
const MAIN_PLUGIN = path.join(root, 'plugins', 'hiveku');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const LONG = 600_000; // the machine can be heavily loaded

/**
 * The bash hooks' floor (pre-tool-use.sh ALWAYS_PROMPT): refused inside a batch
 * even when no .mcp.json is found.
 */
const ALWAYS_PROMPT = ['project_vcs_rollback', 'project_vcs_commit', 'deploy_site'];

/** Every entry Codex hashes in a plugin folder, relative, "/"-joined; folders end in "/". */
function bundleEntries(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((entry) => {
    const name = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return [`${name}/`, ...bundleEntries(dir, name)];
    if (entry.isFile()) return [name];
    return [`${name} (not a file or a folder)`];
  });
}

/** The entries plugins/hiveku-hooks may hold: the manifest, LICENSE, hooks.json and what it runs. */
function expectedHooksEntries(dir) {
  const hooksJson = fs.readFileSync(path.join(dir, 'hooks', 'hooks.json'), 'utf8');
  const run = [...hooksJson.matchAll(/\$\{PLUGIN_ROOT\}\/hooks\/([a-z][a-z0-9-]*\.sh)/g)].map((m) => m[1]);
  const sourced = run.flatMap((script) => {
    const file = path.join(dir, 'hooks', script);
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return [...text.matchAll(/^\. "\$HOOK_DIR\/([a-z][a-z0-9-]*\.sh)"/gm)].map((m) => m[1]);
  });
  const scripts = [...new Set([...run, ...sourced])].map((s) => `hooks/${s}`);
  return ['.codex-plugin/', '.codex-plugin/plugin.json', 'LICENSE', 'hooks/', 'hooks/hooks.json', ...scripts].sort();
}

function assertHooksBundle(dir) {
  assert.deepEqual(
    bundleEntries(dir).sort(),
    expectedHooksEntries(dir),
    'plugins/hiveku-hooks may hold only .codex-plugin/plugin.json, LICENSE, hooks/hooks.json and the scripts it runs or they source: ' +
      'any other file changes the folder Codex trusts the hooks by, and every person would have to trust them again',
  );
}

const NO_DASH_OR_EMOJI = (text, where) => {
  assert.doesNotMatch(text, /[\u2014\u2013]/, `${where} carries an em or en dash`);
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, `${where} carries an emoji`);
};

test('(a) plugins/hiveku-hooks holds only its manifest, LICENSE and the hooks, nothing generated', () => {
  assertHooksBundle(HOOKS_PLUGIN);
});

test('(a) git tracks every file in plugins/hiveku-hooks, and only those', (t) => {
  // What git ships is what is here: an untracked file would ship from a local
  // marketplace and not from GitHub, and the two would be trusted apart.
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (top.status !== 0 || fs.realpathSync(top.stdout.trim()) !== fs.realpathSync(root)) {
    t.skip('not a git checkout of this repo (a copy without .git), so there is nothing to compare');
    return;
  }
  const git = spawnSync('git', ['ls-files', '-z', '--', 'plugins/hiveku-hooks'], { cwd: root, encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  const tracked = git.stdout.split('\0').filter(Boolean).map((f) => f.slice('plugins/hiveku-hooks/'.length)).sort();
  const files = bundleEntries(HOOKS_PLUGIN).filter((e) => !e.endsWith('/')).sort();
  assert.notEqual(tracked.length, 0, `git tracks none of the ${files.length} files in plugins/hiveku-hooks: git add them`);
  assert.deepEqual(tracked, files, 'every file in plugins/hiveku-hooks is tracked, and only those');
});

test('(a) the hooks plugin manifest declares the hooks and nothing else', () => {
  const manifest = readJson(path.join(HOOKS_PLUGIN, '.codex-plugin', 'plugin.json'));
  assert.equal(manifest.name, 'hiveku-hooks');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.hooks, './hooks/hooks.json');
  for (const key of ['skills', 'mcpServers', 'apps', 'commands']) {
    assert.equal(manifest[key], undefined, `hiveku-hooks declares no ${key}`);
  }
  assert.equal(manifest.license, 'MIT');
  const { interface: ui } = manifest;
  assert.equal(ui.displayName, 'Hiveku Hooks');
  assert.equal(ui.developerName, 'Hiveku');
  for (const field of ['shortDescription', 'longDescription']) assert.ok(ui[field], `interface.${field}`);
  for (const [where, text] of [
    ['description', manifest.description],
    ['interface.shortDescription', ui.shortDescription],
    ['interface.longDescription', ui.longDescription],
  ]) {
    NO_DASH_OR_EMOJI(text, where);
  }
});

test('(a) the copy names the check the SessionStart hook makes, and claims no connection check', () => {
  // session-start.sh only checks that the hiveku server has a key (HIVEKU_TOKEN
  // is set, or a Codex config.toml carries one); it never contacts Hiveku. If it
  // ever checks the connection, change this test with it.
  const manifest = readJson(path.join(HOOKS_PLUGIN, '.codex-plugin', 'plugin.json'));
  const { interface: ui } = manifest;
  const hooksJson = readJson(path.join(HOOKS_PLUGIN, 'hooks', 'hooks.json'));
  const statusMessages = Object.values(hooksJson.hooks).flatMap((groups) =>
    groups.flatMap((g) => g.hooks.filter((h) => h.statusMessage).map((h) => h.statusMessage)),
  );
  assert.match(manifest.description, /HIVEKU_TOKEN is set/, 'description names the SessionStart check');
  assert.match(ui.longDescription, /HIVEKU_TOKEN is set/, 'interface.longDescription names the SessionStart check');
  for (const [where, text] of [
    ['description', manifest.description],
    ['interface.shortDescription', ui.shortDescription],
    ['interface.longDescription', ui.longDescription],
    ...statusMessages.map((message) => ['a hooks.json statusMessage', message]),
  ]) {
    assert.doesNotMatch(text, /connect/i, `${where} claims a connection check, and session-start.sh only checks that HIVEKU_TOKEN is set: ${text}`);
  }
});

test('(a) the bundle check fails on a generated, stray or linked file (negative control)', () => {
  for (const [extra, make] of [
    ['.DS_Store', (dir) => fs.writeFileSync(path.join(dir, '.DS_Store'), 'x')],
    ['README.md', (dir) => fs.writeFileSync(path.join(dir, 'README.md'), 'x')],
    ['.mcp.json', (dir) => fs.writeFileSync(path.join(dir, '.mcp.json'), '{}')],
    ['an unused script', (dir) => fs.writeFileSync(path.join(dir, 'hooks', 'old-stop.sh'), 'x')],
    ['a backup copy', (dir) => fs.writeFileSync(path.join(dir, 'hooks', 'stop.sh.orig'), 'x')],
    ['a skills folder', (dir) => fs.mkdirSync(path.join(dir, 'skills'))],
    ['a link', (dir) => fs.symlinkSync(path.join(MAIN_PLUGIN, '.mcp.json'), path.join(dir, 'hooks', 'mcp.json'))],
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-hooks-bundle-'));
    fs.cpSync(HOOKS_PLUGIN, dir, { recursive: true });
    assertHooksBundle(dir); // the copy itself passes
    make(dir);
    assert.throws(() => assertHooksBundle(dir), undefined, `${extra} is caught`);
  }
});

test('(b) plugins/hiveku has no hooks: no hooks folder and no "hooks" field', () => {
  assert.ok(!fs.existsSync(path.join(MAIN_PLUGIN, 'hooks')), 'plugins/hiveku/hooks must not exist: Codex reads hooks/hooks.json by default');
  const manifest = readJson(path.join(MAIN_PLUGIN, '.codex-plugin', 'plugin.json'));
  assert.ok(!Object.hasOwn(manifest, 'hooks'), 'plugins/hiveku plugin.json has no "hooks" field');
  // Still the MCP server and the skills.
  assert.equal(manifest.name, 'hiveku');
  assert.equal(manifest.mcpServers, './.mcp.json');
  assert.equal(manifest.skills, './skills/');
});

/**
 * Every hiveku release up to and including this version shipped the hooks
 * inside it. Codex replaces a plugin it installed from a local marketplace
 * only when the version changes (codex-rs core-plugins/src/loader.rs,
 * IfVersionChanged), so a hiveku without hooks under a version that had them
 * leaves the old hooks folder in place, and a person who adds hiveku-hooks
 * gets every hook twice.
 */
const LAST_HIVEKU_WITH_HOOKS = '0.3.42';

/** True when version a is above version b, both "major.minor.patch". */
function isAbove(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

test('(b) plugins/hiveku has a version above every hiveku that shipped the hooks', (t) => {
  const { version } = readJson(path.join(MAIN_PLUGIN, '.codex-plugin', 'plugin.json'));
  const release =
    'Release the hiveku plugin together with this change: a new version in plugins/hiveku/.codex-plugin/plugin.json ' +
    'and the same version in the X-Hiveku-Client header in plugins/hiveku/.mcp.json.';
  assert.ok(
    isAbove(version, LAST_HIVEKU_WITH_HOOKS),
    `plugins/hiveku is ${version}, and hiveku ${LAST_HIVEKU_WITH_HOOKS} shipped the hooks inside it. Codex replaces a plugin ` +
      `installed from a local marketplace only when the version changes, so a person with ${LAST_HIVEKU_WITH_HOOKS} would keep ` +
      'its hooks beside hiveku-hooks, and once both are trusted each hook runs twice. ' +
      'Do not change LAST_HIVEKU_WITH_HOOKS to make this pass. ' + release,
  );
  // A release can land on main before this change does. While main's hiveku
  // still has its hooks, this one must be above main's version too.
  const show = (spec) => spawnSync('git', ['show', spec], { cwd: root, encoding: 'utf8' });
  const mainHooks = show('origin/main:plugins/hiveku/hooks/hooks.json');
  const mainManifest = show('origin/main:plugins/hiveku/.codex-plugin/plugin.json');
  if (mainHooks.status !== 0 || mainManifest.status !== 0) {
    t.diagnostic(`no origin/main here, or its hiveku has no hooks: ${version} was checked against ${LAST_HIVEKU_WITH_HOOKS} only`);
    return;
  }
  const mainVersion = JSON.parse(mainManifest.stdout).version;
  assert.ok(
    isAbove(version, mainVersion),
    `origin/main's hiveku ${mainVersion} still ships the hooks, and plugins/hiveku is ${version}. ${release}` +
      (isAbove(mainVersion, LAST_HIVEKU_WITH_HOOKS) ? ` Then set LAST_HIVEKU_WITH_HOOKS to ${mainVersion}.` : ''),
  );
});

test('(c) the marketplace lists both plugins, each at its own folder, with values Codex accepts', () => {
  const marketplace = readJson(path.join(root, '.agents', 'plugins', 'marketplace.json'));
  assert.equal(marketplace.name, 'hiveku');
  assert.deepEqual(marketplace.plugins.map((p) => p.name), ['hiveku', 'hiveku-hooks']);
  for (const plugin of marketplace.plugins) {
    assert.deepEqual(plugin.source, { source: 'local', path: `./plugins/${plugin.name}` });
    // codex-rs core-plugins/src/marketplace.rs: installation NOT_AVAILABLE |
    // AVAILABLE | INSTALLED_BY_DEFAULT (a label, "Installed by admin", that
    // installs nothing), authentication ON_INSTALL | ON_USE (when a plugin's
    // apps are connected; neither plugin has apps). No "products" list: an
    // empty one makes a plugin uninstallable.
    assert.deepEqual(Object.keys(plugin.policy).sort(), ['authentication', 'installation']);
    assert.equal(plugin.policy.installation, 'AVAILABLE');
    assert.ok(['ON_INSTALL', 'ON_USE'].includes(plugin.policy.authentication), `${plugin.name} authentication`);
    assert.equal(plugin.category, 'Productivity');
    // Codex refuses an install whose plugin.json name differs from the entry (store.rs).
    const manifest = readJson(path.join(root, plugin.source.path, '.codex-plugin', 'plugin.json'));
    assert.equal(manifest.name, plugin.name);
  }
});

/** Copies a plugin folder where Codex installs it: <home>/plugins/cache/hiveku/<name>/<version>. */
function installLikeCodex(home, pluginDir) {
  const manifest = readJson(path.join(pluginDir, '.codex-plugin', 'plugin.json'));
  const dest = path.join(home, 'plugins', 'cache', 'hiveku', manifest.name, manifest.version);
  fs.cpSync(pluginDir, dest, { recursive: true });
  return dest;
}

/** The tools the hiveku plugin's .mcp.json sets to "prompt". */
function promptTools() {
  const tools = readJson(path.join(MAIN_PLUGIN, '.mcp.json')).hiveku.tools;
  return Object.entries(tools).filter(([, v]) => v.approval_mode === 'prompt').map(([k]) => k);
}

function runPre(hooksRoot, input) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-hooks-split-pre-'));
  const run = spawnSync('bash', [path.join(hooksRoot, 'hooks', 'pre-tool-use.sh')], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: LONG,
    env: { PATH: process.env.PATH, HOME: tmp, TMPDIR: `${tmp}/` },
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

const batchPayload = (tools) => ({
  session_id: '019a0000-0000-7000-8000-00000000c0de',
  turn_id: 't1',
  transcript_path: null,
  cwd: os.tmpdir(),
  hook_event_name: 'PreToolUse',
  model: 'gpt-5-codex',
  permission_mode: 'default',
  tool_name: 'mcp__hiveku__hiveku_batch',
  tool_input: { calls: tools.map((tool) => ({ tool, args: { project_id: '8f14e45f-ceea-467a-9575-2f3b5e6a1c01' } })) },
  tool_use_id: 'call_batch_split',
});

const refused = (out) => {
  if (!out) return [];
  const reason = JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
  return reason.match(/^Not run: this hiveku_batch carries (.*), which Codex asks/)[1].split(', ');
};

test('(d) installed as Codex installs them, the hooks read the hiveku plugin installed beside them', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-hooks-split-'));
  const codexHome = path.join(home, 'Application Support', 'codex');
  const hooksRoot = installLikeCodex(codexHome, HOOKS_PLUGIN);
  const unasked = ['project_vcs_status', 'project_file_save', 'memory_list'];
  const prompted = promptTools().filter((t) => t !== 'hiveku_batch');
  // Not installed yet: only the floor.
  assert.deepEqual(refused(runPre(hooksRoot, batchPayload([...prompted, ...unasked]))), prompted.filter((t) => ALWAYS_PROMPT.includes(t)));
  installLikeCodex(codexHome, MAIN_PLUGIN);
  assert.deepEqual(refused(runPre(hooksRoot, batchPayload([...prompted, ...unasked]))), prompted);
  assert.equal(runPre(hooksRoot, batchPayload(unasked)), '');
});

/**
 * A hook's environment as Codex 0.165.0 builds it (hooks/src/engine/discovery.rs):
 * PLUGIN_ROOT and CLAUDE_PLUGIN_ROOT are the plugin's root, PLUGIN_DATA and
 * CLAUDE_PLUGIN_DATA its data folder, <CODEX_HOME>/plugins/data/<plugin>-<marketplace>
 * (core-plugins/src/store.rs).
 */
function codexHookEnv(codexHome, pluginRoot, pluginName) {
  const data = path.join(codexHome, 'plugins', 'data', `${pluginName}-hiveku`);
  return { PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_ROOT: pluginRoot, PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
}

/** discovery.rs also writes each of those values into the command text in place of ${NAME}. */
const codexCommandText = (command, env) =>
  Object.entries(env).reduce((text, [key, value]) => text.split(`\${${key}}`).join(value), command);

/**
 * The shells a hook command meets. Codex runs the command text with
 * $SHELL -lc, or /bin/sh -lc when SHELL is unset (hooks/src/engine/command_runner.rs),
 * and $SHELL is zsh on macOS: zsh is required there and run elsewhere when installed.
 */
function hookShells(t) {
  if (spawnSync('zsh', ['-c', 'exit 0']).status === 0) return ['zsh', 'bash', 'sh'];
  assert.notEqual(process.platform, 'darwin', 'zsh is missing, and it is the shell Codex runs hooks with on macOS');
  t.diagnostic('zsh is not installed here: ran bash and sh only');
  return ['bash', 'sh'];
}

function runAsCodex(shell, command, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-hooks-split-run-'));
  return spawnSync(shell, ['-lc', codexCommandText(command, env)], {
    input: '',
    encoding: 'utf8',
    timeout: LONG,
    cwd: tmp,
    env: { PATH: process.env.PATH, HOME: tmp, TMPDIR: `${tmp}/`, ...env },
  });
}

test('(d) every registered command runs under zsh, bash and sh from a plugin root with a space in its path', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-hooks-split-cmd-'));
  const codexHome = path.join(home, 'Application Support', 'codex');
  const hooksRoot = installLikeCodex(codexHome, HOOKS_PLUGIN);
  const env = codexHookEnv(codexHome, hooksRoot, 'hiveku-hooks');
  const hooksJson = readJson(path.join(hooksRoot, 'hooks', 'hooks.json'));
  const commands = Object.values(hooksJson.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
  assert.equal(commands.length, 4);
  // The shell parses the path as part of the command text, so an unquoted
  // ${PLUGIN_ROOT} splits at the space under every shell, zsh too.
  for (const shell of hookShells(t)) {
    for (const command of commands) {
      const run = runAsCodex(shell, command, env);
      assert.equal(run.status, 0, `${shell} -lc ${codexCommandText(command, env)}: ${run.stderr}`);
      if (command.includes('session-start.sh')) assert.match(run.stdout, /^Hiveku: HIVEKU_TOKEN is not set/);
      else assert.equal(run.stdout, '', command);
    }
    // Negative control: the old unquoted SessionStart command fails here.
    const unquoted = runAsCodex(shell, 'bash ${PLUGIN_ROOT}/hooks/session-start.sh', env);
    assert.notEqual(unquoted.status, 0, `${shell}: the unquoted command should fail from a path with a space`);
  }
});

/**
 * Codex's plugin_content_hash (codex-rs hooks/src/engine/plugin_fingerprint.rs,
 * Codex 0.165.0), line for line: a depth-first walk in byte order of names,
 * each entry as (u64 length, relative path, "directory" | "file" + u64 size +
 * bytes), little-endian, after the "codex-plugin-bundle-v1" prefix.
 */
function pluginContentHash(pluginRoot) {
  const hash = crypto.createHash('sha256');
  hash.update('codex-plugin-bundle-v1');
  const u64 = (n) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(n));
    return b;
  };
  const pending = [pluginRoot];
  while (pending.length) {
    const p = pending.pop();
    const rel = path.relative(pluginRoot, p);
    const base = rel ? path.basename(rel) : null;
    if (base && (base === '__pycache__' || base === '.venv' || base.endsWith('.pyc') || base.endsWith('.egg-info'))) continue;
    const name = Buffer.from(rel);
    hash.update(u64(name.length));
    hash.update(name);
    const st = fs.lstatSync(p);
    if (st.isDirectory()) {
      hash.update('directory');
      const entries = fs.readdirSync(p).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
      for (const entry of entries.reverse()) pending.push(path.join(p, entry));
    } else if (st.isFile()) {
      hash.update('file');
      hash.update(u64(st.size));
      hash.update(fs.readFileSync(p));
    } else {
      throw new Error(`unsupported plugin entry type: ${p}`);
    }
  }
  return `sha256:${hash.digest('hex')}`;
}

/**
 * The hooks plugin's folder hash per version. Codex 0.165.0 reported the same
 * value for the installed folder (hooks/list, currentHash after the "/") on
 * 2026-10-29. A change to plugins/hiveku-hooks makes every person trust the
 * hooks again: give it a new version in .codex-plugin/plugin.json and add the
 * new hash here, or keep the change out of the hooks plugin.
 */
const PINNED_BUNDLE = {
  '1.0.0': 'sha256:90c3def9d332bf5bfc9f89d4b98ab3423705b06149b7e7f30aa6ca2349ed17d6',
  // HK-897: session-start.sh also knows a folder's own key, and that a bearer_token_env_var merged in from
  // the Codex home replaces it; it never prints a key pasted where a variable's name belongs, and says a
  // form it does not read is unread (review of 1.0.1, still unshipped, so one approval covers both).
  // Codex 0.165.0 hooks/list reported the same value (2026-10-29).
  '1.0.1': 'sha256:77953fe8a65852f21479f1de49f91d2dd7498862d32440c3847f00650d207c8a',
};

test('(e) the hooks plugin folder hash is pinned to its version', () => {
  const { version } = readJson(path.join(HOOKS_PLUGIN, '.codex-plugin', 'plugin.json'));
  const hash = pluginContentHash(HOOKS_PLUGIN);
  assert.equal(
    hash,
    PINNED_BUNDLE[version],
    `plugins/hiveku-hooks ${version} now hashes to ${hash}: every person must trust the hooks again. ` +
      'If that is meant, give plugins/hiveku-hooks/.codex-plugin/plugin.json a new version and pin this hash for it in test/hooks-plugin-split.test.mjs.',
  );
});

test('(e) the hash moves with any byte, name or file in the folder, and not with the hiveku plugin (negative control)', () => {
  const base = pluginContentHash(HOOKS_PLUGIN);
  /** A copy of the marketplace's two plugin folders, changed by `edit`; the hooks plugin's hash. */
  const hashAfter = (edit) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-hooks-hash-'));
    fs.cpSync(HOOKS_PLUGIN, path.join(dir, 'hiveku-hooks'), { recursive: true });
    fs.cpSync(MAIN_PLUGIN, path.join(dir, 'hiveku'), { recursive: true });
    edit(path.join(dir, 'hiveku-hooks'), path.join(dir, 'hiveku'));
    return pluginContentHash(path.join(dir, 'hiveku-hooks'));
  };
  assert.equal(hashAfter(() => {}), base, 'a copy hashes the same');
  // The hiveku plugin is another folder: a new ask-list entry leaves the hooks' hash alone.
  assert.equal(
    hashAfter((hooks, hiveku) => {
      const cfg = readJson(path.join(hiveku, '.mcp.json'));
      cfg.hiveku.tools.some_new_tool = { approval_mode: 'prompt' };
      fs.writeFileSync(path.join(hiveku, '.mcp.json'), JSON.stringify(cfg, null, 2));
    }),
    base,
  );
  // Python bytecode is skipped, as Codex skips it.
  assert.equal(
    hashAfter((hooks) => {
      fs.mkdirSync(path.join(hooks, 'hooks', '__pycache__'));
      fs.writeFileSync(path.join(hooks, 'hooks', '__pycache__', 'x.pyc'), 'x');
    }),
    base,
  );
  // One byte, a new file, a rename: each one moves the hash.
  for (const edit of [
    (hooks) => {
      const stop = path.join(hooks, 'hooks', 'stop.sh');
      fs.writeFileSync(stop, fs.readFileSync(stop, 'utf8').replace('MAX_NAMED=3', 'MAX_NAMED=4'));
    },
    (hooks) => fs.writeFileSync(path.join(hooks, '.DS_Store'), ''),
    (hooks) => fs.renameSync(path.join(hooks, 'LICENSE'), path.join(hooks, 'LICENSE.txt')),
  ]) {
    assert.notEqual(hashAfter(edit), base);
  }
});
