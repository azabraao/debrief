'use strict';
// Generates a believable overnight of synthetic Claude Code transcripts for
// `debrief --demo`: a small startup ("Lumen") whose agent fleet worked while
// its founder slept. Same on-disk format as real sessions, so it exercises the
// entire parser and doubles as a test fixture. No real data anywhere.
const fs = require('fs');
const path = require('path');
const os = require('os');

let seq = 0;
const id = (p) => `${p}_demo_${String(++seq).padStart(4, '0')}`;

function writer(file) {
  const lines = [];
  return {
    push: (obj) => lines.push(JSON.stringify(obj)),
    save: (mtimeMs) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, lines.join('\n') + '\n');
      if (mtimeMs) fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
    },
  };
}

// Builds one session's line stream with a tiny DSL.
function session({ file, sessionId, cwd, branch, title, startMs }) {
  const w = writer(file);
  let t = startMs;
  const iso = () => new Date(t).toISOString();
  const base = () => ({ sessionId, cwd, gitBranch: branch, version: '2.1.230', userType: 'external', entrypoint: 'cli', isSidechain: false, uuid: id('u'), timestamp: iso() });

  const api = {
    tick: (ms) => { t += ms; return api; },
    title: (s) => { w.push({ type: 'ai-title', aiTitle: s, sessionId }); return api; },
    prompt: (text) => { w.push({ ...base(), type: 'user', message: { role: 'user', content: text } }); return api; },
    turnDur: (ms) => { w.push({ ...base(), type: 'system', subtype: 'turn_duration', durationMs: ms, isMeta: true }); return api; },
    // assistant message: opts {model, out, cr, cw, text, think, tools:[{name, input, result, isError, tur}], speed}
    reply: (o) => {
      const msgId = id('msg');
      const usage = {
        input_tokens: 3 + (seq % 9), output_tokens: o.out || 300,
        cache_read_input_tokens: o.cr != null ? o.cr : 220000 + (seq * 4831) % 420000,
        cache_creation_input_tokens: 0,
        cache_creation: { ephemeral_5m_input_tokens: o.cw != null ? o.cw : 9000 + (seq * 2113) % 26000, ephemeral_1h_input_tokens: 0 },
        service_tier: 'standard', speed: o.speed || 'standard',
      };
      const mk = (content, stop) => w.push({
        ...base(), type: 'assistant', requestId: id('req'),
        message: { id: msgId, type: 'message', role: 'assistant', model: o.model, content: [content], stop_reason: stop, usage },
      });
      if (o.think) mk({ type: 'thinking', thinking: o.think, signature: 'demo' }, null);
      const tools = o.tools || [];
      tools.forEach((tool) => {
        tool.id = id('toolu');
        mk({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input, caller: { type: 'direct' } }, 'tool_use');
      });
      if (o.text) mk({ type: 'text', text: o.text }, tools.length ? 'tool_use' : 'end_turn');
      // results
      tools.forEach((tool) => {
        if (tool.noResult) return;
        t += tool.ms || 1500;
        w.push({
          ...base(), type: 'user',
          message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: tool.result || '', ...(tool.isError ? { is_error: true } : {}) }] },
          toolUseResult: tool.tur !== undefined ? tool.tur : (tool.name === 'Bash' ? { stdout: tool.result || '', stderr: '', interrupted: false, isImage: false } : undefined),
        });
      });
      return api;
    },
    save: (mtimeMs) => w.save(mtimeMs || t),
    now: () => t,
  };
  return api;
}

const bash = (desc, command, result, extra) => ({ name: 'Bash', input: { command, description: desc }, result, ...extra });
const edit = (file, oldS, newS, patch) => ({
  name: 'Edit', input: { file_path: file, old_string: oldS, new_string: newS },
  result: 'Edited', tur: { filePath: file, oldString: oldS, newString: newS, structuredPatch: patch, userModified: false },
});
const write = (file, content) => ({
  name: 'Write', input: { file_path: file, content },
  result: 'Created', tur: { type: 'create', filePath: file, content, structuredPatch: [] },
});
const read = (file) => ({ name: 'Read', input: { file_path: file }, result: 'ok', tur: { type: 'text', file: { filePath: file } } });

