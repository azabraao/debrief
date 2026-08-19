# Show HN post (paste-ready)

**Title:**
Show HN: Debrief – a flight recorder for Claude Code agents, built by one overnight

**URL:** [site or GitHub link]

**First comment (post immediately after submitting):**

Last night I gave a Claude Code agent a single prompt — "build a product
people will love, I'll see it in the morning" — and went to bed. This is what
it built, and I'm submitting it mostly unchanged.

It chose a problem it had direct knowledge of: when agents work while you're
away, there's no good way to find out what actually happened. Claude Code
writes detailed JSONL transcripts (~/.claude/projects/), but nobody reads
multi-hundred-MB transcript files.

Debrief parses them into:

- a "while you were away" briefing: sessions that need you first (it quotes
  the exact unanswered question), then running, then finished — each with
  files edited, commits, test results, errors, and cost
- a per-session flight recorder: every prompt/thought/tool call/diff on a
  timeline, including subagent and workflow-agent fleets
- trends: daily API-equivalent value by model, tool mix, per-project value

Technical bits HN might care about:

- Zero runtime dependencies. Node stdlib only, ~2.5k lines
- Streams 1.4GB of transcripts in ~5s cold; warm start 40ms (size+mtime cache)
- Claude Code writes one line per content block, repeating the same usage
  object per message id — naive summing double-counts tokens ~2x. Debrief
  dedupes by message id
- Costs are computed per model from published list prices incl. 5m/1h cache
  writes, cache reads, and fast-mode premiums. No LLM involved anywhere —
  everything is deterministic extraction
- 100% local: binds 127.0.0.1, zero network calls (there's no HTTP client in
  the codebase)

The transcript format is undocumented, so the parser treats every field as
optional and unknown line types as skippable — it should degrade gracefully
rather than break on Claude Code updates.

Honest limitations: Claude Code only (Codex CLI/Gemini CLI adapters are
planned), "tests passed" detection is heuristic (runner exit + output), and
the $ figure is API-list-equivalent — for subscription users it's a value
number, not a bill.

Run it: npx debrief-cli (or --demo to poke around with synthetic data first).

I'll be around all day to answer questions — about the tool or about the
overnight-agent experiment itself.
