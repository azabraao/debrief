#!/usr/bin/env node
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const pkg = require('../package.json');

const HELP = `
  debrief — the flight recorder for your AI coding agents

  usage
    debrief                    start the dashboard and open it
    debrief report             print a markdown debrief to stdout
    debrief license <key>      activate a founding license
    debrief --demo             explore with generated demo data

  options
    --since <window>           auto (overnight) | 8h | 3d | 2w | all   [auto]
    --port <n>                 dashboard port                          [4177]
    --dir <path>               Claude projects dir      [~/.claude/projects]
    --json                     report as JSON instead of markdown
    --no-open                  don't open the browser
    --fresh                    ignore the index cache and reparse

  Debrief reads Claude Code's local transcripts. Everything stays on your
  machine — no accounts, no telemetry, no uploads.
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') args.demo = true;
    else if (a === '--json') args.json = true;
    else if (a === '--no-open') args.noOpen = true;
    else if (a === '--fresh') args.fresh = true;
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--port') args.port = parseInt(argv[++i], 10);
    else if (a === '--dir') args.dir = path.resolve(argv[++i]);
    else if (a === '--version' || a === '-v') args.version = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else args._.push(a);
  }
  return args;
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try { spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref(); } catch { /* they can click */ }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) return console.log(pkg.version);
  if (args.help) return console.log(HELP);
  const cmd = args._[0];

  if (cmd === 'license') {
    const { saveLicense } = require('../src/license');
    const r = saveLicense(args._[1]);
    if (!r.ok) { console.error('✗ ' + r.error); process.exit(1); }
    return console.log('✓ Founding license activated. Thank you for keeping Debrief alive.');
  }

  let dir = args.dir;
  if (args.demo) {
    const { generateDemo } = require('../src/demo');
    dir = generateDemo();
    console.log('› demo data generated');
  }

  if (cmd === 'report') {
    const { scan, applyLiveness } = require('../src/scan');
    const { buildReport, renderMarkdown } = require('../src/report');
    const { sessions } = await scan(dir, { noCache: args.fresh || args.demo });
    applyLiveness(sessions);
    const now = Date.now();
    let sinceMs;
    const since = args.since || 'auto';
    if (since === 'all') sinceMs = 0;
    else if (/^\d+(\.\d+)?[hdwm]$/.test(since)) {
      const unit = { h: 3600e3, d: 86400e3, w: 7 * 86400e3, m: 30 * 86400e3 }[since.slice(-1)];
      sinceMs = now - parseFloat(since) * unit;
    } else {
      const d = new Date(now);
      if (d.getHours() < 12) { d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0); sinceMs = d.getTime(); }
      else sinceMs = now - 18 * 3600e3;
    }
    const report = buildReport(sessions, sinceMs, now);
    if (args.json) return console.log(JSON.stringify(report, null, 2));
    return console.log(renderMarkdown(report));
  }

  if (cmd && cmd !== 'serve') {
    console.error(`unknown command: ${cmd}`);
    console.log(HELP);
    process.exit(1);
  }

  const { serve } = require('../src/server');
  if (args.fresh) {
    const fs = require('fs');
    const os = require('os');
    try { fs.unlinkSync(path.join(os.homedir(), '.debrief', 'index-cache.json')); } catch { /* fine */ }
  }
  let lastPct = -1;
  const { port, app } = await serve({
    dir, port: args.port, demo: args.demo,
    onProgress: (done, total) => {
      const pct = Math.floor((done / total) * 10) * 10;
      if (pct !== lastPct && total > 20) { lastPct = pct; process.stdout.write(`\r› indexing sessions… ${pct}% `); }
    },
  });
  const t0 = Date.now();
  await app.ensureFresh(true);
  const n = app.state.sessions.length;
  process.stdout.write('\r');
  const url = `http://localhost:${port}`;
  console.log(`
  ◍ Debrief ${args.demo ? '(demo) ' : ''}is up — ${url}
    ${n} session${n === 1 ? '' : 's'} indexed in ${((Date.now() - t0) / 1000).toFixed(1)}s · everything stays local
`);
  if (!args.noOpen) openBrowser(url);
}

main().catch((err) => { console.error(err); process.exit(1); });