function generateDemo(baseDir) {
  seq = 0;
  const root = baseDir || path.join(os.tmpdir(), 'debrief-demo', 'projects');
  fs.rmSync(root, { recursive: true, force: true });
  const now = Date.now();
  // Virtual overnight: the fleet always worked the ~5.5 hours ending ~now, so
  // the whole story fits the "overnight" window at any viewing hour.
  // night(22,4) = "22:04 last night" mapped proportionally onto [now-5.5h, now].
  const SPAN = 5.5 * 3600e3;
  const night = (h, m) => {
    const offsetMin = (h >= 12 ? h - 22 : h + 2) * 60 + m;
    return now - SPAN + offsetMin * 60e3 * (5.5 / 9);
  };

  const app = '-Users-alex-code-lumen-app';
  const api = '-Users-alex-code-lumen-api';
  const site = '-Users-alex-code-lumen-site';

  // ── 1. Dark mode ship — clean, commits, tests, subagents ──────────────────
  {
    const sid = 'a1d2c3b4-0001-4000-9000-demo00000001';
    const s = session({
      file: path.join(root, app, sid + '.jsonl'), sessionId: sid,
      cwd: '/Users/alex/code/lumen-app', branch: 'feat/dark-mode', title: '', startMs: night(22, 4),
    });
    s.title('Ship dark mode across the dashboard');
    s.prompt('Ship dark mode across the whole dashboard tonight. Follow the design tokens in theme.css, make sure every view works in both themes, run the full test suite, and commit as you go. I want to review a finished feature in the morning.');
    s.tick(2 * 60000).reply({
      model: 'claude-opus-4-8', out: 1200,
      think: 'The theme tokens already exist in theme.css. Plan: audit hardcoded colors, convert view by view, snapshot both themes, keep tests green.',
      text: 'Starting with an audit of hardcoded colors, then converting each view to tokens. I\'ll keep the suite green and commit per view.',
      tools: [
        bash('Find hardcoded hex colors in views', "grep -rn '#[0-9a-fA-F]\\{6\\}' src/views --include='*.tsx' | head -40",
          'src/views/Overview.tsx:41: background: "#ffffff"\nsrc/views/Overview.tsx:88: color: "#1a1a2e"\nsrc/views/Billing.tsx:12: border: "1px solid #e2e8f0"\nsrc/views/Settings.tsx:73: background: "#f8fafc"\n… 22 more'),
        read('/Users/alex/code/lumen-app/src/styles/theme.css'),
      ],
    });
    s.turnDur(212000);
    const views = ['Overview', 'Billing', 'Settings', 'Members', 'Usage', 'Alerts'];
    views.forEach((v, i) => {
      s.tick(14 * 60000).reply({
        model: 'claude-opus-4-8', out: 2600 + i * 180,
        tools: [
          edit(`/Users/alex/code/lumen-app/src/views/${v}.tsx`,
            `background: "#ffffff"`, 'background: "var(--surface-0)"',
            [{ oldStart: 41, newStart: 41, lines: [' const styles = {', '-  background: "#ffffff",', '+  background: "var(--surface-0)",', '-  color: "#1a1a2e",', '+  color: "var(--text-primary)",', ' };'] }]),
          edit(`/Users/alex/code/lumen-app/src/views/${v}.module.css`,
            '#e2e8f0', 'var(--border-subtle)',
            [{ oldStart: 12, newStart: 12, lines: [' .card {', '-  border: 1px solid #e2e8f0;', '+  border: 1px solid var(--border-subtle);', ' }'] }]),
        ],
      });
      s.turnDur(180000 + i * 9000);
    });
    s.tick(9 * 60000).reply({
      model: 'claude-opus-4-8', out: 1400,
      text: 'All six views converted. Fanning out verification: one agent sweeps the test suite per theme while another updates the docs.',
      tools: [
        { name: 'Task', input: { description: 'Run themed test sweep', prompt: 'Run the full vitest suite with THEME=dark and THEME=light, report failures.', subagent_type: 'general-purpose' }, result: 'Both sweeps green: 214 passed / 0 failed in each theme.' },
        { name: 'Task', input: { description: 'Update theming docs', prompt: 'Update docs/theming.md for the new token usage.', subagent_type: 'general-purpose' }, result: 'docs/theming.md rewritten around the token API.' },
      ],
    });
    s.turnDur(420000);
    s.tick(8 * 60000).reply({
      model: 'claude-opus-4-8', out: 900,
      tools: [
        bash('Run full test suite', 'npx vitest run', 'Test Files  36 passed (36)\n     Tests  214 passed (214)\n  Duration  41.2s'),
        bash('Commit dark mode views', "git add -A && git commit -m 'feat: dark mode across all dashboard views'", "[feat/dark-mode 4f2a91c] feat: dark mode across all dashboard views\n 14 files changed, 312 insertions(+), 198 deletions(-)"),
      ],
    });
    s.turnDur(96000);
    s.tick(11 * 60000).reply({
      model: 'claude-opus-4-8', out: 1700,
      tools: [
        edit('/Users/alex/code/lumen-app/src/components/ThemeToggle.tsx', 'localStorage.theme', 'persistTheme(next)',
          [{ oldStart: 18, newStart: 18, lines: [' function toggle(next: Theme) {', '-  localStorage.theme = next;', '+  persistTheme(next);', '+  document.documentElement.dataset.theme = next;', ' }'] }]),
        bash('Re-run suite', 'npx vitest run', 'Test Files  36 passed (36)\n     Tests  216 passed (216)\n  Duration  40.8s'),
        bash('Commit toggle persistence', "git commit -am 'feat: persist theme choice, respect system preference'", "[feat/dark-mode 8c11d02] feat: persist theme choice, respect system preference\n 3 files changed, 41 insertions(+), 9 deletions(-)"),
      ],
      text: 'Dark mode is shipped: six views on tokens, toggle persists and follows system preference, 216 tests green, two commits on feat/dark-mode ready for your review.',
    });
    s.turnDur(150000);
    s.save(night(23, 52));

    // subagents for session 1
    const subDir = path.join(root, app, sid, 'subagents');
    const a1 = session({ file: path.join(subDir, 'agent-demo01.jsonl'), sessionId: sid, cwd: '/Users/alex/code/lumen-app', branch: 'feat/dark-mode', startMs: night(23, 12) });
    a1.prompt('Run the full vitest suite with THEME=dark and THEME=light, report failures.');
    a1.tick(3000).reply({
      model: 'claude-sonnet-5', out: 350,
      tools: [
        bash('Dark theme sweep', 'THEME=dark npx vitest run', 'Tests  214 passed (214)'),
        bash('Light theme sweep', 'THEME=light npx vitest run', 'Tests  214 passed (214)'),
      ],
      text: 'Both sweeps green: 214 passed / 0 failed in each theme.',
    });
    a1.save(night(23, 20));
    const a2 = session({ file: path.join(subDir, 'agent-demo02.jsonl'), sessionId: sid, cwd: '/Users/alex/code/lumen-app', branch: 'feat/dark-mode', startMs: night(23, 13) });
    a2.prompt('Update docs/theming.md for the new token usage.');
    a2.tick(2500).reply({
      model: 'claude-sonnet-5', out: 700,
      tools: [read('/Users/alex/code/lumen-app/docs/theming.md'), write('/Users/alex/code/lumen-app/docs/theming.md', '# Theming\n\nUse tokens…')],
      text: 'docs/theming.md rewritten around the token API.',
    });
    a2.save(night(23, 18));
  }

  // ── 2. Flaky e2e hunt — ends in error ─────────────────────────────────────
  {
    const sid = 'a1d2c3b4-0002-4000-9000-demo00000002';
    const s = session({
      file: path.join(root, app, sid + '.jsonl'), sessionId: sid,
      cwd: '/Users/alex/code/lumen-app', branch: 'fix/flaky-checkout', title: '', startMs: night(1, 10),
    });
    s.title('Hunt down the flaky checkout e2e test');
    s.prompt('The checkout e2e test fails roughly 1 in 5 runs on CI. Find the race and fix it.');
    s.tick(2 * 60000).reply({
      model: 'claude-sonnet-5', out: 1500,
      think: 'Flaky 1-in-5 suggests a timing race. Reproduce locally first with repeated runs.',
      tools: [bash('Run checkout e2e 10×', 'for i in $(seq 10); do npx playwright test checkout.spec.ts || echo FAIL_$i; done',
        '…\nFAIL_3\n…\nFAIL_8\n2 failures in 10 runs — TimeoutError: waiting for [data-testid=order-confirmed]')],
    });
    s.turnDur(380000);
    s.tick(19 * 60000).reply({
      model: 'claude-sonnet-5', out: 2100,
      tools: [
        read('/Users/alex/code/lumen-app/e2e/checkout.spec.ts'),
        edit('/Users/alex/code/lumen-app/e2e/checkout.spec.ts', 'await page.click("#pay")', 'await Promise.all([page.waitForResponse("**/api/orders"), page.click("#pay")])',
          [{ oldStart: 61, newStart: 61, lines: ['-  await page.click("#pay");', '+  await Promise.all([', '+    page.waitForResponse("**/api/orders"),', '+    page.click("#pay"),', '+  ]);'] }]),
      ],
    });
    s.turnDur(300000);
    s.tick(16 * 60000).reply({
      model: 'claude-sonnet-5', out: 1100,
      tools: [bash('Verify fix with 20 runs', 'for i in $(seq 20); do npx playwright test checkout.spec.ts || echo FAIL_$i; done',
        '…\nFAIL_14\nTimeoutError: waiting for [data-testid=order-confirmed]\n1 failure in 20 runs — better, still flaky', { isError: true })],
    });
    s.turnDur(700000);
    s.save(night(2, 5));
  }

  // ── 3. Billing migration — waiting on a decision ──────────────────────────
  {
    const sid = 'a1d2c3b4-0003-4000-9000-demo00000003';
    const s = session({
      file: path.join(root, api, sid + '.jsonl'), sessionId: sid,
      cwd: '/Users/alex/code/lumen-api', branch: 'feat/usage-billing', title: '', startMs: night(23, 30),
    });
    s.title('Migrate billing to usage-based pricing');
    s.prompt('Migrate our billing from flat seats to usage-based pricing (metered API calls). Stripe is already integrated. Plan it, build the metering, and prep the migration for existing customers.');
    s.tick(3 * 60000).reply({
      model: 'claude-fable-5', out: 3200,
      think: 'Metering pipeline, price objects, proration, grandfathering question for existing annual plans — that one is a business decision, not mine to make.',
      text: 'Metering pipeline and Stripe price objects are in place. Migration plan drafted for monthly plans; annual plans have a real tradeoff I need your call on.',
      tools: [
        write('/Users/alex/code/lumen-api/src/billing/metering.ts', 'export function recordUsage()…'),
        edit('/Users/alex/code/lumen-api/src/billing/stripe.ts', 'flat_seats', 'metered_usage',
          [{ oldStart: 33, newStart: 33, lines: ['-const PRICE = prices.flat_seats;', '+const PRICE = prices.metered_usage;'] }]),
        bash('Run billing tests', 'npx vitest run src/billing', 'Tests  48 passed (48)'),
      ],
    });
    s.turnDur(1500000);
    s.tick(52 * 60000).reply({
      model: 'claude-fable-5', out: 800,
      tools: [{
        name: 'AskUserQuestion',
        input: { questions: [{ question: 'Should existing annual plans be grandfathered at their current flat price until renewal?', options: [{ label: 'Grandfather until renewal' }, { label: 'Migrate everyone at once' }] }] },
        noResult: true,
      }],
    });
    s.save(night(0, 45));
  }

  // ── 4. Notification refactor — still running ──────────────────────────────
  {
    const sid = 'a1d2c3b4-0004-4000-9000-demo00000004';
    const s = session({
      file: path.join(root, api, sid + '.jsonl'), sessionId: sid,
      cwd: '/Users/alex/code/lumen-api', branch: 'refactor/notifications', title: '', startMs: now - 42 * 60000,
    });
    s.title('Refactor the notification service');
    s.prompt('Refactor the notification service to the outbox pattern so we stop dropping webhooks under load.');
    s.tick(6 * 60000).reply({
      model: 'claude-opus-4-8', out: 2400,
      tools: [
        read('/Users/alex/code/lumen-api/src/notifications/service.ts'),
        write('/Users/alex/code/lumen-api/src/notifications/outbox.ts', 'export class Outbox {…}'),
        edit('/Users/alex/code/lumen-api/src/notifications/service.ts', 'sendNow(event)', 'outbox.enqueue(event)',
          [{ oldStart: 90, newStart: 90, lines: ['-  await sendNow(event);', '+  await outbox.enqueue(event);'] }]),
      ],
    });
    s.turnDur(900000);
    s.tick(14 * 60000).reply({
      model: 'claude-opus-4-8', out: 500,
      tools: [bash('Run notification tests', 'npx vitest run src/notifications', 'RUNNING…', { noResult: true })],
    });
    s.save(now - 30000); // mtime 30s ago → shows as running
  }

  // ── 5. Launch blog post — small clean fable session ───────────────────────
  {
    const sid = 'a1d2c3b4-0005-4000-9000-demo00000005';
    const s = session({
      file: path.join(root, site, sid + '.jsonl'), sessionId: sid,
      cwd: '/Users/alex/code/lumen-site', branch: 'main', title: '', startMs: night(4, 20),
    });
    s.title('Draft the launch blog post');
    s.prompt('Draft the launch blog post for usage-based pricing. Voice: plain, confident, no hype. 600 words.');
    s.tick(4 * 60000).reply({
      model: 'claude-fable-5', out: 4200, cr: 180000,
      tools: [write('/Users/alex/code/lumen-site/content/blog/usage-based-pricing.md', '# Pay for what you use\n\n…')],
      text: 'Draft is in content/blog/usage-based-pricing.md — 590 words, plain and direct. It leads with the customer math, not the feature.',
    });
    s.turnDur(360000);
    s.save(night(4, 34));
  }

  // ── history: two weeks of prior days so Trends has a story ────────────────
  const HISTORY = [
    ['Wire up SSO with Okta', app, 'claude-opus-4-8', 3, 11, 2],
    ['Fix N+1 queries on the usage endpoint', api, 'claude-opus-4-8', 5, 6, 1],
    ['Prototype the AI onboarding checklist', app, 'claude-fable-5', 2, 9, 0],
    ['Upgrade to React 20', app, 'claude-sonnet-5', 9, 14, 3],
    ['Add rate limiting to public API', api, 'claude-opus-4-8', 4, 8, 1],
    ['Instrument checkout funnel analytics', app, 'claude-sonnet-5', 6, 7, 1],
    ['Rewrite pricing page copy', site, 'claude-fable-5', 1, 3, 1],
    ['Chase down webhook retry storm', api, 'claude-opus-4-8', 7, 12, 2],
    ['Add CSV export to usage reports', app, 'claude-sonnet-5', 3, 5, 1],
    ['Refactor feature flag service', api, 'claude-opus-4-8', 8, 10, 2],
    ['Design partner API pagination', api, 'claude-fable-5', 2, 6, 0],
    ['Kill dead code in legacy dashboard', app, 'claude-sonnet-5', 12, 4, 1],
    ['Harden webhook signature checks', api, 'claude-opus-4-8', 3, 7, 1],
    ['Ship email digest v2', app, 'claude-opus-4-8', 6, 9, 2],
  ];
  HISTORY.forEach(([title, proj, model, nFiles, nCmds, nCommits], i) => {
    const dayAgo = 1 + i; // one per day going back
    const sid = `a1d2c3b4-9${String(i).padStart(3, '0')}-4000-9000-demo0000hist`;
    const start = now - dayAgo * 86400e3 - (3 + (i * 7) % 9) * 3600e3;
    const s = session({
      file: path.join(root, proj, sid + '.jsonl'), sessionId: sid,
      cwd: '/Users/alex/code/lumen-' + proj.split('-').pop(), branch: 'main', title: '', startMs: start,
    });
    s.title(title);
    s.prompt(title + '.');
    for (let k = 0; k < nFiles; k++) {
      s.tick(9 * 60000).reply({
        model, out: 1500 + ((i * 331 + k * 97) % 2600),
        tools: [edit(`/Users/alex/code/x/src/mod${k}.ts`, 'old', 'new',
          [{ oldStart: 1, newStart: 1, lines: ['-old line', '+new line'] }])],
      });
      s.turnDur(6 * 60000);
    }
    for (let k = 0; k < nCommits; k++) {
      s.tick(5 * 60000).reply({
        model, out: 400,
        tools: [bash('Commit work', 'git commit -am "step"', `[main ${(1000000 + i * 7919 + k).toString(16)}] ${title.toLowerCase()} (part ${k + 1})\n 3 files changed`)],
      });
      s.turnDur(3 * 60000);
    }
    for (let k = 0; k < Math.max(0, nCmds - nCommits); k++) {
      s.tick(4 * 60000).reply({ model, out: 300, tools: [bash('Check', 'npm run lint', 'clean')] });
      s.turnDur(2 * 60000);
    }
    s.save(start + 3600e3);
  });

  return root;
}

module.exports = { generateDemo };
