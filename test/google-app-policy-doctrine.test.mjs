/**
 * Hiveku's Google app policy (2026-09-27), as the Codex plugin teaches it
 * (mirrored from the Claude Code plugin 0.27.4, lvahost/hiveku-claude-plugin
 * PR #45, test/google-app-policy-doctrine.test.mjs).
 *
 * The only Google Cloud project a customer may own is their internal Gmail
 * project. Every other Google product (Google Ads, Analytics and the Tag
 * Manager that rides on it, Search Console, Business Profile, Calendar) runs
 * on Hiveku's own Google app and, for Google Ads, Hiveku's developer token.
 * The builder refuses an own oauth_app_id for those products (400
 * google_own_app_not_allowed) and a Google Ads developer token (400
 * developer_token_not_allowed); a connection still on an own app is MOVED with
 * a reconnect link that names oauth_app_id 'platform'. Hiveku's Google Ads
 * client is unverified for the Data Manager scope, so Google shows an
 * 'unverified app' screen on the Google Ads consent only, and a Workspace
 * that blocks unverified apps answers 'Access blocked' until its admin allows
 * Hiveku's app.
 *
 * The Codex skills said nothing about connecting Google products, so an agent
 * working from the tool list alone could still ask an owner for a developer
 * token or a Cloud project of their own, both refused now. These pins keep:
 *   - the orient skill stating the policy, both refusals, the connect link and
 *     the move, and what to tell the owner (the move, the dropped developer
 *     token, the Google Ads 'unverified app' screen, 'Access blocked');
 *   - the orient description naming it, so the skill loads for a connect ask;
 *   - no prose (README, skills) offering an own Google app, own Google client
 *     credentials, a developer token or a Cloud project of the customer's own,
 *     unless the sentence refuses it;
 *   - every 'unverified app' screen tied to Google Ads.
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
const ORIENT = path.join(SKILLS, 'hiveku-orient', 'SKILL.md');

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out;
}
const PROSE = ['README.md', ...walk(SKILLS)];

/** The orient section on Google products: from its heading to the next one. */
function googleSection() {
  const text = read(ORIENT);
  const start = text.indexOf('## Connecting Google products');
  assert.notEqual(start, -1, 'the orient skill has a "Connecting Google products" section');
  const next = text.indexOf('\n## ', start + 1);
  return flat(text.slice(start, next === -1 ? undefined : next));
}

/**
 * The old offers, word for word as the Claude plugin and its mirrors used to
 * carry them. Each sent an agent to an own Google app, own Google credentials
 * or a developer token.
 */
