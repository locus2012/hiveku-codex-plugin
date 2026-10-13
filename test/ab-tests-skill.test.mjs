/**
 * The Codex plugin's A/B tests skill must carry the rules the Claude plugin's CRO, PPC and SEO
 * texts carry, in its own words. Before it, Codex had no A/B knowledge of its own and relied on
 * the MCP tool descriptions, which say nothing about a test that is already running.
 *
 * Each block pins one rule:
 *   - making the copy saves a version of the code, so it previews first and needs a yes;
 *   - version B is changed in the copy's own files (never the original's), deployed, then started;
 *   - while a test runs or is paused, neither page changes; a page that must change means ending
 *     the test (or ending it and starting a new one) and saying why;
 *   - "send everyone to version B" adds a temporary (302) redirect;
 *   - paid ads: list the tests before a spend or final-URL change, final URLs stay on the
 *     original, a route sends one platform's clicks to its own page, page tests are not
 *     campaign experiments;
 *   - SEO: the copy is canonical and out of the sitemap on purpose (the canonical travels in the
 *     HTTP headers, and a route's page gets none), the redirect is a 302, and a running or
 *     recently ended test is ruled out first.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_DIR = 'plugins/hiveku/skills/hiveku-ab-tests';
const skillPath = path.join(root, SKILL_DIR, 'SKILL.md');
const raw = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : '';
const flat = (s) => s.replace(/`/g, '').replace(/\s+/g, ' ');

/** A `## heading` section, up to the next `## ` (or the end). */
function section(heading) {
  const i = raw.indexOf(heading);
  assert.ok(i >= 0, `missing section: ${heading}`);
  const j = raw.indexOf('\n## ', i + heading.length);
  return flat(j > i ? raw.slice(i, j) : raw.slice(i));
}

test('the skill exists, its frontmatter names its folder, and the README lists it', () => {
  assert.ok(raw.length > 0, `${SKILL_DIR}/SKILL.md must exist`);
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, 'frontmatter');
  assert.match(fm[1], /^name: hiveku-ab-tests$/m);
  const desc = fm[1].match(/^description: "(.*)"$/m);
  assert.ok(desc, 'a quoted description');
  assert.ok(desc[1].length <= 1024, `description is ${desc[1].length} characters; keep it under 1024`);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /`hiveku-ab-tests`/);
});

test('version B is changed in the copy, deployed, then started', () => {
  const s = section('## Making and changing version B');
  assert.ok(s.includes("To change version B, edit the copy's own files, never the original's."));
  assert.ok(s.includes('deploy to production, and only then start the test.'));
  assert.ok(s.includes('the test cannot start until both pages answer on the live site'));
  // make_copy saves a version of the code, so it previews first and waits for a yes.
  assert.ok(s.includes("It saves a version of the site's code, so it shows a preview first and needs a yes (confirm: true)."));
});

test('neither page changes during a test; end it and say why', () => {
  const s = section('## During a test');
  assert.ok(s.includes('While a test runs or is paused, change neither page, the original or version B.'));
  assert.ok(s.includes('A change mixes two versions into one result'));
  assert.ok(s.includes('If a page must change, end the test (or end it and start a new one) and tell the person why.'));
});

test('sending everyone to B adds a temporary redirect', () => {
  const s = section('## Ending a test');
  assert.ok(s.includes('Sending everyone to B adds a temporary (302) redirect from the original address to the copy'));
});

test('paid ads: list the tests, final URLs on the original, routes, not campaign experiments', () => {
  const s = section('## Paid ads');
  assert.ok(s.includes('Before a budget, bid, targeting, audience or final-URL change on a campaign that lands on a page with a running test or route, list the site\'s tests.'));
  assert.ok(s.includes('Hold the change, or say plainly that it will skew the result'));
  assert.ok(s.includes('Keep ad final URLs on the original page. The split happens on the site and keeps gclid and UTM tags.'));
  assert.ok(s.includes("A route can send one ad platform's clicks to a page of its own without changing the ad."));
  assert.ok(s.includes("Page A/B tests are not the ad platforms' own campaign experiments."));
});

test('SEO: the copy is canonical and out of the sitemap on purpose, the redirect is a 302, rule out a test', () => {
  const s = section('## SEO');
  assert.ok(s.includes('A test copy (an address like /pricing-b) is canonical to the original while its test runs and is kept out of the sitemap on purpose.'));
  assert.ok(s.includes('Do not index it, link to it, add it to the sitemap or "fix" it as duplicate content.'));
  assert.ok(s.includes('The A/B redirect is a temporary 302'));
  // The edge sends the canonical as an HTTP header, and never for a route's page.
  assert.ok(s.includes("The canonical is sent in the page's HTTP headers, not in its HTML, so an audit that reads only the HTML reports it missing."));
  assert.ok(s.includes("A route's page gets no canonical."));
  assert.ok(s.includes('rule out a running or recently ended test or route on the page.'));
});
