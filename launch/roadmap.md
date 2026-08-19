# 30-day roadmap (post-launch)

## Week 1 — launch & listen
- Wire the real Stripe Payment Link into site + app footer (15 min, see START_HERE)
- `npm publish` as `debrief-cli`; push repo to GitHub (public or source-visible)
- Launch: X thread → HN next day → PH day 4 → r/ClaudeAI day 5 (drafts in launch/)
- Fix whatever the first 50 users hit; ship daily. Every bug report = a
  transcript-format edge case you couldn't have found alone

## Week 2 — the shareable number
- "Month in review" card: one beautiful shareable image (PNG export) —
  total value, busiest day, top project, model mix. This is the growth loop
- `debrief report --html` for pretty email/Slack pasting
- Full-text search across transcripts (endpoint already stubbed in design)

## Week 3 — beyond Claude Code
- Adapter interface + Codex CLI parser (their JSONL is simpler)
- Gemini CLI + opencode if formats cooperate
- "Any agent that writes JSONL" doc for community adapters

## Week 4 — the money features
- Scheduled morning digest: `debrief digest --email you@x.com` via local
  SMTP/sendmail or a paste-into-cron Slack webhook (still zero-cloud)
- Founding-license validation: real ed25519-signed keys (script exists in
  concept; keep honor-system fallback)
- Start the team conversation: shared debriefs are the $10/seat product, but
  only if individuals keep asking for it

## Deliberate non-goals
- No cloud sync, no accounts, no telemetry — ever (it's the moat of trust)
- No LLM summarization of sessions (determinism is a feature)
- No agent-control features (observe, don't orchestrate — stay Switzerland)
