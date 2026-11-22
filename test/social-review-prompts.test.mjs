/**
 * Codex prompts before Review with AI of a social post, and not before its two reads (2026-11-21).
 *
 * social_post_strategy_review has the Social team score a saved post and spends the account's AI credit in the name
 * of the person behind the key; its description says ASK THE PERSON FIRST. The server default here is "approve", so
 * without its own prompt entry it would run with no one asked. social_post_strategy_review_get (the stored review,
 * the live run, the last failure) and social_analytics_who_for (posts by ICP and stage, and the gaps) only read, and
 * the orient skill tells an agent to read the stored review before it asks, so they stay unprompted.
 *
 * The Claude Code plugin gates the same write; its mirror test keeps the two lists equal when both checkouts sit side
 * by side.
 *
 * Run: node --test test/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../plugins/hiveku/.mcp.json', import.meta.url), 'utf8')).hiveku;
const orient = readFileSync(new URL('../plugins/hiveku/skills/hiveku-orient/SKILL.md', import.meta.url), 'utf8');
const REVIEW = 'social_post_strategy_review';
const READS = ['social_post_strategy_review_get', 'social_analytics_who_for'];

/** The orient skill's Review with AI section, its line breaks folded. */
function reviewSection() {
  const start = orient.indexOf('## Review with AI of a social post (charged)');
  assert.ok(start !== -1, 'the orient skill has no Review with AI section');
  const end = orient.indexOf('\n## ', start + 1);
  return orient.slice(start, end === -1 ? undefined : end).replace(/\s*\n\s*/g, ' ');
}

test('the server default is approve, so the review needs its own prompt entry', () => {
  assert.equal(config.default_tools_approval_mode, 'approve');
});

test('Review with AI requires a prompt, and its two reads stay unprompted', () => {
  assert.deepEqual(config.tools[REVIEW], { approval_mode: 'prompt' }, REVIEW);
  for (const name of READS) assert.equal(config.tools[name], undefined, `${name} is a read and must not prompt`);
});

test('the orient skill reads the stored review first, asks the person before a run, and never sends it twice', () => {
  const section = reviewSection();
  const order = [
    `\`${REVIEW}({ post_id })\``,
    "it spends the account's AI credit in the name of the person behind the key",
    'Codex prompts before every call.',
    'Read `social_post_strategy_review_get({ post_id })` first',
    'a `fresh` review already answers, so show it and run nothing',
    'ask the person first',
    'what the last failure cost when the read shows one (`last_failure`)',
    'run it only on their yes, one post per yes, never on their behalf',
    'Send `again: true`',
    "only on the person's word.",
    'never send the review twice',
    'Nothing a review says blocks a post.',
    '`social_analytics_who_for`',
  ];
  let at = -1;
  for (const words of order) {
    const next = section.indexOf(words, at + 1);
    assert.ok(next > at, `the Review with AI section no longer says ${JSON.stringify(words)} in its place`);
    at = next;
  }
  assert.doesNotMatch(section, /[–—]/, 'no long dashes in the section');
});