const OLD_OFFERS = [
  /google_ads (?:create )?with the account's OWN Google app/i,
  /google_ads needs developer_token/i,
  /developer_token \(BYOK/i,
  /\bG(?:SC|BP) (?:as|by) BYOK\b/i,
  /google_search_console: \{ platform, site_url, client_id/i,
  /google_business_profile: \{ platform, client_id/i,
  /Each Google source needs a per-account OAuth app/i,
  /call ppc_connection_update with \{\s*developer_token/i,
  /The call needs a developer_token and returns 412/i,
  /A 412 with a hint means no developer token/i,
  /For Google Ads, prefer integration_oauth_initiate over BYOK/i,
  /Nothing connected: ppc_connection_create builds a BYOK connection/i,
  /seo_connection_create \(BYOK/i,
  /seo_connection_create per the BYOK arguments/i,
  /\[CONFIRM, BYOK\]/,
  /BYOK credentials; GSC needs/i,
  /platform: 'google_search_console', site_url, client_id/i,
];

/** add_products: ['google_analytics'] (or google_ads / search console / business profile) not stated as refused. */
const EXTEND_GOOGLE_APP = /add_products: \[\s*'(?:google_analytics|google_ads|google_search_console|google_business_profile)'/g;

/**
 * Any new wording: a sentence that mentions a developer token, or a Google
 * Cloud project or console, must refuse it, say it is Hiveku's, or be the
 * Gmail exception. A sentence that just tells the agent to get one is flagged.
 */
const DEV_TOKEN = /developer[_ ]token/i;
const CLOUD_PROJECT = /\bGoogle Cloud (?:Console|project)\b|\bCloud (?:Console|project)\b/i;
const REFUSING = /\bnever\b|\brefus|\bdropped\b|Hiveku's|_not_allowed|\bGmail\b/i;

function sentences(text) {
  return flat(text).split(/(?<=[.!?])\s+(?=[A-Z`*(-])/);
}

function offersIn(text) {
  const t = flat(text);
  const hits = OLD_OFFERS.filter((re) => re.test(t)).map(String);
  for (const m of t.matchAll(EXTEND_GOOGLE_APP)) {
    const before = t.slice(Math.max(0, m.index - 80), m.index);
    if (!/refuse|never/i.test(before)) hits.push(`extends an own Google app: ${m[0]}`);
  }
  for (const s of sentences(text)) {
    if ((DEV_TOKEN.test(s) || CLOUD_PROJECT.test(s)) && !REFUSING.test(s)) hits.push(`unrefused: ${s.slice(0, 160)}`);
  }
  return hits;
}

test("the orient skill states Hiveku's Google app policy, both refusals, the connect link and the move", () => {
  const t = googleSection();
  for (const phrase of [
    "every Google product except Gmail (Google Ads, Analytics and the Tag Manager that rides on it, Search Console, Business Profile, Calendar) runs on Hiveku's own Google app and, for Google Ads, Hiveku's developer token",
    'The only Google app an account may own is its internal Gmail app.',
    'Never ask for a developer token, a client id, a client secret or a refresh token, never name an own oauth_app_id',
    'never send anyone into a Google Cloud project of their own',
    '400 google_own_app_not_allowed',
    '400 developer_token_not_allowed',
    'integration_connectors_list',
    "integration_connect_link_create({ connector, source: 'plugin' })",
    'Google Ads needs nothing up front',
    'integration_connect_link_status({ link_id, wait_seconds: 8 })',
    "whose client_source is 'byok'",
    "integration_connect_link_create({ connector, target_connection_id, oauth_app_id: 'platform' })",
    'It keeps its id, bindings and history',
    'Own apps stay for Gmail, Outlook, Microsoft Ads, Meta, LinkedIn and TikTok.',
  ]) {
    assert.ok(t.includes(phrase), `the orient Google section does not say: ${phrase}`);
  }
  // Every entry point that answers google_own_app_not_allowed is named, so an
  // agent does not read the refusal on one tool as a reason to try another.
  for (const tool of ['oauth_app_create', 'oauth_app_update', 'integration_oauth_initiate', 'ppc_connection_create', 'seo_connection_create', 'ppc_connection_update', 'seo_connection_update']) {
    assert.ok(t.includes(tool), `the orient Google section does not name ${tool}`);
  }
  // A Google connector that is not ready is Hiveku's app missing, and so is
  // hiveku_native false on Business Profile: never an own-app task.
  assert.ok(t.includes("means Hiveku's app is not configured on this environment: report it with hiveku_report_issue, never register an own Google app for it"));
  assert.ok(t.includes("hiveku_native: false on Google Business Profile (social_provider_list) means Hiveku's Google app is missing, never a bring-your-own-app connect"));
});

test('the orient skill says what the owner is told before the link goes out', () => {
  const t = googleSection();
  for (const phrase of [
    "On a move: it moves onto Hiveku's own Google app",
    "a Google Ads connection's own developer token is dropped (Hiveku's is used)",
    "For Google Ads, Google first shows an 'unverified app' screen (Advanced, then continue)",
    "if Google says 'Access blocked' instead, their Google Workspace admin blocks unverified apps, and nothing changes until the admin allows Hiveku's app",
  ]) {
    assert.ok(t.includes(phrase), `the orient Google section does not say: ${phrase}`);
  }
});

test('the orient description names the Google policy, so the skill loads for a connect request', () => {
  const front = read(ORIENT).split('\n---')[0];
  const description = flat((front.match(/^description:\s*"(.*)"\s*$/m) || [])[1] || '');
  assert.ok(description.includes("connecting Google products on Hiveku's own Google app"), description);
  assert.ok(description.includes('never a developer token or an own Google app, Gmail aside'), description);
});

test('no skill or README offers an own Google app, own Google credentials, a developer token or a Cloud project (Gmail aside)', () => {
  assert.ok(PROSE.length >= 8, `expected the README and the skills, found ${PROSE.length} files`);
  const hits = PROSE.flatMap((rel) => offersIn(read(rel)).map((h) => `${rel}: ${h}`));
  assert.deepEqual(hits, []);
});

test('flags each old wording and a new unrefused ask (positive controls)', () => {
  for (const old of [
    "- `google_ads` create with the account's OWN Google app: `developer_token` and `customer_id` up\n  front (the server refuses without them).",
    '| Ads platform by BYOK credentials | `ppc_connection_create({ platform, ... })`. Per-platform requirements differ: google_ads needs developer_token + client_id + client_secret + refresh_token + customer_id |',
    '| GSC or GBP by BYOK refresh token | `seo_connection_create` with `client_id` + `client_secret` + `refresh_token`. |',
    "   login-customer-id on every call), `developer_token` (BYOK, from the MCC's API Center).",
    "- google_search_console: `{ platform, site_url, client_id, client_secret, refresh_token }`",
    "Fix with `oauth_app_update({ oauth_app_id, add_products:\n   ['google_analytics'] })` - use `add_products`, which merges.",
    'Each Google source needs a per-account OAuth app (BYOK) - same pattern as Google Ads.',
    'Missing sources: `seo_connection_create` per\n   `references/outcomes-and-measurement.md` [CONFIRM, BYOK], then `seo_sync`.',
    "for GSC that is `{ platform: 'google_search_console', site_url, client_id, client_secret, refresh_token }`",
    // New wordings no legacy pattern knows.
    'Ask the owner for their Google Ads developer token and customer id.',
    "Collect the `developer_token` from the MCC's API Center.",
    'Have the owner enable the Tag Manager API in their Google Cloud project.',
  ]) {
    assert.ok(offersIn(old).length > 0, `not flagged: ${old}`);
  }
  // Wordings that refuse, or name the Gmail exception, are not flagged.
  for (const ok of [
    "`oauth_app_update` refuses\n   `add_products: ['google_analytics']` with 400 `google_own_app_not_allowed`",
    'Never ask for a developer token, a client id, a client secret or a refresh token.',
    "A Google Ads connection's own developer token is dropped (Hiveku's is used).",
    'Google Cloud project work is only ever for the Gmail app.',
  ]) {
    assert.deepEqual(offersIn(ok), [], ok);
  }
});

test("every 'unverified app' screen is tied to Google Ads", () => {
  let seen = 0;
  const loose = [];
  for (const rel of PROSE) {
    const t = flat(read(rel));
    for (const m of t.matchAll(/unverified app'? screen/gi)) {
      seen += 1;
      if (!t.slice(Math.max(0, m.index - 80), m.index).includes('Google Ads')) loose.push(`${rel} @${m.index}`);
    }
  }
  assert.ok(seen > 0, "no skill tells the owner about the Google Ads 'unverified app' screen");
  assert.deepEqual(loose, []);
});
