// Debrief dashboard — vanilla SPA, no dependencies.
import { esc, money, tokens, dur, clock, day, dayShort, ago, modelSlot, slotVar, displayModel, shortTool } from './format.js';
import { stackedDays, hbars, hourStrip, bindTooltips } from './charts.js';

const app = document.getElementById('app');
const state = {
  window: localStorage.getItem('debrief.window') || 'auto',
  meta: null,
  pollTimer: null,
};

// ── theme ────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('debrief.theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('debrief.theme', next);
  render();
}

// ── data ─────────────────────────────────────────────────────
async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

// ── shared chrome ────────────────────────────────────────────
const GLYPH = {
  waiting: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="2.5" width="3" height="9" rx="1" fill="currentColor"/><rect x="8" y="2.5" width="3" height="9" rx="1" fill="currentColor"/></svg>',
  running: '<span class="pulse"></span>',
  clean: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  error: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  stalled: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2L12.5 11.5H1.5L7 2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><rect x="6.3" y="5.6" width="1.4" height="3" rx="0.7" fill="currentColor"/><rect x="6.3" y="9.4" width="1.4" height="1.4" rx="0.7" fill="currentColor"/></svg>',
};
const STATUS_LABEL = { waiting: 'needs you', running: 'running', clean: 'clean', error: 'ended in error', stalled: 'stalled' };

const WINDOWS = [
  ['auto', 'Overnight', 'since 18:00 yesterday'],
  ['24h', 'Last 24 hours', ''],
  ['3d', 'Last 3 days', ''],
  ['7d', 'Last week', ''],
  ['30d', 'Last 30 days', ''],
  ['all', 'All time', ''],
];
const windowLabel = (w) => (WINDOWS.find(([k]) => k === w) || WINDOWS[0])[1];

function masthead(current) {
  const demo = state.meta && state.meta.demo;
  return `
  <header class="masthead">
    <a class="wordmark" href="#/">
      <svg width="20" height="20" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12.5" fill="none" stroke="var(--accent)" stroke-width="3"/><circle cx="16" cy="16" r="4.5" fill="var(--accent)"/></svg>
      Debrief
    </a>
    ${demo ? '<span class="demo-flag">demo data</span>' : ''}
    <span class="masthead-spacer"></span>
    <nav class="nav">
      <a href="#/" ${current === 'home' ? 'aria-current="page"' : ''}>Debrief</a>
      <a href="#/trends" ${current === 'trends' ? 'aria-current="page"' : ''}>Trends</a>
    </nav>
    <button class="icon-btn" id="theme-btn" title="Switch theme" aria-label="Switch light/dark theme">
      ${document.documentElement.dataset.theme === 'light'
        ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/></svg>'}
    </button>
  </header>`;
}

function stampRow(sinceMs, untilMs, showPicker, labelOverride) {
  return `
  <div class="stamp-row">
    <span class="stamp">Reporting window <b>${esc(day(sinceMs))} ${clock(sinceMs)}</b> → <b>${esc(day(untilMs))} ${clock(untilMs)}</b></span>
    <span class="stamp-rule"></span>
    ${showPicker ? `
    <div class="window-picker">
      <button class="window-btn" id="window-btn" aria-haspopup="menu">${esc(labelOverride || windowLabel(state.window))}
        <svg width="9" height="6" viewBox="0 0 9 6" fill="none"><path d="M1 1.5L4.5 4.5L8 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      </button>
      <div class="window-menu" id="window-menu" hidden role="menu">
        ${WINDOWS.map(([k, label, hint]) => `<button role="menuitem" class="${k === state.window ? 'sel' : ''}" data-window="${k}">${label}${hint ? `<span class="k">${hint}</span>` : ''}</button>`).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

function footer() {
  const m = state.meta || {};
  const lic = m.license
    ? '<span title="Thank you for keeping Debrief alive">Founding license · thank you ♥</span>'
    : '<a href="https://debrief.sh" target="_blank" rel="noreferrer">Free preview · get a founding license — $29 once</a>';
  return `
  <footer class="foot">
    <span>◍ Debrief v${esc(m.version || '')}</span>
    <span title="${esc(m.dir || '')}">100% local — transcripts never leave this machine</span>
    <span class="spacer"></span>
    ${lic}
  </footer>`;
}

// Chrome events are delegated once so they survive re-renders (live polling
// replaces the DOM; per-node listeners would silently die).
let chromeWired = false;
function wireChrome() {
  if (chromeWired) return;
  chromeWired = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('#theme-btn')) return toggleTheme();
    const wb = e.target.closest('#window-btn');
    const wm = document.getElementById('window-menu');
    if (wb && wm) { wm.hidden = !wm.hidden; return; }
    const wi = e.target.closest('[data-window]');
    if (wi) {
      state.window = wi.dataset.window;
      localStorage.setItem('debrief.window', state.window);
      render();
      return;
    }
    if (wm && !wm.hidden) wm.hidden = true;
  });
}

