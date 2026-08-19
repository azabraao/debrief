# Debrief — positioning

**One-liner:** The flight recorder for your AI coding agents.

**Elevator:** You let Claude Code work while you're away — overnight runs,
parallel fleets, autonomous tasks. Debrief reads the transcripts Claude Code
already writes and turns them into a morning briefing (what shipped, what
broke, what it cost, what needs you) plus a per-session flight recorder.
100% local, zero dependencies, one command: `npx debrief-cli`.

**Category:** agent observability, but for individuals — a consumer-grade
instrument, not an enterprise dashboard. "ccusage shows you the bill;
Debrief shows you the story."

**Who buys first:**
1. Heavy Claude Code users who run overnight/autonomous sessions (the origin
   story is literally them)
2. Max-plan subscribers who love the "your plan delivered $X of API value"
   framing (screenshot-bait)
3. Leads who need a defensible answer to "what did the agents change?"

**Why now:** Autonomous multi-hour agent runs became normal in 2026. Trust
and legibility are the bottleneck, not capability. Every wave of autonomy
ships its instrument layer — this is that layer for agentic coding.

**Moats (honest):** none technical — the moat is taste, speed, and the story.
Ship adapters (Codex CLI, Gemini CLI) before anyone copies the framing.
The parser hardening (format drift, usage dedup by message id, subagent
rollups) is two weeks of unglamorous work competitors must repeat.

**Pricing:** $29 one-time founding license, honor system at launch. Optimize
for install volume and word of mouth, not conversion, in week one. Team/Slack
digest is the obvious future paid tier ($10/seat/mo) — do not build it until
individuals prove the pull.

**The number that sells:** "$8,400 of API-equivalent work last month" — every
user has a personal version of this stat, and Debrief is how they find it.
People share numbers about themselves. Trends view = the shareable artifact.

**Anti-positioning:** not an agent framework, not a session manager, not a
prompt tool, never cloud. The moment it needs an account it's dead.
