# Good morning ☕

You asked for a product built overnight. Here it is.

## ◍ Debrief — the flight recorder for your AI coding agents

The tool that answers the question you're about to ask anyway: *"what did
Claude do all night?"* It reads `~/.claude/projects/` transcripts and turns
them into a morning briefing + per-session flight recorder + cost trends.
Local, private, zero dependencies.

## See it in 30 seconds

```bash
cd ~/projects/revolution
node bin/debrief.js            # your real fleet — this overnight session included
node bin/debrief.js --demo     # the synthetic demo (what the screenshots use)
node bin/debrief.js report     # the same briefing as markdown in the terminal
npm test                       # 13 passing
```

Your own numbers, from last night's indexing: **741 transcripts, 1.4GB,
indexed in 4.8s** — and ~**$8.4k of API-equivalent work in the last 30 days**.

## What was verified (not just written)

- Parsed your entire real archive with zero unparseable lines
- Usage deduped by message id (naive parsers overcount ~2× — tested)
- Cost table fetched live from Anthropic's pricing docs yesterday, incl.
  cache write/read and fast-mode rates
- 195MB session → flight recorder in ~0.5s (3,190 events, 41 errors flagged)
- Clicked through every view in Chrome, both themes, incl. error/waiting/live
  states; chart palette passed the CVD validator on both surfaces
- 13-test suite green

## Before you can take money (≈45 min total)

1. **Stripe Payment Link** (15 min): create a $29 one-time product, then put
   the URL in `site/index.html` (`data-buy` link) and `web/app.js` footer
   (`https://debrief.sh` placeholder). Email keys manually at first:
   any `DBRF-XXXX-XXXX-XXXX` string works with `debrief license` (honor
   system by design — see `src/license.js`).
2. **npm publish** (10 min): name `debrief-cli` was free last night.
   `npm publish` from the repo root (files whitelist already set). Verify
   `npx debrief-cli` from a clean dir.
3. **Host the landing** (15 min): `site/` is static — Vercel/Netlify/Pages.
   A private artifact preview is already published (link in the chat).
4. **GitHub**: push the repo; the README is written for the public.

Then launch: paste-ready drafts in `launch/` (X thread, Show HN, Product
Hunt, r/ClaudeAI) + `positioning.md` + a 30-day `roadmap.md`.

## Honest gaps

- "Tests passed" detection is heuristic (runner exit code + output)
- Mobile layout is CSS-responsive but untested on a real phone (window
  manager wouldn't shrink below ~1280px last night)
- Trends attributes a session's cost across days proportionally by wall time
- License keys are format-checked only (documented in code; roadmap has the
  signed-key plan)
- `--demo` regenerates on each boot; its "running" session goes stale after
  3 min (by design — liveness is mtime-based)

## Where everything lives

```
bin/debrief.js        CLI (serve, report, license, --demo)
src/parse/            the transcript parser (lines → indexer → detail)
src/scan.js           directory walker + size/mtime index cache
src/pricing.js        cost engine (list prices, cache tiers, fast mode)
src/report.js         the debrief builder + markdown renderer
src/server.js         local HTTP server (127.0.0.1 only, path-guarded)
src/demo.js           synthetic fleet generator (also the test fixture)
web/                  the dashboard (vanilla, no build step)
site/                 landing page + screenshots
launch/               positioning, X/HN/PH/Reddit drafts, roadmap
docs/                 transcript format notes (reverse-engineered)
test/                 node:test suite
```

— Claude, 04:5x, end of night shift ◍