// ── home: the debrief ────────────────────────────────────────
function stripHTML(s) {
  const when = s.status === 'running'
    ? `started ${clock(s.startMs)} · ${ago(s.mtimeMs)}`
    : `${clock(s.startMs)}–${clock(s.endMs)} · ${ago(s.endMs)}`;
  const reason = attentionText(s);
  const facts = [];
  const created = (s.files || []).filter((f) => f.wrote).length;
  if (s.filesCount) facts.push(`<b>${s.filesCount}</b> file${s.filesCount === 1 ? '' : 's'}${created ? ` <i>(+${created} new)</i>` : ''}`);
  if (s.commands) facts.push(`<b>${s.commands}</b> cmd${s.commands === 1 ? '' : 's'}`);
  if (s.commits.length) facts.push(`<b>${s.commits.length}</b> commit${s.commits.length === 1 ? '' : 's'}`);
  if (s.tests.runs) facts.push(s.tests.failed ? `tests <b>${s.tests.failed}✗</b>/${s.tests.runs}` : `tests <b>✓×${s.tests.runs}</b>`);
  if (s.agents.length) facts.push(`<b>${s.agents.length}</b> agent${s.agents.length === 1 ? '' : 's'}`);
  if (s.artifacts) facts.push(`<b>${s.artifacts}</b> artifact${s.artifacts === 1 ? '' : 's'}`);
  if (s.errors) facts.push(`<b>${s.errors}</b> error${s.errors === 1 ? '' : 's'}`);
  facts.push(`<span class="money">${money(s.totalCostUSD)}</span>`);
  facts.push(`${dur(s.activeMs)} active`);

  return `
  <a class="strip" data-status="${s.status}" href="#/session/${encodeURIComponent(s.file)}">
    <span class="strip-spine" title="${STATUS_LABEL[s.status]}">${GLYPH[s.status] || ''}</span>
    <span class="strip-body">
      <span class="strip-top">
        <span class="strip-project">${esc(s.project)}</span>
        <span class="strip-title">${esc(s.title)}</span>
        <span class="strip-when">${when}</span>
      </span>
      ${reason ? `<span class="strip-reason">${reason}</span>` : ''}
      ${s.status === 'waiting' && (s.pendingQuestionText || s.lastText) ? `<span class="strip-last">“${esc(trimQuote(s.pendingQuestionText || s.lastText, 170))}”</span>` : ''}
      ${s.status === 'error' && s.lastError ? `<span class="strip-last">${esc(trimQuote(s.lastError, 170))}</span>` : ''}
      <span class="strip-facts">${facts.map((f) => `<span class="strip-fact">${f}</span>`).join('')}</span>
    </span>
  </a>`;
}

