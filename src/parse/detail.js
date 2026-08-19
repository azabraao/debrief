'use strict';
// Builds the full flight-recorder timeline for one session: an ordered list of
// events with human-readable summaries and truncated payloads, sized for the UI.
const {
  readLines, contentBlocks, userPromptText, truncate, resultText,
  classifyCommand, parseCommit, EDIT_TOOLS, SPAWN_TOOLS,
} = require('./lines');
const { costUSD } = require('../pricing');

const PAYLOAD = 2000;   // max chars for any single payload field
const STDOUT_TAIL = 1200;

function shortPath(p, cwd) {
  if (!p) return '';
  if (cwd && p.startsWith(cwd + '/')) return p.slice(cwd.length + 1);
  const home = process.env.HOME;
  if (home && p.startsWith(home + '/')) return '~/' + p.slice(home.length + 1);
  return p;
}

function toolEventSummary(name, input, cwd) {
  const i = input || {};
  switch (name) {
    case 'Bash': return truncate((i.description || i.command || '').replace(/\s+/g, ' '), 120);
    case 'Read': return shortPath(i.file_path, cwd) + (i.offset ? `:${i.offset}` : '');
    case 'Edit': case 'MultiEdit': return shortPath(i.file_path, cwd);
    case 'Write': return shortPath(i.file_path, cwd);
    case 'NotebookEdit': return shortPath(i.notebook_path, cwd);
    case 'Glob': case 'Grep': return truncate(i.pattern || '', 100);
    case 'Task': case 'Agent': return truncate(i.description || i.prompt || '', 120);
    case 'AskUserQuestion': {
      const qs = Array.isArray(i.questions) ? i.questions.map((q) => q.question).join(' | ') : '';
      return truncate(qs, 160);
    }
    case 'Skill': return '/' + (i.skill || '') + (i.args ? ' ' + truncate(i.args, 60) : '');
    case 'Artifact': return i.action && i.action !== 'publish' ? i.action : truncate(i.title || i.file_path || 'publish', 100);
    case 'WebFetch': return truncate(i.url || '', 120);
    case 'WebSearch': return truncate(i.query || '', 120);
    case 'TodoWrite': return 'update task list';
    default: {
      const flat = Object.entries(i)
        .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
        .map(([k, v]) => `${k}: ${v}`).join(', ');
      return truncate(flat, 120);
    }
  }
}

function toolEventDetail(name, input, cwd) {
  const i = input || {};
  switch (name) {
    case 'Bash': return { command: truncate(i.command, PAYLOAD) };
    case 'Edit': case 'MultiEdit':
      return { file: shortPath(i.file_path, cwd) };
    case 'Write': return { file: shortPath(i.file_path, cwd), chars: (i.content || '').length };
    case 'Task': case 'Agent':
      return { agentType: i.subagent_type || 'general-purpose', prompt: truncate(i.prompt, 600) };
    case 'AskUserQuestion': {
      const qs = Array.isArray(i.questions) ? i.questions.map((q) => ({
        question: truncate(q.question, 300),
        options: Array.isArray(q.options) ? q.options.map((o) => o.label) : [],
      })) : [];
      return { questions: qs };
    }
    default: return null;
  }
}

// structuredPatch: [{oldStart, newStart, lines: ["-x", "+y", " ctx"]}]
function diffFromPatch(patch) {
  if (!Array.isArray(patch)) return null;
  const out = [];
  let shown = 0;
  for (const hunk of patch) {
    if (!hunk || !Array.isArray(hunk.lines)) continue;
    out.push(`@@ -${hunk.oldStart} +${hunk.newStart} @@`);
    for (const l of hunk.lines) {
      if (shown >= 60) { out.push('… (diff truncated)'); return out.join('\n'); }
      out.push(truncate(l, 200));
      shown++;
    }
  }
  return out.length ? out.join('\n') : null;
}

