'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { generateDemo } = require('../src/demo');
const { scan, applyLiveness } = require('../src/scan');
const { indexFile } = require('../src/parse/indexer');
const { sessionDetail } = require('../src/parse/detail');
const { buildReport, renderMarkdown } = require('../src/report');
const { costUSD, resolveModel, displayModel } = require('../src/pricing');
const { stripHarnessMarkup, classifyCommand, parseCommit } = require('../src/parse/lines');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'debrief-test-'));
const DEMO = generateDemo(path.join(TMP, 'projects'));

function demoScan() {
  return scan(DEMO, { noCache: true });
}

test('scan indexes every demo session with subagents attached', async () => {
  const { sessions } = await demoScan();
  assert.equal(sessions.length, 19); // 5 overnight + 14 history
  const dark = sessions.find((s) => s.title.includes('dark mode'));
  assert.ok(dark, 'dark mode session found');
  assert.equal(dark.agents.length, 2);
  assert.equal(dark.commits.length, 2);
  assert.equal(dark.tests.runs, 2);
  assert.equal(dark.tests.failed, 0);
  assert.ok(dark.filesCount >= 13, `files ${dark.filesCount}`);
  assert.ok(dark.totalCostUSD > dark.costUSD, 'subagent cost rolls up');
});

test('statuses: waiting, error, running, clean all derived', async () => {
  const { sessions } = await demoScan();
  applyLiveness(sessions);
  const by = (t) => sessions.find((s) => s.title.includes(t));
  assert.equal(by('usage-based pricing').status, 'waiting');
  assert.equal(by('flaky checkout').status, 'error');
  assert.equal(by('notification service').status, 'running');
  assert.equal(by('launch blog').status, 'clean');
});

test('waiting session carries the pending question text', async () => {
  const { sessions } = await demoScan();
  const s = sessions.find((x) => x.title.includes('usage-based pricing'));
  assert.match(s.pendingQuestionText, /grandfathered/i);
});

test('usage dedupes by message.id across repeated lines', async () => {
  // One API message striped across 3 lines (thinking + tool_use + text) must
  // count its usage exactly once.
  const f = path.join(TMP, 'dedupe.jsonl');
  const usage = { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 };
  const mk = (content) => JSON.stringify({
    type: 'assistant', timestamp: new Date().toISOString(),
    message: { id: 'msg_same', model: 'claude-opus-5', role: 'assistant', content: [content], usage },
  });
  fs.writeFileSync(f, [
    mk({ type: 'thinking', thinking: 'hm' }),
    mk({ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }),
    mk({ type: 'text', text: 'done' }),
  ].join('\n'));
  const s = await indexFile(f);
  assert.equal(s.assistantMsgs, 1);
  assert.equal(s.tokens.output, 100);
  assert.equal(s.tokens.cacheRead, 1000);
});

test('malformed lines are counted, not fatal', async () => {
  const f = path.join(TMP, 'bad.jsonl');
  fs.writeFileSync(f, '{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-01-01T00:00:00Z"}\nNOT JSON AT ALL\n{"broken\n');
  const s = await indexFile(f);
  assert.equal(s.prompts, 1);
  assert.equal(s.badLines, 2);
});

test('empty and missing files do not crash the scanner', async () => {
  const dir = path.join(TMP, 'empty-projects', '-Users-x-proj');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'e1.jsonl'), '');
  const { sessions } = await scan(path.join(TMP, 'empty-projects'), { noCache: true });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].prompts, 0);
});

test('detail timeline pairs tool results and finds errors', async () => {
  const { sessions } = await demoScan();
  const flaky = sessions.find((s) => s.title.includes('flaky'));
  const d = await sessionDetail(path.join(DEMO, flaky.file));
  assert.ok(d.count > 5);
  assert.ok(d.errorIndexes.length >= 1);
  const bash = d.events.find((e) => e.name === 'Bash' && e.detail && e.detail.stdout);
  assert.ok(bash, 'bash event carries stdout');
  const err = d.events[d.errorIndexes[0]];
  assert.equal(err.isError, true);
});

test('detail renders edit diffs from structuredPatch', async () => {
  const { sessions } = await demoScan();
  const dark = sessions.find((s) => s.title.includes('dark mode'));
  const d = await sessionDetail(path.join(DEMO, dark.file));
  const edit = d.events.find((e) => e.name === 'Edit' && e.detail && e.detail.diff);
  assert.ok(edit);
  assert.match(edit.detail.diff, /^@@/m);
  assert.match(edit.detail.diff, /\+.*surface-0/);
});

test('report buckets and markdown render', async () => {
  const { sessions } = await demoScan();
  applyLiveness(sessions);
  const r = buildReport(sessions, Date.now() - 12 * 3600e3, Date.now());
  assert.equal(r.needsYou.length, 1);
  assert.equal(r.running.length, 1);
  assert.ok(r.totals.commits >= 2);
  const md = renderMarkdown(r);
  assert.match(md, /# Debrief/);
  assert.match(md, /Needs you \(1\)/);
  assert.match(md, /API-equivalent/);
});

test('pricing: cache TTL split, fast mode, unknown models', () => {
  const t = (over) => ({ input: 1e6, output: 1e6, cacheW5m: 0, cacheW1h: 0, cacheW: 0, cacheRead: 0, ...over });
  assert.equal(costUSD('claude-opus-5', t({})), 30); // $5 + $25
  assert.equal(costUSD('claude-opus-5', t({ input: 0, cacheW1h: 1e6, output: 0 })), 10);
  assert.equal(costUSD('claude-opus-5', t({}), 'fast'), 60); // $10 + $50
  assert.equal(costUSD('claude-sonnet-5', t({})), 12); // $2 + $10
  assert.equal(costUSD('totally-unknown-model', t({})), null);
  assert.equal(resolveModel('claude-opus-4-5-20251101'), 'claude-opus-4-5');
  assert.equal(displayModel('claude-opus-4-8'), 'Opus 4.8');
});

test('harness markup stripping', () => {
  assert.equal(stripHarnessMarkup('<system-reminder>noise</system-reminder>'), '');
  assert.equal(stripHarnessMarkup('<task-notification>done</task-notification>'), '');
  assert.match(stripHarnessMarkup('<command-name>/effort</command-name><command-args>max</command-args>'), /^\/effort max/);
  assert.equal(stripHarnessMarkup('real prompt'), 'real prompt');
});

test('command classification and commit parsing', () => {
  assert.equal(classifyCommand('git add -A && git commit -m "x"'), 'commit');
  assert.equal(classifyCommand('npx vitest run src'), 'test');
  assert.equal(classifyCommand('git push origin main'), 'push');
  assert.equal(classifyCommand('ls -la'), 'other');
  const c = parseCommit('[feat/x 4f2a91c] feat: something\n 3 files changed');
  assert.deepEqual(c, { branch: 'feat/x', hash: '4f2a91c', message: 'feat: something' });
});

test('report window filtering excludes out-of-window sessions', async () => {
  const { sessions } = await demoScan();
  applyLiveness(sessions);
  const r = buildReport(sessions, Date.now() - 1000, Date.now()); // 1s window
  assert.equal(r.finished.length, 0);
});
