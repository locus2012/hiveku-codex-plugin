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
 *     credentials, a developer token or a Cloud project of the customer's own:
 *     a sentence that names one must refuse it or be about Gmail or a provider
 *     that is not Google (in the clause that names it), name Hiveku's own, or
 *     be the shipped move sentence word for word;
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
 * Any new wording, one sentence at a time. A sentence that names one of the
 * ASKS below is flagged unless every mention is excused:
 *   - its clause refuses it (never, refuses, dropped, not allowed, *_not_allowed);
 *   - the thing named is Hiveku's own ("Hiveku's developer token"), or a code
 *     name in brackets right after naming it ("Hiveku's developer token
 *     (`GOOGLE_ADS_DEVELOPER_TOKEN`)");
 *   - the sentence is MOVE_SENTENCE, word for word;
 *   - its clause is about Gmail, or about a provider that is not Google, and
 *     the sentence names no Google product that runs on Hiveku's app. Gmail has
 *     no developer token, and of the other providers only Microsoft Ads (Bing
 *     Ads) has one, so only Microsoft Ads excuses a developer token.
 * A clause is the part of a sentence between semicolons or spaced dashes, so an
 * excuse in one clause ("...; Gmail stays on its own app", "...; pasting it
 * into chat is not allowed") does not reach an ask in another. "Hiveku's"
 * anywhere else excuses nothing: "Paste the owner's developer token into
 * Hiveku's form" is still an ask. A developer token counts inside a code or
 * environment name too (`GOOGLE_ADS_DEVELOPER_TOKEN`, `googleAdsDeveloperToken`).
 * The price: a mention whose excuse sits only in another clause is flagged
 * even when it only describes ("...on the LinkedIn row; the refresh token aged
 * out"), so name the provider, or the refusal, in the mention's own clause. The
 * limit: a refusal or a provider in the SAME clause still excuses an ask it
 * does not govern ("ask for the developer token and never share it").
 */
const REFUSING = /\bnever\b|\brefus|\bdropped\b|_not_allowed\b|\bnot allowed\b/i;
/**
 * Right before the word that holds a mention: the thing named is Hiveku's own,
 * or a code name in brackets right after "Hiveku's developer token".
 */
const HIVEKUS_OWN = /\bHiveku['’]s (?:own )?(?:developer tokens? \()?$/i;
/**
 * The one shipped sentence that names an own app and a developer token without
 * refusing them: the orient move bullet, describing the byok row it moves. It
 * is excused word for word (as sentences() gives it), so any change to it, even
 * one verb ("keeps its developer token after the move"), is scanned like new
 * wording. Change it here only together with the orient skill.
 */
const MOVE_SENTENCE = "- **Move a connection that still runs on the account's own app.** A Google connection other than Gmail whose client_source is 'byok' (its own Google app, or a Google Ads row that keeps a developer token of its own) moves with integration_connect_link_create({ connector, target_connection_id, oauth_app_id: 'platform', source: 'plugin' }).";
/**
 * Every Google product but Gmail, by name or slug: each runs on Hiveku's app.
 * The MCC is Google Ads' manager account. Calendar counts only as "Google
 * Calendar" or google_calendar: Gmail's own app carries a calendar of its own
 * (crm_email_calendar), so a bare "Calendar" next to Gmail can be right.
 */
const HIVEKU_APP_PRODUCT = /\bGoogle (?:Ads|Calendar)\b|\b(?:Analytics|Tag Manager|Search Console|Business Profile|GA4|GTM|GSC|GBP|MCC)\b|\bgoogle_(?:ads|analytics|search_console|business_profile|calendar)|\bgbp_social\b/i;
const GMAIL = /\bGmail\b/i;
/** Providers that are not Google, where an own app is still allowed. */
const OTHER_PROVIDER = /\b(?:Outlook|Microsoft|Azure|Bing|Meta|Facebook|Instagram|LinkedIn|TikTok|X|Twitter|Shopify|Webflow|Amazon)\b/;
/** The only provider other than Google with a developer token. */
const MICROSOFT_ADS = /\b(?:Microsoft (?:Ads|Advertising)|Bing Ads|microsoft_ads|bing_ads)\b/i;
const GOOGLE = /\bGoogle\b|\bgoogle_/i;
/** "Google Cloud" on its own counts in a sentence about a project, an app, a client, an API, a consent screen or credentials. */
const GOOGLE_CLOUD = /\bGoogle Cloud\b|\bGCP\b/gi;
const CLOUD_SETUP = /\b(?:projects?|apps?|applications?|OAuth|clients?|APIs?|consent|credentials?|redirect|service accounts?)\b/i;

/**
 * What a sentence may not ask for. gmail / otherProvider: whether a clause about
 * Gmail, or only about the providers matched, excuses it.
 */
const ASKS = [
  // Gmail has no developer token. No word break is needed before it, so a code or
  // environment name counts (GOOGLE_ADS_DEVELOPER_TOKEN); has_developer_token is a
  // yes/no field on the connection list, not the token.
  { what: 'a developer token', re: /(?<!has_)developer[_ -]?tokens?\b/gi, gmail: false, otherProvider: MICROSOFT_ADS },
  // A word break stays before these: ga_client_id is a visitor's Analytics id.
  { what: 'own client credentials', re: /\bclient[_ -]?(?:ids?|secrets?)\b|\brefresh[_ -]?tokens?\b|\bclient credentials?\b/gi, gmail: true, otherProvider: OTHER_PROVIDER },
  // No other provider has a Google Cloud project.
  { what: 'a Google Cloud project', re: /\b(?:Google )?Cloud (?:Console|project)s?\b|\bconsole\.cloud\.google\.com\b/gi, cloud: true, gmail: true, otherProvider: null },
  { what: 'an own app', re: /\bown (?:Google )?(?:OAuth )?apps?\b|\bown oauth_app_id\b|\bbring[- ]your[- ]own[- ]app\b|\bOAuth (?:apps?|clients?)\b/gi, gmail: true, otherProvider: OTHER_PROVIDER },
];

/**
 * Sentences, never across a blank line, a heading, a list item, a table row or
 * the front matter's closing ---, so one bullet's "never" cannot excuse the
 * next bullet.
 */
function sentences(text) {
  return text
    .split(/\n(?=[ \t]*(?:\n|#|[-*+] |\d+[.)] |\||---))|(?<=^[ \t]*#[^\n]*)\n/m)
    .flatMap((block) => flat(block).trim().split(/(?<=[.!?])\s+(?=[A-Z`*(-])/))
    .filter(Boolean);
}

/** A clause ends at a semicolon or at a dash with a space on each side. */
const CLAUSE_BREAK = /;\s*|\s[—–-]\s/g;

/** The clause of sentence s that holds position at. */
function clauseAt(s, at) {
  const breaks = [...s.matchAll(CLAUSE_BREAK)];
  const before = breaks.filter((m) => m.index < at).pop();
  const after = breaks.find((m) => m.index >= at);
  return s.slice(before ? before.index + before[0].length : 0, after ? after.index : undefined);
}

function excused(s, at, ask) {
  let word = at; // where the code or environment name holding the mention starts
  while (word > 0 && /\w/.test(s[word - 1])) word -= 1;
  const clause = clauseAt(s, at);
  if (REFUSING.test(clause)) return true;
  if (HIVEKUS_OWN.test(s.slice(0, word))) return true;
  if (s === MOVE_SENTENCE) return true;
  if (HIVEKU_APP_PRODUCT.test(s)) return false;
  return (ask.gmail && GMAIL.test(clause)) || (!!ask.otherProvider && ask.otherProvider.test(clause) && !GOOGLE.test(s));
}

/** What one sentence asks for without refusing it. */
function unrefusedAsks(s) {
  const found = [];
  for (const ask of ASKS) {
    const at = [...s.matchAll(ask.re)].map((m) => m.index);
    if (ask.cloud && CLOUD_SETUP.test(s)) at.push(...[...s.matchAll(GOOGLE_CLOUD)].map((m) => m.index));
    if (at.some((i) => !excused(s, i, ask))) found.push(ask.what);
  }
  return found;
}

function offersIn(text) {
  const t = flat(text);
  const hits = OLD_OFFERS.filter((re) => re.test(t)).map(String);
  for (const m of t.matchAll(EXTEND_GOOGLE_APP)) {
    const before = t.slice(Math.max(0, m.index - 80), m.index);
    if (!/refuse|never/i.test(before)) hits.push(`extends an own Google app: ${m[0]}`);
  }
  for (const s of sentences(text)) {
    const asks = unrefusedAsks(s);
    if (asks.length) hits.push(`unrefused ${asks.join(', ')}: ${s.slice(0, 160)}`);
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
    "integration_connect_link_create({ connector, target_connection_id, oauth_app_id: 'platform', source: 'plugin' })",
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

test('flags each old wording and each kind of new unrefused ask (positive controls)', () => {
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
    // A developer token inside a code or environment name.
    'Ask the owner to paste `GOOGLE_ADS_DEVELOPER_TOKEN` into the connection form.',
    "Store the owner's `googleAdsDeveloperToken` on the connection.",
    // "Hiveku's" elsewhere in the sentence excuses nothing.
    "Paste the owner's Google Ads developer token into Hiveku's connection form.",
    // An excuse in another clause excuses nothing: Gmail, another provider, a refusal.
    'Ask the owner for their developer token; Gmail stays on its own app.',
    'Ask the owner for a client id and client secret; Gmail stays on its own app.',
    'Ask the owner for a client id and client secret — Gmail stays on its own app.',
    "Have the owner register the account's own Google app; Gmail needs it.",
    'Ask the owner for a client id and client secret; Outlook keeps its own app.',
    'Ask the owner for their developer token; pasting it into chat is not allowed.',
    'Ask the owner for their developer token; never share it.',
    // Gmail never excuses a developer token, and excuses nothing once a Google product is named.
    'Ask the owner for the developer token Gmail uses.',
    'For Search Console and Gmail, ask the owner for a client id and client secret.',
    // Another provider excuses nothing in a sentence that says Google.
    'Register an own Google app for the Outlook connection.',
    // Of the other providers only Microsoft Ads has a developer token, and the MCC is Google Ads'.
    'Collect the developer token and the Meta system user token.',
    "Collect the MCC's developer token and the Meta system user token.",
    'Ask the owner for the MCC developer token; Meta and TikTok keep their own apps.',
    "Collect the MCC's developer token for Microsoft Ads.",
    // No other provider has a Google Cloud project.
    'Have the owner create a Cloud project for the Outlook connection.',
    // Own client credentials, with no developer token or Cloud project named.
    'For Search Console, ask the owner for a client id and client secret, then call `seo_connection_create`.',
    'Ask the owner for a client id and client secret, then call `seo_connection_create`.',
    // "Google Cloud" on its own, in an instruction to create or use a project or app.
    'Have the owner create an OAuth client in Google Cloud for Google Ads.',
    'Have the owner create a project in Google Cloud for Search Console.',
    // An own app, with no credential named.
    "Register the account's own Google app for Search Console with `oauth_app_create`.",
    // Only the shipped move sentence, word for word, is excused as the move.
    "After the move (`oauth_app_id: 'platform'`), ask the owner for their developer token.",
    "The link (`oauth_app_id: 'platform'`) keeps the row's own developer token.",
    "Before the move (`oauth_app_id: 'platform'`), turn on the Analytics API in the owner's Cloud project.",
    "Move it with `oauth_app_id: 'platform'`; Google Ads still needs the account's developer token.",
    "A Google Ads row whose `client_source` is `'byok'` keeps its developer token when it moves with `oauth_app_id: 'platform'`.",
    // One bullet's "never" does not excuse the next bullet.
    '- Never register an own Google app for Search Console\n- Ask the owner for their Google Ads developer token.',
    '* Never register an own Google app for Search Console\n* Ask the owner for their Google Ads developer token.',
  ]) {
    assert.ok(offersIn(old).length > 0, `not flagged: ${old}`);
  }
  // Wordings that refuse, name Hiveku's own, keep to Gmail or a provider that
  // is not Google, read a yes/no field, or mention Google Cloud with no setup
  // in it, are not flagged.
  for (const ok of [
    "`oauth_app_update` refuses\n   `add_products: ['google_analytics']` with 400 `google_own_app_not_allowed`",
    'Never ask for a developer token, a client id, a client secret or a refresh token.',
    "A Google Ads connection's own developer token is dropped (Hiveku's is used).",
    'The server refuses an own Google app for Search Console.',
    'An own Google app is not allowed for Search Console.',
    'A Google Ads developer token gets 400 `developer_token_not_allowed`.',
    'Google Cloud project work is only ever for the Gmail app.',
    "Google Ads runs on Hiveku's own Google app and Hiveku's developer token.",
    "Google Ads uses Hiveku's own developer token.",
    "Hiveku's developer token (`GOOGLE_ADS_DEVELOPER_TOKEN`) is used for every Google Ads connection.",
    "For Gmail, register the account's own Google app with its client id and client secret.",
    "Outlook needs the account's own Azure app: its client id and client secret.",
    "Microsoft Ads needs the account's own developer token from the Microsoft Advertising developer portal.",
    "The connection list's `has_developer_token` is true on every Google Ads row.",
    'A Googlebot row on Google Cloud (`asn` 396982) is usually an impostor: anyone can rent a server there.',
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