async function sessionDetail(filePath, opts = {}) {
  const sidechainOk = !!opts.sidechainOk;
  const events = [];
  const pending = new Map(); // tool_use_id -> event
  const seenMsgIds = new Set();
  let cwd = null;
  let title = null;
  let lastTs = null;
  let totalCost = 0;
  const tokens = { input: 0, output: 0, cacheW5m: 0, cacheW1h: 0, cacheW: 0, cacheRead: 0 };

  const push = (ev) => { ev.i = events.length; events.push(ev); return ev; };

  for await (const line of readLines(filePath)) {
    if (line.__bad) continue;
    if (line.cwd && !cwd) cwd = line.cwd;
    if (line.timestamp) lastTs = line.timestamp;
    const t = line.type;

    if (t === 'ai-title') { if (line.aiTitle) title = line.aiTitle; continue; }

    if (t === 'system') {
      if (line.subtype === 'compact_boundary') {
        push({ t: line.timestamp, kind: 'compact', summary: 'Context compacted' });
      } else if (line.level === 'error') {
        push({ t: line.timestamp, kind: 'system', isError: true, summary: truncate(String(line.content || 'error'), 200) });
      }
      continue;
    }

    if (t === 'user') {
      const prompt = userPromptText(line, sidechainOk);
      if (prompt !== null) {
        push({
          t: line.timestamp,
          kind: prompt.startsWith('/') ? 'command' : 'prompt',
          summary: truncate(prompt.split('\n')[0], 160),
          detail: { text: truncate(prompt, PAYLOAD) },
        });
        continue;
      }
      for (const b of contentBlocks(line)) {
        if (!b || b.type !== 'tool_result') continue;
        const ev = pending.get(b.tool_use_id);
        pending.delete(b.tool_use_id);
        if (!ev) continue;
        const isErr = b.is_error === true;
        ev.isError = isErr;
        ev.done = true;
        const tur = line.toolUseResult;
        const text = resultText(b);
        if (tur && tur.interrupted) { ev.interrupted = true; ev.resultSummary = 'interrupted by user'; }
        else if (isErr) ev.resultSummary = truncate(text.split('\n')[0] || 'error', 160);

        if (ev.name === 'Bash' && tur && typeof tur === 'object') {
          const out = (tur.stdout || '').trim();
          const err = (tur.stderr || '').trim();
          ev.detail = ev.detail || {};
          if (out) ev.detail.stdout = out.length > STDOUT_TAIL ? '…' + out.slice(-STDOUT_TAIL) : out;
          if (err) ev.detail.stderr = truncate(err, 500);
          if (ev.cmdKind === 'commit' && !isErr) {
            const c = parseCommit(out);
            if (c) { ev.commit = c; ev.resultSummary = `committed ${c.hash} — ${c.message}`; }
          }
          if (ev.cmdKind === 'test') ev.resultSummary = isErr ? 'tests failed' : 'tests passed';
        } else if ((ev.name === 'Edit' || ev.name === 'MultiEdit') && tur && tur.structuredPatch) {
          const d = diffFromPatch(tur.structuredPatch);
          if (d) (ev.detail = ev.detail || {}).diff = d;
        } else if (ev.name === 'Write' && tur && typeof tur === 'object') {
          ev.resultSummary = tur.type === 'create' ? 'created' : 'updated';
          if (tur.structuredPatch) {
            const d = diffFromPatch(tur.structuredPatch);
            if (d) (ev.detail = ev.detail || {}).diff = d;
          }
        } else if (ev.name === 'AskUserQuestion' && tur && tur.answers && typeof tur.answers === 'object') {
          const ans = Object.entries(tur.answers).map(([q, a]) => `${truncate(q, 80)} → ${truncate(String(a), 80)}`);
          if (ans.length) { ev.resultSummary = ans.join(' | '); (ev.detail = ev.detail || {}).answers = ans; }
        } else if (ev.name === 'Artifact' && tur && typeof tur === 'object' && tur.url) {
          ev.resultSummary = String(tur.url);
        } else if (!isErr && !ev.resultSummary && text) {
          ev.resultSummary = truncate(text.replace(/\s+/g, ' '), 140);
        }
      }
      continue;
    }

    if (t === 'assistant' && line.message) {
      const msg = line.message;
      let msgMeta = null;
      if (msg.id && !seenMsgIds.has(msg.id)) {
        seenMsgIds.add(msg.id);
        if (msg.usage) {
          const u = msg.usage;
          const one = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheW5m: 0, cacheW1h: 0, cacheW: 0, cacheRead: u.cache_read_input_tokens || 0 };
          const cc = u.cache_creation;
          if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
            one.cacheW5m = cc.ephemeral_5m_input_tokens || 0; one.cacheW1h = cc.ephemeral_1h_input_tokens || 0;
          } else one.cacheW = u.cache_creation_input_tokens || 0;
          for (const k of Object.keys(tokens)) tokens[k] += one[k];
          const c = costUSD(msg.model, one, u.speed);
          if (c != null) totalCost += c;
          msgMeta = { model: msg.model, out: one.output, costUSD: c };
        }
      }
      for (const b of contentBlocks(line)) {
        if (!b) continue;
        if (b.type === 'thinking' && b.thinking) {
          push({ t: line.timestamp, kind: 'thinking', summary: truncate(b.thinking.replace(/\s+/g, ' '), 180), chars: b.thinking.length });
        } else if (b.type === 'text' && b.text) {
          push({
            t: line.timestamp, kind: 'text',
            summary: truncate(b.text.replace(/\s+/g, ' '), 180),
            detail: { text: truncate(b.text, PAYLOAD * 2) },
            model: msg.model, endTurn: msg.stop_reason === 'end_turn',
          });
        } else if (b.type === 'tool_use') {
          const name = b.name || 'tool';
          const ev = push({
            t: line.timestamp, kind: 'tool', name,
            summary: toolEventSummary(name, b.input, cwd),
            detail: toolEventDetail(name, b.input, cwd),
            meta: msgMeta, done: false,
          });
          msgMeta = null;
          if (name === 'Bash') ev.cmdKind = classifyCommand(b.input && b.input.command);
          if (EDIT_TOOLS.has(name)) ev.file = shortPath(b.input && (b.input.file_path || b.input.notebook_path), cwd);
          if (SPAWN_TOOLS.has(name)) ev.spawn = true;
          if (b.id) pending.set(b.id, ev);
        }
      }
      continue;
    }
  }

  for (const ev of pending.values()) {
    if (!ev.done) { ev.pending = true; ev.resultSummary = ev.resultSummary || 'no result recorded'; }
  }

  const errorIndexes = events.filter((e) => e.isError).map((e) => e.i);
  return { title, cwd, events, tokens, totalCost, lastTs, errorIndexes, count: events.length };
}

module.exports = { sessionDetail };
