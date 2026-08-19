'use strict';
// Local HTTP server: JSON API + static dashboard. Binds 127.0.0.1 only.
// No telemetry, no external requests — your transcripts never leave the machine.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { scan, applyLiveness } = require('./scan');
const { sessionDetail } = require('./parse/detail');
const { buildReport } = require('./report');
const { displayModel } = require('./pricing');
const { readLicense } = require('./license');

const WEB_ROOT = path.join(__dirname, '..', 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const RESCAN_MIN_INTERVAL = 15 * 1000;

function createApp(opts) {
  const state = {
    dir: opts.dir,
    demo: !!opts.demo,
    scanning: null,
    lastScan: 0,
    sessions: [],
    stats: null,
  };

  async function ensureFresh(force) {
    const now = Date.now();
    if (!force && state.sessions.length && now - state.lastScan < RESCAN_MIN_INTERVAL) return;
    if (state.scanning) return state.scanning;
    state.scanning = scan(state.dir, { onProgress: opts.onProgress })
      .then(({ sessions, stats, dir }) => {
        state.sessions = sessions;
        state.stats = stats;
        state.dir = dir;
        state.lastScan = Date.now();
      })
      .finally(() => { state.scanning = null; });
    return state.scanning;
  }

  // Sessions with liveness applied and heavy fields trimmed for list payloads.
  function slimSessions() {
    applyLiveness(state.sessions);
    return state.sessions.map((s) => ({
      ...s,
      files: s.files.slice(0, 50),
      models: s.models.map((m) => ({ ...m, display: displayModel(m.model) })),
    }));
  }

  function parseWindow(q) {
    const now = Date.now();
    let since = q.get('since');
    let until = q.get('until');
    let sinceMs, untilMs = until ? Number(until) || Date.parse(until) : now;
    if (!since || since === 'auto') {
      // "Overnight": since 18:00 yesterday if it's before noon, else the last 18h.
      const d = new Date(now);
      if (d.getHours() < 12) { d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0); sinceMs = d.getTime(); }
      else sinceMs = now - 18 * 3600 * 1000;
    } else if (/^\d+(\.\d+)?[hdwm]$/.test(since)) {
      const n = parseFloat(since);
      const unit = { h: 3600e3, d: 86400e3, w: 7 * 86400e3, m: 30 * 86400e3 }[since.slice(-1)];
      sinceMs = now - n * unit;
    } else if (since === 'all') {
      sinceMs = 0;
    } else {
      sinceMs = Number(since) || Date.parse(since) || now - 18 * 3600e3;
    }
    return { sinceMs, untilMs };
  }

  // Daily cost/tokens series with proportional attribution across the days a
  // session spans (a 10-hour overnight session splits across both dates).
  function trends(sessions, sinceMs, untilMs) {
    const days = new Map(); // 'YYYY-MM-DD' -> {dayMs, costUSD, output, byModelCost: {display: usd}}
    const hourHist = new Array(24).fill(0); // active ms per hour-of-day
    const toolMix = new Map();
    const projects = new Map();

    for (const s of sessions) {
      if (!overlapsWindow(s, sinceMs, untilMs)) continue;
      const start = s.startMs ?? s.endMs, end = Math.max(s.endMs ?? start, start + 1);
      const span = end - start;
      const cost = s.totalCostUSD || 0;
      const out = (s.tokens.output || 0) + ((s.agentTokens && s.agentTokens.output) || 0);
      // walk day boundaries
      let cursor = start;
      while (cursor < end) {
        const d = new Date(cursor);
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const sliceEnd = Math.min(dayEnd, end);
        const frac = (sliceEnd - cursor) / span;
        const rec = days.get(dayKey) || { day: dayKey, dayMs: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), costUSD: 0, output: 0, byModel: {} };
        rec.costUSD += cost * frac;
        rec.output += out * frac;
        for (const m of s.models) {
          if (m.model === '<synthetic>') continue;
          const disp = displayModel(m.model);
          rec.byModel[disp] = (rec.byModel[disp] || 0) + (m.costUSD || 0) * frac;
        }
        days.set(dayKey, rec);
        cursor = sliceEnd;
      }
      // hour histogram: spread activeMs across span hours
      if (s.activeMs && span > 0) {
        let c = start;
        while (c < end) {
          const h = new Date(c).getHours();
          const hourEnd = Math.ceil((c + 1) / 3600e3) * 3600e3;
          const sliceEnd = Math.min(hourEnd, end);
          hourHist[h] += s.activeMs * ((sliceEnd - c) / span);
          c = sliceEnd;
        }
      }
      for (const [name, n] of Object.entries(s.tools)) toolMix.set(name, (toolMix.get(name) || 0) + n);
      const p = projects.get(s.project) || { project: s.project, costUSD: 0, sessions: 0, activeMs: 0 };
      p.costUSD += cost; p.sessions++; p.activeMs += s.activeMs;
      projects.set(s.project, p);
    }

    return {
      days: [...days.values()].sort((a, b) => a.dayMs - b.dayMs),
      hourHist: hourHist.map((ms) => Math.round(ms)),
      toolMix: [...toolMix.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 14),
      projects: [...projects.values()].sort((a, b) => b.costUSD - a.costUSD),
    };
  }

  function overlapsWindow(s, sinceMs, untilMs) {
    const start = s.startMs != null ? s.startMs : s.endMs;
    const end = s.endMs != null ? s.endMs : s.startMs;
    return start != null && end >= sinceMs && start <= untilMs;
  }

  function send(res, code, body, headers = {}, req) {
    if (typeof body === 'object' && !(body instanceof Buffer)) {
      body = JSON.stringify(body);
      headers['content-type'] = 'application/json; charset=utf-8';
    }
    const accept = (req && req.headers['accept-encoding']) || '';
    if (body.length > 8192 && /\bgzip\b/.test(accept)) {
      body = zlib.gzipSync(Buffer.from(body));
      headers['content-encoding'] = 'gzip';
    }
    res.writeHead(code, { 'cache-control': 'no-store', ...headers });
    res.end(body);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    try {
      if (p === '/api/overview') {
        await ensureFresh(url.searchParams.get('fresh') === '1');
        const { sinceMs, untilMs } = parseWindow(url.searchParams);
        const sessions = slimSessions();
        const report = buildReport(sessions, sinceMs, untilMs);
        return send(res, 200, { ...report, now: Date.now() }, {}, req);
      }
      if (p === '/api/trends') {
        await ensureFresh(false);
        const { sinceMs, untilMs } = parseWindow(url.searchParams);
        applyLiveness(state.sessions);
        return send(res, 200, { ...trends(state.sessions, sinceMs, untilMs), sinceMs, untilMs }, {}, req);
      }
      if (p === '/api/session') {
        await ensureFresh(false);
        const rel = url.searchParams.get('file') || '';
        const abs = path.resolve(state.dir, rel);
        if (!abs.startsWith(path.resolve(state.dir) + path.sep) || !abs.endsWith('.jsonl')) {
          return send(res, 400, { error: 'invalid file' });
        }
        const isAgent = rel.includes('subagents');
        const detail = await sessionDetail(abs, { sidechainOk: isAgent });
        applyLiveness(state.sessions);
        const summary = state.sessions.find((s) => s.file === rel) || null;
        return send(res, 200, { file: rel, isAgent, summary, ...detail }, {}, req);
      }
      if (p === '/api/live') {
        // Cheap status poll: stat mtimes only, no parsing.
        applyLiveness(state.sessions);
        for (const s of state.sessions.slice(0, 100)) {
          try { s.mtimeMs = fs.statSync(path.join(state.dir, s.file)).mtimeMs; } catch { /* deleted */ }
        }
        applyLiveness(state.sessions);
        return send(res, 200, state.sessions.slice(0, 100).map((s) => ({ id: s.id, file: s.file, status: s.status, mtimeMs: s.mtimeMs })), {}, req);
      }
      if (p === '/api/meta') {
        const pkg = require('../package.json');
        return send(res, 200, {
          version: pkg.version, dir: state.dir, demo: state.demo,
          license: readLicense(), sessions: state.sessions.length,
        }, {}, req);
      }

      // static
      let file = p === '/' ? '/index.html' : p;
      // deep links like /session/... serve the app shell
      if (!path.extname(file)) file = '/index.html';
      const abs = path.resolve(WEB_ROOT, '.' + file);
      if (!abs.startsWith(WEB_ROOT + path.sep) && abs !== path.join(WEB_ROOT, 'index.html')) {
        return send(res, 404, { error: 'not found' });
      }
      let data;
      try { data = fs.readFileSync(abs); } catch { return send(res, 404, 'not found', { 'content-type': 'text/plain' }); }
      return send(res, 200, data, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' }, req);
    } catch (err) {
      return send(res, 500, { error: String((err && err.message) || err) });
    }
  }

  return { handle, ensureFresh, state };
}

function serve(opts) {
  const app = createApp(opts);
  return new Promise((resolve, reject) => {
    const tryListen = (port, attempts) => {
      const server = http.createServer(app.handle);
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts > 0) tryListen(port + 1, attempts - 1);
        else reject(err);
      });
      server.listen(port, '127.0.0.1', () => resolve({ server, port, app }));
    };
    tryListen(opts.port || 4177, 10);
  });
}

module.exports = { serve, createApp };
