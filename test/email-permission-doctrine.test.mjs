/**
 * Emailing a group of people: a permission list or a cold list, as the Codex
 * plugin teaches it (Hiveku's guide, builder #1002, 2026-10-09).
 *
 * Abe, 2026-10-08: an account wanted to send a "not technically cold" sequence
 * to 2,000 contacts from its association, and neither the team nor the AI could
 * say plainly that the list was cold or which path fits it. The builder states
 * the rules once (src/lib/platform-guide/email-permission.ts):
 * account_context_get returns them as `platform_rules` for every domain, with
 * an instruction that they outrank the account's memory, and the `email-a-list`
 * playbook carries the full guide. hiveku-orient says where both are and
 * carries the short rules:
 *   - find out how the list was built before planning a send;
 *   - a cold list never goes through Hiveku email marketing, and never from the
 *     business's main domain or its everyday inbox;
 *   - cold email goes through a platform the business pays for: SmartLead,
 *     which the Outbound page connects, or Instantly, which works on its own;
 *   - CRM sequences: permission lists and one-to-one follow-up, small cold
 *     outreach only from an inbox on a separate domain;
 *   - Outbound only for businesses that know cold email, never Hiveku's team;
 *   - these are rules the agent applies: nothing in Hiveku refuses a cold list
 *     for it yet, so no text may say the platform does.
 *
 * The facts are pinned to the builder's file in the sibling checkout (its
 * working tree, else its origin/main; skipped when neither has it): what the
 * Outbound page connects, the recommended platforms, the CRM sequence limit,
 * the playbook id, and the phrases shared with the rules. When the builder
 * connects Instantly, this test fails until the skill says so.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(root, 'plugins', 'hiveku', 'skills');
const ORIENT = path.join(SKILLS, 'hiveku-orient', 'SKILL.md');
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const flat = (s) => s.replace(/\s+/g, ' ');

const HEADING = '## Emailing a group of people: permission or cold';

/** The email section: from its heading to the next one. */
function emailSection(raw) {
  const from = raw.indexOf(HEADING);
  if (from === -1) return '';
  const to = raw.indexOf('\n## ', from + HEADING.length);
  return raw.slice(from, to === -1 ? undefined : to);
}