function trimQuote(t, n) {
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function attentionText(s) {
  if (s.status === 'waiting') {
    if (s.pendingQuestionText) return 'Waiting on your answer';
    if (s.lastError && /denied|doesn't want/i.test(s.lastError)) return 'A permission was denied';
    return 'Ended by asking you something';
  }
  if (s.status === 'stalled') return 'Stopped mid-action — interrupted or crashed';
  if (s.status === 'error') return 'Last action failed';
  return null;
}

function sectionHTML(title, list, emptyNote) {
  if (!list.length && !emptyNote) return '';
  return `
  <section class="section">
    <div class="section-head">
      <h2 class="section-title">${title}</h2>
      <span class="section-count">${list.length}</span>
    </div>
    ${list.length ? `<div class="strips">${list.map(stripHTML).join('')}</div>` : `<div class="empty">${emptyNote}</div>`}
  </section>`;
}

async function viewHome(opts = {}) {
  if (!opts.poll) {
    app.innerHTML = masthead('home') + `<div class="loading"><span class="pulse"></span>reading the recorders</div>`;
    wireChrome();
  }
  let o;
  try {
    o = await api(`/api/overview?since=${state.window}`);
  } catch (e) {
    app.innerHTML = masthead('home') + `<div class="empty" style="margin-top:40px"><h3>Couldn't read sessions</h3>${esc(e.message)}</div>`;
    wireChrome();
    return;
  }
  const t = o.totals;
  const models = t.byModel;
  const heroCost = t.costUSD;
  const noSessions = !o.sessions.length;

  const modelBits = models.slice(0, 4).map((m) =>
    `<b>${esc(m.display)}</b> ${money(m.costUSD)}`).join('<span class="sep">·</span>');

  const html = `
  ${masthead('home')}
  ${stampRow(o.sinceMs, o.untilMs, true)}
  ${noSessions ? `
    <section class="empty" style="margin-top:48px">
      <h3>No sessions in this window</h3>
      <p>Debrief reads Claude Code's local transcripts. Run some sessions — or widen the window above.</p>
      <p class="mono" style="margin-top:10px">try: claude "refactor something" &nbsp;→&nbsp; then come back</p>
    </section>` : `
  <section class="hero">
    <div class="hero-label">While you were away</div>
    <div class="hero-value">${money(heroCost)}<span class="unit">of agent work${t.costPartial ? '*' : ''}</span></div>
    <p class="hero-note">${t.sessions} session${t.sessions === 1 ? '' : 's'} · ${dur(t.activeMs)} of active agent time — <span class="why" title="What this usage would cost at Claude API list prices (input, output and cache tokens, per model). On a subscription, it's the value your plan delivered.">API-equivalent value</span>${t.costPartial ? ' · *some models unknown, actual value is higher' : ''}</p>
  </section>
  <div class="tape">
    <span><b>${t.files}</b> files touched</span><span class="sep">·</span>
    <span><b>${t.commits}</b> commit${t.commits === 1 ? '' : 's'}</span><span class="sep">·</span>
    <span><b>${t.commands}</b> commands</span><span class="sep">·</span>
    ${t.tests.runs ? `<span>tests <b>${t.tests.runs - t.tests.failed}✓${t.tests.failed ? ' ' + t.tests.failed + '✗' : ''}</b></span><span class="sep">·</span>` : ''}
    ${t.subagents ? `<span><b>${t.subagents}</b> subagents</span><span class="sep">·</span>` : ''}
    <span><b>${tokens(t.tokens.output)}</b> tokens written</span><span class="sep">·</span>
    <span><b>${tokens(t.tokens.cacheRead)}</b> cache-read</span>
    ${modelBits ? `<span class="sep">·</span><span>${modelBits}</span>` : ''}
  </div>
  ${sectionHTML('Needs you', o.needsYou, '')}
  ${sectionHTML('Still running', o.running, '')}
  ${sectionHTML('Finished', o.finished, 'Nothing finished in this window.')}
  `}
  ${footer()}`;

  // Skip the re-render when nothing user-visible changed (live polling).
  const fingerprint = JSON.stringify([o.totals.costUSD, o.totals.commits, o.totals.files,
    o.sessions.map((s) => [s.id, s.status, s.filesCount, s.commands, Math.round((s.totalCostUSD || 0) * 100)])]);
  if (state.homeFingerprint !== fingerprint || !opts.poll) {
    state.homeFingerprint = fingerprint;
    app.innerHTML = html;
    wireChrome();
  }

  // Live: refresh while any session is running.
  clearTimeout(state.pollTimer);
  if (o.running.length) {
    state.pollTimer = setTimeout(() => {
      if (location.hash === '' || location.hash === '#/') viewHome({ poll: true });
    }, 30000);
  }
}

// ── session: the flight recorder ─────────────────────────────
const KIND_LABEL = {
  prompt: 'you', command: 'cmd', text: 'claude', thinking: 'thinking',
  tool: '', compact: 'compact', system: 'system',
};
const PAGE_SIZE = 350;

function eventHTML(ev) {
  const kindLabel = ev.kind === 'tool' ? esc(shortTool(ev.name)) : (KIND_LABEL[ev.kind] ?? ev.kind);
  const time = ev.t ? clock(Date.parse(ev.t)) : '';
  let body = '';
  if (ev.kind === 'prompt' || ev.kind === 'command') {
    body = `<div class="t-prompt-block">${esc(ev.detail && ev.detail.text || ev.summary)}</div>`;
  } else if (ev.kind === 'text') {
    body = `<div class="t-text-block">${esc(ev.detail && ev.detail.text || ev.summary)}</div>`;
  } else {
    const rs = ev.resultSummary ? `<div class="t-result ${ev.isError ? 'err' : ''}">${ev.isError ? '✗ ' : '→ '}${esc(ev.resultSummary)}</div>` : '';
    const payload = payloadHTML(ev);
    body = `<div class="t-line"><span class="t-kind">${kindLabel}</span><span class="t-summary">${esc(ev.summary || '')}</span></div>${rs}${payload}`;
  }
  if (ev.kind === 'prompt' || ev.kind === 'command' || ev.kind === 'text') {
    body = `<div class="t-line"><span class="t-kind">${kindLabel}</span></div>` + body;
  }
  return `
  <div class="t-event" data-kind="${ev.kind}" ${ev.isError ? 'data-err="1"' : ''} id="ev-${ev.i}">
    <span class="t-time">${time}</span>
    <span class="t-node"><span class="dot"></span></span>
    <div class="t-body">${body}</div>
  </div>`;
}

function payloadHTML(ev) {
  const d = ev.detail;
  if (!d) return '';
  const parts = [];
  if (d.command) parts.push(`<span>$ ${esc(d.command)}</span>`);
  if (d.stdout) parts.push(`<span>${esc(d.stdout)}</span>`);
  if (d.stderr) parts.push(`<span class="del">${esc(d.stderr)}</span>`);
  if (d.diff) parts.push(diffHTML(d.diff));
  if (d.prompt) parts.push(`<span>${esc(d.prompt)}</span>`);
  if (d.questions) parts.push(...d.questions.map((q) => `<span>? ${esc(q.question)}${q.options.length ? '  [' + esc(q.options.join(' / ')) + ']' : ''}</span>`));
  if (d.answers) parts.push(...d.answers.map((a) => `<span>→ ${esc(a)}</span>`));
  if (!parts.length) return '';
  return `<button class="t-expand" data-expand>show detail</button><div class="t-payload" hidden>${parts.join('\n')}</div>`;
}

function diffHTML(diff) {
  return diff.split('\n').map((l) => {
    if (l.startsWith('@@')) return `<span class="hunk">${esc(l)}</span>`;
    if (l.startsWith('+')) return `<span class="add">${esc(l)}</span>`;
    if (l.startsWith('-')) return `<span class="del">${esc(l)}</span>`;
    return `<span>${esc(l)}</span>`;
  }).join('');
}

async function viewSession(fileEnc) {
  const file = decodeURIComponent(fileEnc);
  app.innerHTML = masthead('') + `<div class="loading"><span class="pulse"></span>replaying the recorder</div>`;
  wireChrome();
  let d;
  try {
    d = await api(`/api/session?file=${encodeURIComponent(file)}`);
  } catch (e) {
    app.innerHTML = masthead('') + `<div class="empty" style="margin-top:40px"><h3>Couldn't open this session</h3>${esc(e.message)}</div>`;
    wireChrome();
    return;
  }
  const s = d.summary;
  const status = s ? s.status : 'clean';
  const title = (s && s.title) || d.title || '(session)';
  const project = s ? s.project : '';
  const startMs = s && s.startMs;
  const endMs = s && s.endMs;

  const filters = [
    ['all', 'All'], ['act', 'Actions'], ['talk', 'Conversation'], ['err', `Errors${d.errorIndexes.length ? ' ' + d.errorIndexes.length : ''}`],
  ];

  const railModels = s ? s.models.filter((m) => m.model !== '<synthetic>') : [];
  const totalModelCost = railModels.reduce((a, m) => a + (m.costUSD || 0), 0) || 1;

  const html = `
  ${masthead('')}
  <div class="rec-head">
    <a class="crumb" href="#/">← Debrief</a>
    <div class="rec-title-row">
      <span class="strip-project">${esc(project)}${d.isAgent ? ' · subagent' : ''}</span>
      <h1 class="rec-title">${esc(title)}</h1>
      <span class="rec-status" data-status="${status}">${GLYPH[status] || ''} ${STATUS_LABEL[status]}</span>
    </div>
    <div class="rec-meta">
      ${startMs ? `<span><b>${esc(day(startMs))}</b> ${clock(startMs)} → ${status === 'running' ? 'now' : clock(endMs)}</span>` : ''}
      ${s ? `<span><b>${dur(s.activeMs)}</b> active</span>` : ''}
      <span><b>${money(s ? s.totalCostUSD : d.totalCost)}</b> API-equivalent</span>
      <span><b>${tokens(d.tokens.output)}</b> tokens written</span>
      ${s && s.gitBranch ? `<span>branch <b>${esc(s.gitBranch)}</b></span>` : ''}
      <span>${d.count.toLocaleString()} events</span>
    </div>
  </div>
  <div class="rec-layout">
    <div class="timeline">
      <div class="t-toolbar" role="toolbar" aria-label="Filter timeline">
        ${filters.map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${k === 'all'}">${l}</button>`).join('')}
        ${d.errorIndexes.length ? `<button class="chip danger" data-jump-err>↓ first error</button>` : ''}
      </div>
      <div id="events"></div>
      <div class="t-more" id="more-wrap" hidden><button class="chip" id="more-btn">show earlier events</button></div>
    </div>
    <aside class="rail">
      ${s && s.files.length ? `
      <div class="rail-card">
        <div class="rail-title">Files touched · ${s.filesCount}</div>
        ${s.files.slice(0, 10).map((f) => `<div class="rail-row"><span class="k mono" title="${esc(f.path)}">${esc(shortFile(f.path))}</span><span class="v dim">${f.edits}×</span></div>`).join('')}
        ${s.filesCount > 10 ? `<div class="rail-row"><span class="k">…and ${s.filesCount - 10} more</span></div>` : ''}
      </div>` : ''}
      ${s && s.commits.length ? `
      <div class="rail-card">
        <div class="rail-title">Commits</div>
        ${s.commits.map((c) => `<div class="rail-row"><span class="k" title="${esc(c.message)}">${esc(c.message)}</span><span class="v mono dim">${esc(c.hash)}</span></div>`).join('')}
      </div>` : ''}
      ${railModels.length ? `
      <div class="rail-card">
        <div class="rail-title">Models</div>
        ${railModels.map((m) => `<div class="rail-row"><span class="k"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${slotVar(modelSlot(m.model))};margin-right:7px"></i>${esc(m.display || displayModel(m.model))}</span><span class="v">${money(m.costUSD)}</span></div>`).join('')}
        <div class="meter">${railModels.map((m) => `<i style="width:${(100 * (m.costUSD || 0) / totalModelCost).toFixed(1)}%;background:${slotVar(modelSlot(m.model))}"></i>`).join('')}</div>
      </div>` : ''}
      ${s && s.agents.length ? `
      <div class="rail-card">
        <div class="rail-title">Subagents · ${s.agents.length}</div>
        ${s.agents.slice(0, 8).map((a) => `<div class="rail-row"><a class="k" href="#/session/${encodeURIComponent(a.file)}" title="${esc(a.task)}">${esc(trimQuote(a.task, 40))}</a><span class="v dim">${money(a.costUSD)}</span></div>`).join('')}
        ${s.agents.length > 8 ? `<div class="rail-row"><span class="k">…and ${s.agents.length - 8} more</span></div>` : ''}
      </div>` : ''}
      ${s ? `
      <div class="rail-card">
        <div class="rail-title">Counters</div>
        <div class="rail-row"><span class="k">Your prompts</span><span class="v">${s.prompts}</span></div>
        <div class="rail-row"><span class="k">Claude replies</span><span class="v">${s.assistantMsgs}</span></div>
        <div class="rail-row"><span class="k">Tool calls</span><span class="v">${Object.values(s.tools).reduce((a, b) => a + b, 0)}</span></div>
        <div class="rail-row"><span class="k">Cache-read tokens</span><span class="v">${tokens(d.tokens.cacheRead)}</span></div>
        ${s.compactions ? `<div class="rail-row"><span class="k">Compactions</span><span class="v">${s.compactions}</span></div>` : ''}
        ${s.interrupts ? `<div class="rail-row"><span class="k">Interrupts</span><span class="v">${s.interrupts}</span></div>` : ''}
      </div>` : ''}
    </aside>
  </div>
  ${footer()}`;

  app.innerHTML = html;
  wireChrome();

  // Timeline rendering with filter + tail-first pagination (latest matters most).
  const eventsEl = document.getElementById('events');
  const moreWrap = document.getElementById('more-wrap');
  const moreBtn = document.getElementById('more-btn');
  let filter = 'all';
  let shown = PAGE_SIZE;

  const match = (ev) => {
    if (filter === 'act') return ev.kind === 'tool' || ev.kind === 'command';
    if (filter === 'talk') return ev.kind === 'prompt' || ev.kind === 'text' || ev.kind === 'thinking';
    if (filter === 'err') return !!ev.isError;
    return true;
  };

  function renderEvents() {
    const all = d.events.filter(match);
    const slice = all.slice(Math.max(0, all.length - shown));
    eventsEl.innerHTML = slice.length
      ? slice.map(eventHTML).join('')
      : '<div class="empty">Nothing matches this filter.</div>';
    moreWrap.hidden = all.length <= shown;
    if (moreBtn) moreBtn.textContent = `show earlier events (${all.length - Math.min(shown, all.length)} more)`;
    eventsEl.querySelectorAll('[data-expand]').forEach((b) => b.addEventListener('click', () => {
      const p = b.nextElementSibling;
      p.hidden = !p.hidden;
      b.textContent = p.hidden ? 'show detail' : 'hide detail';
    }));
  }
  renderEvents();

  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    shown = PAGE_SIZE;
    document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderEvents();
    window.scrollTo({ top: 0 });
  }));
  if (moreBtn) moreBtn.addEventListener('click', () => { shown += PAGE_SIZE; renderEvents(); });
  const jumpBtn = document.querySelector('[data-jump-err]');
  if (jumpBtn) jumpBtn.addEventListener('click', () => {
    filter = 'err'; shown = 100000;
    document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.filter === 'err')));
    renderEvents();
    window.scrollTo({ top: 0 });
  });
}

