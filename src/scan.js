'use strict';
// Walks a Claude Code projects directory, indexes every session (with a disk
// cache keyed on size+mtime so only new/changed files are re-parsed), and
// attaches subagent rollups to their parent sessions.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { indexFile } = require('./parse/indexer');

const CACHE_VERSION = 7; // bump when the summary shape changes
const LIVE_WINDOW_MS = 3 * 60 * 1000;

function defaultProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

function cachePath() {
  return path.join(os.homedir(), '.debrief', 'index-cache.json');
}

function loadCache(file) {
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (c.version === CACHE_VERSION) return c.entries || {};
  } catch { /* cold start */ }
  return {};
}

function saveCache(file, entries) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: CACHE_VERSION, entries }));
    fs.renameSync(tmp, file);
  } catch { /* cache is best-effort */ }
}

function projectDisplayName(cwd, slug) {
  if (cwd) {
    const seg = cwd.split('/').filter(Boolean);
    if (seg.length) return seg[seg.length - 1];
  }
  const parts = slug.split('-').filter(Boolean);
  return parts[parts.length - 1] || slug;
}

async function listSessionFiles(projectsDir) {
  const out = [];
  let projects = [];
  try { projects = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { return out; }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const projDir = path.join(projectsDir, p.name);
    let entries = [];
    try { entries = fs.readdirSync(projDir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        const full = path.join(projDir, e.name);
        const id = e.name.slice(0, -6);
        const subagents = [];
        const subDir = path.join(projDir, id, 'subagents');
        collectSubagents(subDir, subagents);
        out.push({ project: p.name, id, file: full, subagents });
      }
    }
  }
  return out;
}

function collectSubagents(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
    else if (e.isDirectory()) collectSubagents(full, out);
  }
}

async function indexWithCache(file, cache, stats, parseOpts) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const hit = cache[file];
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) {
    stats.cached++;
    return { summary: hit.summary, mtimeMs: st.mtimeMs, sizeBytes: st.size };
  }
  stats.parsed++;
  stats.bytes += st.size;
  const summary = await indexFile(file, parseOpts);
  cache[file] = { size: st.size, mtimeMs: st.mtimeMs, summary };
  return { summary, mtimeMs: st.mtimeMs, sizeBytes: st.size };
}

// Scans everything. onProgress(done, total) fires during cold indexing.
async function scan(projectsDir, opts = {}) {
  const dir = projectsDir || defaultProjectsDir();
  const cacheFile = opts.cacheFile || cachePath();
  const cache = opts.noCache ? {} : loadCache(cacheFile);
  const stats = { cached: 0, parsed: 0, bytes: 0 };
  const sessionFiles = await listSessionFiles(dir);
  const sessions = [];
  let done = 0;

  for (const sf of sessionFiles) {
    const res = await indexWithCache(sf.file, cache, stats);
    done++;
    if (opts.onProgress) opts.onProgress(done, sessionFiles.length);
    if (!res) continue;
    const s = res.summary;
    const agents = [];
    for (const agentFile of sf.subagents) {
      const ares = await indexWithCache(agentFile, cache, stats, { sidechainOk: true });
      if (!ares) continue;
      const a = ares.summary;
      agents.push({
        file: path.relative(dir, agentFile),
        task: a.title,
        tokens: a.tokens,
        costUSD: a.costUSD,
        models: a.models.map((m) => m.model),
        toolCalls: Object.values(a.tools).reduce((x, y) => x + y, 0),
        filesCount: a.filesCount,
        errors: a.errors,
        wallMs: a.wallMs,
      });
    }
    // Roll subagent usage into the session so totals reflect real spend.
    const agentTokens = { input: 0, output: 0, cacheW5m: 0, cacheW1h: 0, cacheW: 0, cacheRead: 0 };
    let agentCost = 0;
    for (const a of agents) {
      for (const k of Object.keys(agentTokens)) agentTokens[k] += (a.tokens && a.tokens[k]) || 0;
      agentCost += a.costUSD || 0;
    }
    sessions.push({
      id: sf.id,
      projectSlug: sf.project,
      project: projectDisplayName(s.cwd, sf.project),
      file: path.relative(dir, sf.file),
      sizeBytes: res.sizeBytes,
      mtimeMs: res.mtimeMs,
      agents,
      agentTokens,
      agentCostUSD: agentCost,
      totalCostUSD: s.costUSD == null && agentCost === 0 ? null : (s.costUSD || 0) + agentCost,
      ...s,
    });
  }

  if (!opts.noCache) {
    // Drop cache entries for deleted files so the cache doesn't grow forever.
    const liveFiles = new Set();
    for (const sf of sessionFiles) { liveFiles.add(sf.file); for (const a of sf.subagents) liveFiles.add(a); }
    for (const k of Object.keys(cache)) if (!liveFiles.has(k)) delete cache[k];
    saveCache(cacheFile, cache);
  }

  sessions.sort((a, b) => (b.endMs || 0) - (a.endMs || 0));
  return { dir, sessions, stats };
}

function applyLiveness(sessions, now = Date.now()) {
  for (const s of sessions) {
    s.live = now - s.mtimeMs < LIVE_WINDOW_MS;
    s.status = s.live ? 'running' : s.endState;
  }
  return sessions;
}

module.exports = { scan, applyLiveness, defaultProjectsDir, LIVE_WINDOW_MS };
