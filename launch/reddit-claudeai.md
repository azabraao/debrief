# r/ClaudeAI post (paste-ready)

**Title:**
I let Claude Code build "whatever it wants" overnight. It built a flight
recorder for itself — and honestly, I use it every morning now.

**Body:**

The experiment: before bed I gave Claude Code one prompt — *"build a
revolutionary product people will love. Don't ask me anything. I'll see it
in the morning."* — and closed the laptop lid on my part of the job.

What it picked, without any steering, was the most self-aware option
possible: the tool that tells you what your Claude Code sessions did while
you weren't watching.

`npx debrief-cli` opens a local dashboard with:

- **Needs you first** — sessions that ended on a question show the *exact*
  question ("Should existing annual plans be grandfathered…?"), permission
  denials, stalls
- **What each session did** — files edited, commands, commits, tests
  passed/failed, errors, subagent fleets — parsed from the transcripts, not
  AI-summarized
- **The money view** — token-accurate API-equivalent value per model. My
  history: **$8.4k of API-equivalent work in 30 days** on a Max plan. That
  stat alone was worth the install
- **A flight recorder** — full timeline replay of any session with the diffs
  inline and jump-to-error

Fully local (binds 127.0.0.1, zero network calls, no account), zero npm
dependencies, and there's a `--demo` mode if you want to poke at it before
pointing it at your real transcripts.

The meta moment: mid-build, it opened its own dashboard and saw itself —
`● running · revolution · 17 files · $28`. The flight recorder's first
flight was recording itself.

Free while it's new; $29 founding license on the honor system if it sticks.
Happy to answer anything about the tool or the overnight experiment.

---
Post to r/ClaudeAI first; r/LocalLLaMA angle ("100% local agent observability")
a few days later with a different title. Follow sub self-promo rules; lead
with the experiment, not the product.
