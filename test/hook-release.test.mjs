import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkHookRelease } from '../scripts/check-hook-release.mjs';

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hiveku-hook-release-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Hook release test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const write = (name, text) => {
    const file = path.join(cwd, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const version = (value) => write('plugins/hiveku-hooks/.codex-plugin/plugin.json', JSON.stringify({ version: value }));
  const commit = () => {
    git('add', '--', 'plugins', 'test');
    git('commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  version('1.0.1');
  write('plugins/hiveku-hooks/hooks/stop.sh', 'exit 0\n');
  write('plugins/hiveku/.mcp.json', '{}');
  write('test/fingerprint-pin.json', '{"1.0.1":"original"}');
  const base = commit();
  return { cwd, git, write, version, commit, base };
}

test('main-plugin-only updates do not require another hook approval', (t) => {
  const f = fixture(t);
  f.write('plugins/hiveku/.mcp.json', '{"new_tool":true}');
  f.commit();
  assert.equal(checkHookRelease(f).changed, false);
});

test('changing hook bytes under an existing version is refused even if its pin is replaced', (t) => {
  const f = fixture(t);
  f.write('plugins/hiveku-hooks/hooks/stop.sh', 'echo changed\n');
  f.write('test/fingerprint-pin.json', '{"1.0.1":"replacement"}');
  f.commit();
  assert.throws(() => checkHookRelease(f), /Published versions are immutable/);
});

test('adding, deleting or renaming any bundle file requires a new version', (t) => {
  const f = fixture(t);
  f.write('plugins/hiveku-hooks/hooks/generated.txt', 'unexpected state');
  f.commit();
  assert.throws(() => checkHookRelease(f), /does not exceed/);
  f.git('mv', 'plugins/hiveku-hooks/hooks/generated.txt', 'plugins/hiveku-hooks/hooks/renamed.txt');
  const added = f.git('rev-parse', 'HEAD');
  f.commit();
  assert.throws(() => checkHookRelease({ ...f, base: added }), /does not exceed/);
  f.git('rm', '--', 'plugins/hiveku-hooks/hooks/renamed.txt');
  const renamed = f.git('rev-parse', 'HEAD');
  f.commit();
  assert.throws(() => checkHookRelease({ ...f, base: renamed }), /does not exceed/);
});

test('a strictly newer hook version permits an intentional changed release', (t) => {
  const f = fixture(t);
  f.version('1.0.2');
  f.write('plugins/hiveku-hooks/hooks/stop.sh', 'echo changed\n');
  f.commit();
  assert.deepEqual(checkHookRelease(f), { changed: true, oldVersion: '1.0.1', newVersion: '1.0.2' });
});

test('a downgrade is refused', (t) => {
  const f = fixture(t);
  f.version('1.0.0');
  f.commit();
  assert.throws(() => checkHookRelease(f), /does not exceed/);
});
