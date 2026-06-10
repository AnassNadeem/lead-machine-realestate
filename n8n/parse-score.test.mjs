// Tests for parse-score.code-node.js — the n8n Code node that turns Claude's
// response into lead-score fields.
//
// Run:  node --test n8n/
//
// The Code node is a bare script that reads the n8n global `$input` and ends in
// a top-level `return`. To test the *actual* shipped code (not a copy), we read
// the source and wrap it in a Function with `$input` as a parameter — the
// top-level `return` then returns from that wrapper. We feed it a mocked
// `$input` shaped like the Anthropic HTTP response n8n passes in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./parse-score.code-node.js', import.meta.url), 'utf8');

// Run the node against a given `$input.first().json` payload; return its single
// output item's `json`.
function runWith(json) {
  const fn = new Function('$input', src);
  const $input = { first: () => ({ json }) };
  const out = fn($input);
  assert.ok(Array.isArray(out) && out.length === 1, 'node must return one item');
  return out[0].json;
}

// Convenience: wrap raw model text in the Anthropic response shape.
const runText = (text) => runWith({ content: [{ text }] });

test('clean JSON is parsed and mapped', () => {
  const out = runText(JSON.stringify({
    score: 'hot',
    score_number: 88,
    summary: 'Strong buyer',
    reasons: ['budget', 'timeline'],
    suggested_action: 'Call now',
    followup_message: 'Hi there',
  }));
  assert.equal(out.parse_ok, true);
  assert.equal(out.score, 'hot');
  assert.equal(out.score_number, 88);
  assert.equal(out.summary, 'Strong buyer');
  assert.deepEqual(out.reasons, ['budget', 'timeline']);
  assert.equal(out.suggested_action, 'Call now');
  assert.equal(out.followup_message, 'Hi there');
});

test('```json fenced output is stripped and parsed', () => {
  const body = JSON.stringify({ score: 'warm', score_number: 55, summary: 's' });
  const out = runText('```json\n' + body + '\n```');
  assert.equal(out.parse_ok, true);
  assert.equal(out.score, 'warm');
  assert.equal(out.score_number, 55);
});

test('prose-wrapped JSON falls back to the first {...} block', () => {
  const out = runText('Sure! Here is the result:\n' +
    '{"score":"cold","score_number":20,"summary":"just browsing"}\nHope that helps.');
  assert.equal(out.parse_ok, true);
  assert.equal(out.score, 'cold');
  assert.equal(out.score_number, 20);
});

test('non-JSON output → warm fallback, flagged for manual review', () => {
  const out = runText('The model declined and wrote a plain sentence.');
  assert.equal(out.parse_ok, false);
  assert.equal(out.score, 'warm');
  assert.equal(out.score_number, 50);
  assert.match(out.summary, /Could not parse/i);
  assert.equal(out.followup_message, '');
  assert.ok('raw_text' in out, 'fallback should preserve raw model text');
});

test('empty / missing content → warm fallback', () => {
  const out = runWith({}); // no content array at all
  assert.equal(out.parse_ok, false);
  assert.equal(out.score, 'warm');
  assert.equal(out.score_number, 50);
});

test('unknown score value is coerced to warm but still parse_ok', () => {
  const out = runText(JSON.stringify({ score: 'blazing', score_number: 99, summary: 's' }));
  assert.equal(out.parse_ok, true);
  assert.equal(out.score, 'warm');   // not in [hot, warm, cold] → warm
  assert.equal(out.score_number, 99); // numeric, preserved
});

test('non-numeric score_number and missing arrays default safely', () => {
  const out = runText(JSON.stringify({ score: 'hot', score_number: '85', summary: 's' }));
  assert.equal(out.parse_ok, true);
  assert.equal(out.score_number, 50); // string "85" is not a number → default
  assert.deepEqual(out.reasons, []);  // missing → []
  assert.equal(out.suggested_action, '');
  assert.equal(out.followup_message, '');
});