function shortFile(p) {
  const parts = String(p).split('/');
  return parts.length > 3 ? '…/' + parts.slice(-2).join('/') : p;
}

// ── trends ───────────────────────────────────────────────────
const trendWindowLabel = () => state.window === 'auto' ? 'Last 30 days' : windowLabel(state.window);

async function viewTrends() {
  app.innerHTML = masthead('trends') + `<div class="loading"><span class="pulse"></span>computing trends</div>`;
  wireChrome();
  const win = state.window === 'auto' ? '30d' : state.window; // trends default to a month
  let tr;
  try {
    tr = await api(`/api/trends?since=${win}`);
  } catch (e) {
    app.innerHTML = masthead('trends') + `<div class="empty" style="margin-top:40px">${esc(e.message)}</div>`;
    wireChrome();
    return;
  }

  // model series present in the window, fixed slot colors
  const modelKeys = [...new Set(tr.days.flatMap((d) => Object.keys(d.byModel)))];
  const series = modelKeys.map((k) => ({ key: k, label: k, color: cssColor(slotVar(modelSlot(k))) })).slice(0, 6);
  const rows = tr.days.map((d) => ({ dayMs: d.dayMs, values: d.byModel }));
  const totalCost = tr.days.reduce((a, d) => a + d.costUSD, 0);

  const html = `
  ${masthead('trends')}
  ${stampRow(tr.sinceMs, tr.untilMs, true, trendWindowLabel())}
  <section class="hero">
    <div class="hero-label">Agent work in this window</div>
    <div class="hero-value">${money(totalCost)}<span class="unit">API-equivalent</span></div>
  </section>
  <div class="charts">
    <div class="chart-card wide">
      <div class="chart-title">Daily value by model</div>
      <div class="chart-sub">What each day's usage would cost at API list prices</div>
      <div class="chart-box">${stackedDays(rows, series)}</div>
      ${series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="chart-card">
      <div class="chart-title">Tool mix</div>
      <div class="chart-sub">Calls by tool</div>
      <div class="chart-box">${hbars(tr.toolMix.slice(0, 9).map((t) => ({ label: shortTool(t.name), value: t.count })), { fmt: (v) => v.toLocaleString(), color: 'var(--s1)' })}</div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Projects</div>
      <div class="chart-sub">API-equivalent value per project</div>
      <div class="chart-box">${hbars(tr.projects.slice(0, 9).map((p) => ({ label: p.project, value: p.costUSD, tip: `<div class="tt-head">${esc(p.project)}</div><div class="row">value<span class="v">${money(p.costUSD)}</span></div><div class="row">sessions<span class="v">${p.sessions}</span></div><div class="row">active<span class="v">${dur(p.activeMs)}</span></div>` })), { fmt: money, color: 'var(--s3)' })}</div>
    </div>
    <div class="chart-card wide">
      <div class="chart-title">When your agents work</div>
      <div class="chart-sub">Active time by hour of day — darker is busier</div>
      <div class="chart-box">${hourStrip(tr.hourHist)}</div>
    </div>
  </div>
  ${footer()}`;
  app.innerHTML = html;
  wireChrome();
  bindTooltips(app);
}

// SVG fills can't use var() through data-tip swatches reliably in all cases; resolve once.
function cssColor(v) {
  if (!v.startsWith('var(')) return v;
  const name = v.slice(4, -1);
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || v;
}

// ── router ───────────────────────────────────────────────────
async function render() {
  if (!state.meta) {
    try { state.meta = await api('/api/meta'); } catch { state.meta = {}; }
  }
  clearTimeout(state.pollTimer);
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/session\/(.+)$/);
  if (m) return viewSession(m[1]);
  if (hash === '#/trends') return viewTrends();
  return viewHome();
}

addEventListener('hashchange', render);
render();
