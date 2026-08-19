'use strict';
// Folds one transcript file into a compact SessionSummary — the unit the
// Debrief home view, report, and trends are built from. Streaming, tolerant,
// and cheap enough to run over gigabytes of history.
const {
  readLines, contentBlocks, userPromptText, truncate, resultText,
  classifyCommand, parseCommit, EDIT_TOOLS, SPAWN_TOOLS,
} = require('./lines');
const { costUSD } = require('../pricing');

function emptyTokens() {
  return { input: 0, output: 0, cacheW5m: 0, cacheW1h: 0, cacheW: 0, cacheRead: 0 };
}

function addUsage(bucket, usage) {
  bucket.input += usage.input_tokens || 0;
  bucket.output += usage.output_tokens || 0;
  const cc = usage.cache_creation;
  if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
    bucket.cacheW5m += cc.ephemeral_5m_input_tokens || 0;
    bucket.cacheW1h += cc.ephemeral_1h_input_tokens || 0;
  } else {
    bucket.cacheW += usage.cache_creation_input_tokens || 0;
  }
  bucket.cacheRead += usage.cache_read_input_tokens || 0;
}

async function indexFile(filePath, opts = {}) {
  const sidechainOk = !!opts.sidechainOk;
  const s = {
    title: null,
    firstPrompt: null,
    lastText: null,          // last visible assistant text (the handoff)
    cwd: null,
    gitBranch: null,
    versions: new Set(),
    startedAt: null,
    endedAt: null,
    activeMs: 0,             // sum of turn_duration system lines
    gapActiveMs: 0,          // fallback: sum of inter-event gaps < 5min
    _prevTsMs: null,
    prompts: 0,              // real user prompts
    slashCommands: 0,
    assistantMsgs: 0,        // deduped by message.id
    models: {},              // model -> {tokens, msgs, speed}
    tools: {},               // tool name -> count
    files: {},               // path -> {edits, wrote}
    reads: 0,
    commands: 0,
    commits: [],
    pushes: 0,
    tests: { runs: 0, failed: 0 },
    errors: 0,
    lastError: null,
    interrupts: 0,
    questionsAsked: 0,
    pendingQuestionText: null,
    artifacts: 0,
    skills: new Set(),
    subagentSpawns: 0,
    badLines: 0,
    lastEvent: null,         // 'prompt'|'assistant-end'|'tool'|'result'|'error-result'
    pendingQuestion: false,
    pendingToolName: null,
    deniedAtEnd: false,
    compactions: 0,
  };

  const seenMsgIds = new Set();
  const pendingTools = new Map(); // tool_use_id -> {name, kind, command}

  for await (const line of readLines(filePath)) {
    if (line.__bad) { s.badLines++; continue; }
    const t = line.type;

    if (line.timestamp) {
      if (!s.startedAt) s.startedAt = line.timestamp;
      s.endedAt = line.timestamp;
      const ms = Date.parse(line.timestamp);
      if (!Number.isNaN(ms)) {
        if (s._prevTsMs != null) {
          const gap = ms - s._prevTsMs;
          if (gap > 0 && gap < 5 * 60000) s.gapActiveMs += gap;
        }
        s._prevTsMs = ms;
      }
    }
    if (line.cwd && !s.cwd) s.cwd = line.cwd;
    if (line.gitBranch) s.gitBranch = line.gitBranch;
    if (line.version) s.versions.add(line.version);

    if (t === 'ai-title') { if (line.aiTitle) s.title = line.aiTitle; continue; }
    if (t === 'summary') { if (!s.title && line.summary) s.title = line.summary; continue; }

    if (t === 'system') {
      if (line.subtype === 'turn_duration' && line.durationMs > 0) s.activeMs += line.durationMs;
      if (line.subtype === 'compact_boundary') s.compactions++;
      if (line.level === 'error') { s.errors++; s.lastError = truncate(String(line.content || 'system error'), 300); }
      continue;
    }

    if (t === 'user') {
      if (line.isCompactSummary) s.compactions++;
      const prompt = userPromptText(line, sidechainOk);
      if (prompt !== null) {
        if (prompt.startsWith('/')) s.slashCommands++;
        else {
          s.prompts++;
          if (!s.firstPrompt) s.firstPrompt = truncate(prompt, 300);
        }
        s.lastEvent = 'prompt';
        s.pendingQuestion = false;
        s.deniedAtEnd = false;
        continue;
      }
      // Tool result round-trip
      for (const b of contentBlocks(line)) {
        if (!b || b.type !== 'tool_result') continue;
        const pending = pendingTools.get(b.tool_use_id);
        pendingTools.delete(b.tool_use_id);
        const isErr = b.is_error === true;
        const text = isErr || (pending && pending.kind) ? resultText(b) : '';
        if (pending && pending.name === 'AskUserQuestion') { s.pendingQuestion = false; s.pendingQuestionText = null; }
        if (isErr) {
          s.errors++;
          s.lastError = truncate(text || 'tool error', 300);
          s.lastEvent = 'error-result';
          s.deniedAtEnd = /doesn't want to (proceed|take this action)|denied|rejected the (tool|request)|user chose not to/i.test(text);
        } else {
          s.lastEvent = 'result';
          s.deniedAtEnd = false;
          if (pending) {
            if (pending.kind === 'commit') {
              const commit = parseCommit(text);
              if (commit) s.commits.push(commit);
            } else if (pending.kind === 'test') {
              s.tests.runs++;
            } else if (pending.kind === 'push') {
              s.pushes++;
            }
          }
        }
        if (pending && pending.kind === 'test' && isErr) { s.tests.runs++; s.tests.failed++; }
        const tur = line.toolUseResult;
        if (tur && tur.interrupted === true) s.interrupts++;
      }
      continue;
    }

    if (t === 'assistant' && line.message) {
      const msg = line.message;
      if (msg.id && !seenMsgIds.has(msg.id)) {
        seenMsgIds.add(msg.id);
        s.assistantMsgs++;
        if (msg.usage) {
          const model = msg.model || 'unknown';
          const speed = (msg.usage.speed === 'fast') ? 'fast' : 'standard';
          const key = model + (speed === 'fast' ? '|fast' : '');
          if (!s.models[key]) s.models[key] = { model, speed, tokens: emptyTokens(), msgs: 0 };
          s.models[key].msgs++;
          addUsage(s.models[key].tokens, msg.usage);
        }
      }
      for (const b of contentBlocks(line)) {
        if (!b) continue;
        if (b.type === 'text' && b.text && (sidechainOk || !line.isSidechain)) {
          s.lastText = truncate(b.text, 600);
          if (msg.stop_reason === 'end_turn') s.lastEvent = 'assistant-end';
        } else if (b.type === 'tool_use') {
          const name = b.name || 'unknown';
          s.tools[name] = (s.tools[name] || 0) + 1;
          s.lastEvent = 'tool';
          s.pendingToolName = name;
          const input = b.input || {};
          let kind = null;
          if (name === 'Bash') {
            s.commands++;
            kind = classifyCommand(input.command);
          } else if (EDIT_TOOLS.has(name) && input.file_path) {
            const f = s.files[input.file_path] || (s.files[input.file_path] = { edits: 0, wrote: false });
            f.edits++;
            if (name === 'Write') f.wrote = true;
          } else if (name === 'Read') {
            s.reads++;
          } else if (SPAWN_TOOLS.has(name)) {
            s.subagentSpawns++;
          } else if (name === 'AskUserQuestion') {
            s.questionsAsked++;
            s.pendingQuestion = true;
            const qs = Array.isArray(input.questions) ? input.questions.map((q) => q && q.question).filter(Boolean) : [];
            if (qs.length) s.pendingQuestionText = truncate(qs.join(' — '), 300);
          } else if (name === 'Artifact') {
            if (!input.action || input.action === 'publish') s.artifacts++;
          } else if (name === 'Skill' && input.skill) {
            s.skills.add(String(input.skill).slice(0, 60));
          }
          if (b.id) pendingTools.set(b.id, { name, kind });
        }
      }
      continue;
    }
  }

  // ---- derive
  const tokens = emptyTokens();
  let cost = 0;
  let costKnown = true;
  const models = Object.values(s.models).map((m) => {
    for (const k of Object.keys(tokens)) tokens[k] += m.tokens[k];
    const c = costUSD(m.model, m.tokens, m.speed);
    if (c === null) costKnown = false; else cost += c;
    return { ...m, costUSD: c };
  }).sort((a, b) => (b.costUSD || 0) - (a.costUSD || 0));

  const startMs = s.startedAt ? Date.parse(s.startedAt) : null;
  const endMs = s.endedAt ? Date.parse(s.endedAt) : null;

  const files = Object.entries(s.files)
    .map(([path, v]) => ({ path, edits: v.edits, wrote: v.wrote }))
    .sort((a, b) => b.edits - a.edits);

  // End-state (before liveness, which is applied at serve time):
  // waiting  — an unanswered AskUserQuestion, a permission denial at the end,
  //            or a final reply that ends by asking the user something.
  // error    — the last thing that happened was a failing tool call.
  // stalled  — a tool call with no recorded result (interrupt/crash mid-call).
  // clean    — everything else.
  let endState = 'clean';
  if (s.pendingQuestion || s.deniedAtEnd) endState = 'waiting';
  else if (s.lastEvent === 'assistant-end' && s.lastText && /\?\s*$/.test(s.lastText)) endState = 'waiting';
  else if (s.lastEvent === 'error-result') endState = 'error';
  else if (s.lastEvent === 'tool' && pendingTools.size > 0) endState = 'stalled';

  return {
    title: s.title || s.firstPrompt || '(untitled session)',
    firstPrompt: s.firstPrompt,
    lastText: s.lastText,
    cwd: s.cwd,
    gitBranch: s.gitBranch,
    versions: [...s.versions].sort(),
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    startMs, endMs,
    wallMs: startMs != null && endMs != null ? Math.max(0, endMs - startMs) : 0,
    activeMs: s.activeMs || s.gapActiveMs,
    prompts: s.prompts,
    slashCommands: s.slashCommands,
    assistantMsgs: s.assistantMsgs,
    models,
    tokens,
    costUSD: costKnown || cost > 0 ? cost : null,
    costPartial: !costKnown,
    tools: s.tools,
    files,
    filesCount: files.length,
    reads: s.reads,
    commands: s.commands,
    commits: s.commits,
    pushes: s.pushes,
    tests: s.tests,
    errors: s.errors,
    lastError: s.lastError,
    interrupts: s.interrupts,
    questionsAsked: s.questionsAsked,
    pendingQuestionText: s.pendingQuestion ? s.pendingQuestionText : null,
    artifacts: s.artifacts,
    skills: [...s.skills],
    subagentSpawns: s.subagentSpawns,
    compactions: s.compactions,
    badLines: s.badLines,
    endState,
  };
}

module.exports = { indexFile };
