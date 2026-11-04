#!/usr/bin/env node
/** Compare Git trees, not an editable fingerprint pin, to prevent reusing a hook release. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bundle = 'plugins/hiveku-hooks';
const manifest = `${bundle}/.codex-plugin/plugin.json`;

function versionParts(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Expected a major.minor.patch hook version, received ${JSON.stringify(version)}`);
  }
  return version.split('.').map(BigInt);
}

export function checkHookRelease({ cwd, base, head = 'HEAD' }) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  // Resolve user input to object IDs before using revision:path syntax.
  const baseId = git('rev-parse', '--verify', `${base}^{commit}`);
  const headId = git('rev-parse', '--verify', `${head}^{commit}`);
  const oldVersion = JSON.parse(git('show', `${baseId}:${manifest}`)).version;
  const newVersion = JSON.parse(git('show', `${headId}:${manifest}`)).version;
  const oldParts = versionParts(oldVersion);
  const newParts = versionParts(newVersion);
  const changed = git('rev-parse', `${baseId}:${bundle}`) !== git('rev-parse', `${headId}:${bundle}`);
  if (changed) {
    const firstDifference = newParts.findIndex((part, i) => part !== oldParts[i]);
    if (firstDifference < 0 || newParts[firstDifference] < oldParts[firstDifference]) {
      throw new Error(`hiveku-hooks contents changed but version ${newVersion} does not exceed ${oldVersion}. ` +
        'Published versions are immutable: bump the hook plugin version and add its new fingerprint pin. ' +
        'Do not replace an existing pin or bypass Codex hook approval.');
    }
  }
  return { changed, oldVersion, newVersion };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const base = process.argv[2];
    if (!base) throw new Error('Usage: node scripts/check-hook-release.mjs <base-ref> [head-ref]');
    const result = checkHookRelease({ cwd: process.cwd(), base, head: process.argv[3] || 'HEAD' });
    console.log(result.changed
      ? `Hook release verified: ${result.oldVersion} -> ${result.newVersion}; user reapproval is required.`
      : `Hook bundle unchanged (${result.newVersion}); existing approval can remain valid.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
