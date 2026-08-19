'use strict';
// Aggregates session summaries into the Debrief: the "what happened while you
// were away" view. Consumed by both the dashboard and `debrief report` (CLI).
const { displayModel } = require('./pricing');

function emptyTokens() {
  return { input: 0, output: 0, cacheW5m: 0, cacheW1h: 0, cacheW: 0, cacheRead: 0 };
}

// One deterministic line describing what a session did. No LLM, no guessing.
function digest(s) {
  const bits = [];
  const created = s.files.filter((f) => f.wrote).length;
  if (s.filesCount) bits.push(`${s.filesCount} file${s.filesCount === 1 ? '' : 's'} edited${created ? ` (${created} new)` : ''}`);
  if (s.commands) bits.push(`${s.commands} command${s.commands === 1 ? '' : 's'}`);
  if (s.commits.length) bits.push(`${s.commits.length} commit${s.commits.length === 1 ? '' : 's'}`);
  if (s.pushes) bits.push(`pushed ×${s.pushes}`);
  if (s.tests.runs) bits.push(s.tests.failed ? `tests: ${s.tests.failed}/${s.tests.runs} failed` : `tests ✓×${s.tests.runs}`);
  if (s.agents.length) bits.push(`${s.agents.length} subagent${s.agents.length === 1 ? '' : 's'}`);
  if (s.artifacts) bits.push(`${s.artifacts} artifact${s.artifacts === 1 ? '' : 's'} published`);
  if (s.errors) bits.push(`${s.errors} error${s.errors === 1 ? '' : 's'}`);
  if (!bits.length) bits.push(s.prompts ? 'conversation only' : 'no activity');
  return bits.join(' · ');
}

// Why a session needs attention, as a short human sentence.
function attentionReason(s) {
  if (s.status === 'waiting') {
    if (s.questionsAsked && s.lastText && /\?/.test(s.lastText)) return 'Asked you a question';
    if (s.lastError && /denied|doesn't want/i.test(s.lastError)) return 'A permission was denied';
    return 'Ended by asking you something';
  }
  if (s.status === 'stalled') return 'Stopped mid-action (interrupted or crashed)';
  if (s.status === 'error') return 'Last action failed';
  return null;
}

function overlaps(s, sinceMs, untilMs) {
  const start = s.startMs != null ? s.startMs : s.endMs;
  const end = s.endMs != null ? s.endMs : s.startMs;
  if (start == null) return false;
  return end >= sinceMs && start <= untilMs;
}

function buildReport(sessions, sinceMs, untilMs) {
  const inWindow = sessions.filter((s) => overlaps(s, sinceMs, untilMs));
  const needsYou = inWindow.filter((s) => s.status === 'waiting' || s.status === 'stalled');
  const running = inWindow.filter((s) => s.status === 'running');
  const finished = inWindow.filter((s) => s.status === 'clean' || s.status === 'error');

  const totals = {
    sessions: inWindow.length,
    activeMs: 0,
    tokens: emptyTokens(),
    costUSD: 0,
    costPartial: false,
    files: 0,
    commits: 0,
    commands: 0,
    tests: { runs: 0, failed: 0 },
    errors: 0,
    artifacts: 0,
    subagents: 0,
    prompts: 0,
  };
  const fileSet = new Set();
  const byProject = new Map();
  const byModel = new Map();

  for (const s of inWindow) {
    totals.activeMs += s.activeMs;
    totals.commits += s.commits.length;
    totals.commands += s.commands;
    totals.tests.runs += s.tests.runs;
    totals.tests.failed += s.tests.failed;
    totals.errors += s.errors;
    totals.artifacts += s.artifacts;
    totals.subagents += s.agents.length;
    totals.prompts += s.prompts;
    totals.costUSD += s.totalCostUSD || 0;
    if (s.costPartial) totals.costPartial = true;
    for (const k of Object.keys(totals.tokens)) {
      totals.tokens[k] += (s.tokens[k] || 0) + ((s.agentTokens && s.agentTokens[k]) || 0);
    }
    for (const f of s.files) fileSet.add(s.projectSlug + ':' + f.path);

    const p = byProject.get(s.project) || { project: s.project, sessions: 0, costUSD: 0, files: 0, activeMs: 0, commits: 0 };
    p.sessions++; p.costUSD += s.totalCostUSD || 0; p.files += s.filesCount; p.activeMs += s.activeMs; p.commits += s.commits.length;
    byProject.set(s.project, p);

    for (const m of s.models) {
      if (m.model === '<synthetic>') continue;
      const key = m.model;
      const b = byModel.get(key) || { model: key, display: displayModel(key), costUSD: 0, input: 0, output: 0, cacheRead: 0, msgs: 0 };
      b.costUSD += m.costUSD || 0;
      b.input += m.tokens.input; b.output += m.tokens.output; b.cacheRead += m.tokens.cacheRead;
      b.msgs += m.msgs;
      byModel.set(key, b);
    }
  }
  totals.files = fileSet.size;

  const order = { waiting: 0, stalled: 1, running: 2, error: 3, clean: 4 };
  const sorted = [...inWindow].sort((a, b) =>
    (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.endMs || 0) - (a.endMs || 0));

  return {
    sinceMs, untilMs,
    sessions: sorted,
    needsYou, running, finished,
    totals: {
      ...totals,
      byProject: [...byProject.values()].sort((a, b) => b.costUSD - a.costUSD),
      byModel: [...byModel.values()].sort((a, b) => b.costUSD - a.costUSD),
    },
  };
}

// ---------- formatting helpers (shared by CLI + used server-side for MD export)

function fmtDuration(ms) {
  if (!ms || ms < 1000) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function fmtMoney(v) {
  if (v == null) return '—';
  if (v >= 100) return '$' + Math.round(v).toLocaleString('en-US');
  return '$' + v.toFixed(2);
}

function fmtTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n || 0);
}

function fmtClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(ms) {
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const STATUS_ICON = { waiting: '⏸', stalled: '⚠', running: '●', error: '✗', clean: '✓' };

function renderMarkdown(report) {
  const { totals } = report;
  const L = [];
  L.push(`# Debrief`);
  L.push('');
  L.push(`**${fmtDay(report.sinceMs)} ${fmtClock(report.sinceMs)} → ${fmtDay(report.untilMs)} ${fmtClock(report.untilMs)}**`);
  L.push('');
  const head = [
    `${totals.sessions} session${totals.sessions === 1 ? '' : 's'}`,
    `${fmtDuration(totals.activeMs)} active`,
    `${totals.files} files`,
    `${totals.commits} commits`,
    `${fmtMoney(totals.costUSD)} API-equivalent`,
  ];
  if (totals.subagents) head.splice(1, 0, `${totals.subagents} subagents`);
  L.push(head.join(' · '));
  L.push('');

  const section = (label, list) => {
    if (!list.length) return;
    L.push(`## ${label}`);
    L.push('');
    for (const s of list) {
      L.push(`### ${STATUS_ICON[s.status] || ''} ${s.project} — ${s.title}`);
      const reason = attentionReason(s);
      if (reason) L.push(`**${reason}.**${s.lastText ? ` Last message: “${s.lastText.replace(/\s+/g, ' ').slice(0, 200)}”` : ''}`);
      L.push(digest(s));
      const span = s.startMs ? `${fmtClock(s.startMs)}–${s.status === 'running' ? 'now' : fmtClock(s.endMs)}` : '';
      L.push(`${span} · ${fmtDuration(s.activeMs)} active · ${fmtMoney(s.totalCostUSD)}`);
      if (s.commits.length) {
        for (const c of s.commits.slice(0, 6)) L.push(`- \`${c.hash}\` ${c.message}`);
      }
      if (s.status === 'error' && s.lastError) L.push(`- last error: ${s.lastError.replace(/\s+/g, ' ').slice(0, 160)}`);
      L.push('');
    }
  };

  section(`Needs you (${report.needsYou.length})`, report.needsYou);
  section(`Still running (${report.running.length})`, report.running);
  section(`Finished (${report.finished.length})`, report.finished);

  if (totals.byModel.length) {
    L.push('## Usage');
    L.push('');
    for (const m of totals.byModel) {
      L.push(`- ${m.display}: ${fmtMoney(m.costUSD)} (${fmtTokens(m.output)} out, ${fmtTokens(m.cacheRead)} cache-read)`);
    }
    L.push('');
  }
  L.push('---');
  L.push('_Generated by [Debrief](https://github.com/azabraao) — the flight recorder for your AI coding agents._');
  return L.join('\n');
}

module.exports = { buildReport, digest, attentionReason, renderMarkdown, fmtDuration, fmtMoney, fmtTokens };
