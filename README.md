# ◍ Debrief

**The flight recorder for your AI coding agents.**

You let Claude Code work while you sleep. Debrief tells you what happened — a
beautiful local dashboard that turns your agents' transcripts into a morning
briefing: what shipped, what broke, what it cost, and what's waiting on you.

```
npx debrief-cli
```

One command. No account. No cloud. Your transcripts never leave your machine.

![The Debrief — what happened while you were away](https://raw.githubusercontent.com/azabraao/debrief/main/site/assets/debrief-home.jpg)

**Site:** [azabraao.github.io/debrief](https://azabraao.github.io/debrief/)

## Why

Autonomous coding agents changed the shape of the workday: the work happens
while you're not watching. What's missing is the part every other autonomous
system has had for decades — the flight recorder. When you come back to five
finished sessions, you need answers fast:

- **What needs me right now?** Sessions that ended on a question, a permission
  denial, or an error are surfaced first — with the exact question quoted.
- **What did each session actually do?** Files edited, commands run, commits
  made, tests passed or failed — extracted from the transcript, not summarized
  by another LLM.
- **What did it cost?** Token-accurate, per-model API-equivalent value,
  including cache reads and writes. On a subscription, that's the value your
  plan delivered.
- **What exactly happened at 3:12am?** A full flight-recorder timeline for
  every session: each prompt, thought, tool call, diff, and error — replayable
  and filterable, down to individual subagents.

## What you get

- **The Debrief** — a morning report for any time window. Hero number, totals
  tape, and every session as a status strip: `needs you` / `running` /
  `finished clean` / `ended in error`.
- **The Flight Recorder** — per-session event timeline with inline diffs,
  command output, error jumps, and a rail of files, commits, models, and
  subagent fleets (workflow agents included).
- **Trends** — daily API-equivalent value stacked by model, tool mix, value by
  project, and when your agents actually work.
- **`debrief report`** — the same debrief as markdown in your terminal.
  Pipe it anywhere: `debrief report | pbcopy`, cron it into Slack, whatever.

## Install

```bash
npm install -g debrief-cli    # then: debrief
# or run without installing:
npx debrief-cli
```

Requires Node 18+ and a machine that has run [Claude Code](https://claude.com/claude-code).
Zero dependencies — nothing else is downloaded.

## Usage

```
debrief                    start the dashboard and open it
debrief report             print a markdown debrief to stdout
debrief report --since 3d  ...for the last 3 days (8h, 2w, all)
debrief --demo             explore with generated demo data
debrief license <key>      activate a founding license
```

Useful flags: `--port <n>`, `--dir <path>` (custom Claude projects dir),
`--no-open`, `--json`, `--fresh`.

## How it works

Claude Code writes every session to JSONL transcripts under
`~/.claude/projects/`. Debrief streams those files (gigabytes in seconds),
dedupes API usage by message id, prices tokens per model at published list
prices — cache reads, cache writes, and fast-mode included — and derives each
session's story deterministically: no LLM calls, no sampling, no guessing.
An index cache makes warm starts instant; a 200MB session replays in about
half a second.

The transcript format is undocumented and drifts between Claude Code versions.
Debrief's parser treats every field as optional and every unknown line as
skippable — new versions degrade gracefully instead of breaking. Format notes
live in [docs/transcript-format.md](docs/transcript-format.md).

## Privacy

Your transcripts contain your code. Debrief is built around that fact:

- Runs entirely on `127.0.0.1` — never binds a public interface
- Makes zero network requests. No telemetry, no update checks, no accounts
- The `--demo` flag exists so screenshots never need your real data

## Pricing

Debrief is in free preview while it's new. If it earns a place in your
mornings, buy a **founding license — $29, once, yours forever** (it's an honor
system today; founding keys will grandfather into everything Debrief becomes).

## Roadmap

- Adapters for other agent CLIs (Codex CLI, Gemini CLI, opencode)
- Scheduled digests (morning email / Slack) and shareable session replays
- Team debriefs: one dashboard for everyone's fleets
- Full-text search across all transcripts

---

Built overnight — literally — by a Claude Code agent whose instructions were
"build something people will love," while its owner slept. Debrief's first
debrief was of the session that built it.
