/**
 * The edge firewall's refusal contract, as the Codex plugin teaches it
 * (2026-09-25, mirrored from the Claude Code plugin's firewall doctrine test).
 *
 * An automated client the firewall cannot identify gets a 202 challenge (empty
 * body, x-amzn-waf-action: challenge) or a 403 with x-hiveku-firewall: blocked;
 * a request from a known bulk-scraper network gets a 403 with
 * x-hiveku-firewall: blocked-network; a 403 without that header comes from the
 * site itself. The skills used to say "A 403 is the scraper-network block",
 * which reads a site's own 403 as the firewall. The text must be true before
 * and after the edge starts answering 403, so it names both shapes and never
 * says the 403 is already live.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Collapse whitespace and drop backticks so a pinned phrase may wrap and carry code marks. */
const flat = (s) => s.replace(/`/g, '').replace(/\s+/g, ' ');

const SKILLS = path.join('plugins', 'hiveku', 'skills');
const PROSE = [
  'README.md',
  ...fs
    .readdirSync(path.join(root, SKILLS), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SKILLS, d.name, 'SKILL.md'))
    .filter((rel) => fs.existsSync(path.join(root, rel))),
];
const FIREWALL = path.join(SKILLS, 'hiveku-firewall', 'SKILL.md');
const CONTRACT_FILES = [
  FIREWALL,
  path.join(SKILLS, 'hiveku-orient', 'SKILL.md'),
  path.join(SKILLS, 'hiveku-diagnose-deploy', 'SKILL.md'),
  'README.md',
];
const CONTRACT =
  'an automated client the firewall cannot identify gets a 202 challenge (empty body, ' +
  'x-amzn-waf-action: challenge) or a 403 with x-hiveku-firewall: blocked; a request from a known ' +
  'bulk-scraper network gets a 403 with x-hiveku-firewall: blocked-network; a 403 without that ' +
  'header comes from the site itself';

function assertNamesBothShapes(text, label) {
  if (!text.includes('x-amzn-waf-action')) return;
  assert.ok(
    text.includes('x-hiveku-firewall'),
    `${label} teaches x-amzn-waf-action but never x-hiveku-firewall, so a firewall 403 reads as the site's`,
  );
}

const FORBIDDEN = [
  /a 403 is (always )?the scraper-network block/i,
  /a 403 is always/i,
  /(now|no longer) (answers|returns|gets) (a )?(202|403)/i,
  /since the (edge )?switch/i,
  /is now a 403/i,
  // A blocked row mixes the site's own 403s with the firewall's, and the rollup
  // classifies on the status alone, so no network number says which one a row is:
  // once the edge answers 403, a spoofed crawler on rented Azure (8075) lands in the
  // same blocked bucket as the site's own refusals.
  /usually means the site refused it/i,
  /a blocked row from [^.]*\b(15169|8075)\b/i,
];
function assertNoFalseClaims(text, label) {
  const f = flat(text);
  for (const re of FORBIDDEN) assert.doesNotMatch(f, re, `${label} says ${re}`);
}

function assertContract(text, label) {
  assert.ok(flat(text).toLowerCase().includes(CONTRACT), `${label} lacks the refusal contract sentence`);
}

function assertFirewallSkill(text) {
  const f = flat(text);
  for (const token of [
    'site_firewall_client_get({ project_id, environment, user_agent, asn })',
    "q: 'Googlebot'",
    "q: 'bingbot'",
    "outcome keeps one kind of refusal: 'challenged', 'blocked' or 'rate_limited'",
    'limit (1 to 200, default 20) and offset (default 0)',
    'totalClients',
    "blocked counts the site's own 403s as well as the firewall's",
    'A Googlebot row on Google Cloud (asn 396982) is usually an impostor',
    'Real bingbot comes from 8075 (Microsoft / Azure)',
    'the network number alone cannot prove a bingbot real or fake',
    'Read logsState before the numbers',
    "'loading' (the read is still running) and 'busy'",
    'ask again after about a minute',
    "'failed'",
    "'no_hostname'",
    'null means "not read", never zero',
    'It never lifts the per-address rate limit (429), the fingerprint volume challenge, or the scraper-network block (403 with x-hiveku-firewall: blocked-network)',
    'Decide on the status and the x-hiveku-firewall header, never on the body text',
    'The row cannot tell them apart, and neither can its network number',
  ]) {
    assert.ok(f.includes(token), `${FIREWALL} does not teach: ${token}`);
  }
}

test('every file that teaches the challenge header also teaches the x-hiveku-firewall 403', () => {
  assert.ok(PROSE.length >= 5, 'the prose walk found too few files');
  for (const rel of PROSE) assertNamesBothShapes(read(rel), rel);
});

test('no file says a 403 is the scraper-network block or that the 403 is already switched on', () => {
  for (const rel of PROSE) assertNoFalseClaims(read(rel), rel);
});

test('the files that explain a refusal carry the whole contract sentence', () => {
  for (const rel of CONTRACT_FILES) assertContract(read(rel), rel);
});

test('the firewall skill teaches the detail tool, search, paging, the crawler reading, logsState and the allowance limits', () => {
  assertFirewallSkill(read(FIREWALL));
});

test('the checks fail on the old wording (negative control)', () => {
  const old =
    '**The challenge, as a client that cannot run JavaScript sees it: HTTP 202, an empty body, and the\n' +
    'header `x-amzn-waf-action: challenge`.** A real page is never a 202. A 403 is the\n' +
    'scraper-network block and a 429 is the rate limit: an allowance changes neither.';
  assert.throws(() => assertNamesBothShapes(old, 'old'));
  assert.throws(() => assertNoFalseClaims(old, 'old'));
  assert.throws(() => assertContract(old, 'old'));
  assert.throws(() => assertFirewallSkill(old));
  assert.throws(() => assertNoFalseClaims('The edge now answers 403 to every script.', 'claim'));
});

test('a blocked row is never read as the site by its network number (negative control)', () => {
  const oldCrawler =
    'A `blocked` row from Google (`asn` 15169) or\n' +
    '   Microsoft / Azure (8075) usually means the site refused it: check the page, not the firewall.';
  assert.throws(() => assertNoFalseClaims(oldCrawler, 'old crawler reading'));
  assert.throws(() => assertNoFalseClaims('A blocked row from 8075 is the site.', 'bare network reading'));
});