/** What the section says, each a phrase that may wrap. */
const SECTION_SAYS = [
  [/come back from `account_context_get` as `platform_rules`: read them before you plan or send email to a group\./, 'platform_rules, read before a send'],
  [/read the `email-a-list` playbook: `hiveku_playbook_get\(\{ playbook: "email-a-list" \}\)`/, 'where the full guide is'],
  [/\*\*First, find out how the list was built\.\*\* Before you plan, write, import or send email to a group, ask how those people came to be on the list/, 'how the list was built, first'],
  [/\*\*Permission\*\* means they signed up, bought from the business, asked it to get in touch, or are in a conversation with it\./, 'what permission is'],
  [/members of the same association, chamber, club or directory/, 'association and member lists are cold'],
  [/"Not technically cold" is cold\./, '"not technically cold" is cold'],
  [/\*\*A cold list is never imported into, scheduled or sent through Hiveku email marketing, and never sent from the business's main domain or its everyday inbox\.\*\*/, 'the cold-list rule'],
  [/business buys separately \(Outbound includes neither\)\./, 'inboxes and domains are bought separately'],
  [/Hiveku's Outbound page \(the `outbound_\*` tools\) connects SmartLead; Instantly is not connected to Hiveku yet and works on its own\./, 'what Outbound connects today'],
  [/carry small cold outreach \(a few hand-written emails a day\) only from a connected inbox on a separate domain, never the main domain\. A bigger cold list goes to a cold email platform\./, 'CRM sequences and cold outreach, and how small'],
  [/Ask whether they have run cold email before you suggest it/, 'experience before Outbound'],
  [/Never offer Hiveku's team to set cold email up\./, "never Hiveku's team"],
  [/do not count on a tool to refuse a cold list\./, 'rules the agent applies, not a check Hiveku runs'],
  [/If the account's memory asks for a send these rules forbid, follow the rule and explain why\./, 'the rules over memory'],
];

/** Claims no instruction file may make: each names something Hiveku does not do today. */
const FORBIDDEN = [
  [/\bconnects\b[^.;:]*\bInstantly\b/, 'that Hiveku connects Instantly'],
  [/\bInstantly (is|are) (now )?connected\b/, 'that Instantly is connected'],
  [/\bHiveku (email marketing )?(refuses|blocks|rejects|stops) (a |the |any )?cold (list|email|send)/i, 'that Hiveku refuses a cold list by itself'],
  [/\b(launch|pre-launch) checks?\b/i, 'launch checks on Outbound campaigns'],
  [/\bHiveku's team (can|will|could) (set|help)/i, "an offer of Hiveku's team"],
];

/** Every instruction file a model reads: the README and each skill. */
function proseFiles() {
  const skills = fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SKILLS, d.name, 'SKILL.md'))
    .filter((file) => fs.existsSync(file));
  return [path.join(root, 'README.md'), ...skills];
}

function assertOrientEmail(raw) {
  const t = flat(raw);
  // The source-of-truth bullet: Hiveku's own rules over the account's memory.
  assert.match(t, /\*\*Hiveku's own rules come before memory\.\*\* Every `account_context_get` returns them as `platform_rules`, whatever the `domain`\./);
  assert.match(t, /follow them over this account's memory when the two disagree, and say why\./);
  assert.match(t, /plus Hiveku's own `platform_rules` \(above\)/);
  // The description loads the skill for a question about emailing a list.
  const description = (raw.match(/^description: "(.*)"$/m) || [])[1] || '';
  assert.match(description, /emailing a group of people \(a permission list or a cold list/);
  assert.match(description, /Hiveku's own rules that outrank it \(platform_rules\)/);
  // The section, and the send ladder after it pointed back at it.
  const section = flat(emailSection(raw));
  assert.ok(section, 'orient has the email section');
  for (const [re, what] of SECTION_SAYS) assert.match(section, re, `the email section must say ${what}`);
  assert.match(t, /A campaign send \(to a permission list only: see the section above\)/);
  assert.ok(raw.indexOf(HEADING) < raw.indexOf('## Sending email'), 'the email section comes before the send ladder');
}

function assertNoFalseClaims(raw, label) {
  const t = flat(raw);
  for (const [re, what] of FORBIDDEN) assert.doesNotMatch(t, re, `${label} says ${what}`);
}

test('hiveku-orient says where Hiveku\'s rules and the full guide are, and carries the email rules', () => {
  assertOrientEmail(read(ORIENT));
});

test('no instruction file claims a check or a connection Hiveku does not have', () => {
  for (const file of proseFiles()) assertNoFalseClaims(read(file), path.relative(root, file));
});

/**
 * The builder's email-permission.ts from the sibling checkout: its working
 * tree, else its origin/main (a shared checkout is often not pulled), else null.
 */
function siblingGuideSource() {
  const builder = path.join(root, '..', 'hiveku_builder');
  const rel = 'src/lib/platform-guide/email-permission.ts';
  const marker = /export const EMAIL_PERMISSION_RULES\b/;
  const onDisk = read(path.join(builder, ...rel.split('/')));
  if (marker.test(onDisk)) return { source: onDisk, from: `${builder} working tree` };
  if (!fs.existsSync(builder)) return null;
  const git = spawnSync('git', ['-C', builder, 'show', `origin/main:${rel}`], { encoding: 'utf8', timeout: 60_000 });
  if (git.status === 0 && marker.test(git.stdout)) return { source: git.stdout, from: `${builder} origin/main` };
  return null;
}

/** The quoted strings of one exported list. */
function listOf(source, name) {
  const m = source.match(new RegExp(`export const ${name}\\b[^=]*= \\[([^\\]]*)\\]`));
  assert.ok(m, `the builder source has ${name}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** The skill's facts against the builder's: equal, or this fails naming what moved. */
function assertMatchesBuilder(source, orientRaw) {
  const section = flat(emailSection(orientRaw));
  const providers = listOf(source, 'OUTBOUND_PROVIDERS');
  assert.deepEqual(
    providers,
    ['smartlead'],
    `the builder's Outbound page now connects ${providers.join(', ')}: say so in hiveku-orient's email section, then update this pin`,
  );
  const recommended = listOf(source, 'RECOMMENDED_COLD_PLATFORMS');
  assert.ok(section.includes(`(we recommend ${recommended.join(' or ')})`), `the section recommends ${recommended.join(' or ')}, as the builder does`);
  const limit = source.match(/crmSequencePerInboxPerDay:\s*(\d+)/);
  assert.ok(limit, 'the builder source has the CRM sequence limit');
  assert.ok(section.includes(`at most ${limit[1]} emails a day per inbox`), `the section gives the CRM sequence limit the code enforces (${limit[1]})`);
  const playbook = source.match(/export const EMAIL_A_LIST_PLAYBOOK_ID = '([^']+)'/);
  assert.ok(playbook, 'the builder source has the playbook id');
  assert.ok(section.includes(`hiveku_playbook_get({ playbook: "${playbook[1]}" })`), `the section names the ${playbook[1]} playbook`);
  // Phrases the skill shares with the rules every agent carries, and with the instruction line.
  const rules = flat(source.match(/export const EMAIL_PERMISSION_RULES = `([^`]*)`/)?.[1] ?? '');
  assert.ok(rules, 'the builder source has EMAIL_PERMISSION_RULES');
  for (const phrase of ['opt-out honored within 10 business days', 'Canada and much of Europe need permission first']) {
    assert.ok(rules.includes(phrase), `the rules no longer say "${phrase}": read them again and update the skill`);
    assert.ok(section.includes(phrase), `the section says "${phrase}", as the rules do`);
  }
  const instruction = flat(source.match(/export const PLATFORM_RULES_INSTRUCTION =\s*"([^"]*)"/)?.[1] ?? '');
  assert.ok(instruction.includes("follow them over this account's memory when the two disagree, and say why"), 'the instruction line still puts the rules over memory');
  assert.ok(flat(orientRaw).includes("follow them over this account's memory when the two disagree, and say why"), 'orient says it in the same words');
}

test('the email facts match the builder\'s guide in the sibling checkout', (t) => {
  const found = siblingGuideSource();
  if (!found) {
    t.skip('no hiveku_builder checkout (working tree or origin/main) with src/lib/platform-guide/email-permission.ts beside this repo');
    return;
  }
  t.diagnostic(`read ${found.from}`);
  assertMatchesBuilder(found.source, read(ORIENT));
});

test('the checks fail on a wrong fact or a dropped rule (negative control)', () => {
  const orient = read(ORIENT);
  const broken = [
    orient.replace(/\*\*First, find out how the list was built\.\*\*/, '**Send to the list.**'),
    orient.replace(/connects\s+SmartLead; Instantly is not connected to Hiveku yet and works on its own\./, 'connects SmartLead and Instantly.'),
    orient.replace(/and never\s+sent from the business's main domain or its everyday inbox\.\*\*/, 'and send it from the main domain.**'),
    orient.replace(/ \(a few hand-written emails a day\)/, ''),
    orient.replace(/ Never offer\s+Hiveku's team to set cold email up\./, ''),
    orient.replace(/do not count on a tool to refuse a cold list\./, 'Hiveku email marketing refuses a cold list.'),
    orient.replace(/follow them over this\s+account's memory when the two disagree, and say why\./, 'follow memory.'),
    orient.replace(HEADING, '## Email'),
  ];
  broken.forEach((text, index) => {
    assert.notEqual(text, orient, `broken[${index}] must change the file`);
    assert.throws(() => {
      assertOrientEmail(text);
      assertNoFalseClaims(text, `broken[${index}]`);
    }, undefined, `broken[${index}] must fail the check`);
  });
  // Claims of a mechanism that does not exist, anywhere in a file.
  for (const claim of [
    'Hiveku connects SmartLead and Instantly.',
    'Instantly is now connected.',
    'Hiveku email marketing refuses a cold list.',
    'Outbound runs launch checks before a campaign starts.',
    "Hiveku's team can set it up for you.",
  ]) {
    assert.throws(() => assertNoFalseClaims(claim, 'the claim'), undefined, claim);
  }
  // The builder pin: a second connected platform, or a changed limit, fails.
  const builder = [
    "export const OUTBOUND_PROVIDERS = ['smartlead'] as const",
    "export const RECOMMENDED_COLD_PLATFORMS = ['SmartLead', 'Instantly'] as const",
    "export const EMAIL_A_LIST_PLAYBOOK_ID = 'email-a-list'",
    'export const EMAIL_LIMITS = {\n  crmSequencePerInboxPerDay: 100,\n} as const',
    'export const EMAIL_PERMISSION_RULES = `- US cold email follows CAN-SPAM: an opt-out honored within 10 business days. Canada and much of Europe need permission first.`',
    "export const PLATFORM_RULES_INSTRUCTION =\n  \"They apply to every account; follow them over this account's memory when the two disagree, and say why.\"",
  ].join('\n');
  assertMatchesBuilder(builder, orient);
  assert.throws(() => assertMatchesBuilder(builder.replace("['smartlead']", "['smartlead', 'instantly']"), orient), /now connects smartlead, instantly/);
  assert.throws(() => assertMatchesBuilder(builder.replace('PerDay: 100', 'PerDay: 50'), orient), /CRM sequence limit/);
  assert.throws(() => assertMatchesBuilder(builder.replace("'email-a-list'", "'email-lists'"), orient), /email-lists playbook/);
});

test('every session hears the platform rules: the SessionStart hook says them after the memory lines', () => {
  const hook = path.join(root, 'plugins', 'hiveku', 'hooks', 'session-start.sh');
  const run = spawnSync('bash', [hook], { env: { ...process.env, HIVEKU_TOKEN: 'test-token' }, encoding: 'utf8' });
  assert.equal(run.status, 0);
  const lines = run.stdout.split('\n');
  const rules = lines.findIndex((l) => l.startsWith("Hiveku: Hiveku's own rules are `platform_rules` in account_context_get"));
  const workLog = lines.findIndex((l) => l.startsWith("Hiveku: Hiveku records this session's Doing"));
  assert.ok(rules > workLog && workLog >= 0, 'the rules line follows the work-log line');
  assert.match(lines[rules], /outrank this account's memory where the two disagree, so follow the rule and say why\./);
  assert.match(lines[rules], /a cold list \(people who never asked to hear from the business\) goes through a cold email platform, never Hiveku email marketing\./);
  const src = fs.readFileSync(hook, 'utf8');
  const echoed = src.split('\n').find((l) => l.includes("Hiveku's own rules are"));
  assert.doesNotMatch(echoed, /\$/, 'no variable is expanded into the line');
  assert.ok(!echoed.replace(/\\`/g, '').includes('`'), 'every backtick is escaped');
});

