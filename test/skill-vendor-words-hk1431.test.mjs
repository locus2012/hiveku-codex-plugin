import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walkMarkdown(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

test('HK-1431: Codex plugin skills and README never name the web reading vendor', () => {
  const files = [
    path.join(ROOT, 'README.md'),
    ...walkMarkdown(path.join(ROOT, 'plugins')),
  ];
  assert.ok(files.length >= 4, 'expected README and skill markdown files');
  const offenders = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (/firecrawl|crawl4ai/i.test(content)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, []);
});
