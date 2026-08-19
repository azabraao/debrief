# Claude Code transcript format (reverse-engineered)

Debrief parses the on-disk session transcripts written by Claude Code. This document
records what we know about the format, verified against real transcripts from
Claude Code v2.1.220–v2.1.235 (August 2026). The format is not a public API and can
drift between versions — the parser must treat every field as optional and every
unknown line type as skippable.

## Layout

```
~/.claude/projects/
  <project-slug>/                     # cwd with "/" and "." replaced by "-", e.g. -Users-jane-dev-myapp
    <session-uuid>.jsonl              # main session transcript, append-only JSON Lines
    <session-uuid>/
      subagents/
        agent-<id>.jsonl              # Agent-tool subagent transcripts
        workflows/
          wf_<id>/
            agent-<id>.jsonl          # Workflow-spawned agent transcripts
```

A session is "live" if its .jsonl mtime is recent (Debrief uses a 3-minute window).

## Line types (top-level `type` field)

| type | purpose | fields we use |
|---|---|---|
| `user` | user message OR tool result round-trip | `message.content` (string, or array of `tool_result` blocks), `toolUseResult` (structured result), `timestamp`, `uuid`, `parentUuid`, `isMeta`, `isSidechain`, `cwd`, `gitBranch`, `version` |
| `assistant` | one API response | `message.model`, `message.usage`, `message.stop_reason`, `message.content` (array of `text` / `thinking` / `tool_use` blocks), `effort`, `timestamp`, `requestId` |
| `system` | harness events | `subtype` (`turn_duration` w/ `durationMs`, `stop_hook_summary`, `away_summary`, …), `level`, `content`, `timestamp`, `toolUseID` |
| `ai-title` | rolling session title | `aiTitle` (last one wins) |
| `summary` | compaction summary (older format) | `summary`, `leafUuid` |
| `last-prompt` | rolling last user prompt | `lastPrompt` |
| `mode` / `permission-mode` | mode changes | `mode` / `permissionMode` |
| `file-history-snapshot` / `file-history-delta` | file backup tracking | ignored (tool inputs are richer) |
| `attachment`, `bridge-session`, `queue-operation`, `progress`, … | misc | ignored |

## Assistant content blocks

- `{type: "text", text}` — visible reply text.
- `{type: "thinking", thinking, signature}` — reasoning (may be empty string).
- `{type: "tool_use", id, name, input, caller}` — tool call. `input` is the full
  structured argument object (e.g. `Bash.command`, `Edit.file_path/old_string/new_string`,
  `Write.file_path`, `Task/Agent.prompt`). `caller` seen as `{type:"direct"}`.

## usage object (on assistant lines)

```
{ input_tokens, output_tokens,
  cache_creation_input_tokens,          # total cache-write tokens
  cache_read_input_tokens,
  cache_creation: { ephemeral_5m_input_tokens, ephemeral_1h_input_tokens },  # TTL split (newer versions)
  service_tier, speed, inference_geo, ... }
```

Cost estimation: per-model rates × (input, output, cache write 5m/1h, cache read).
When the TTL split is missing, price all `cache_creation_input_tokens` at the 5m rate.

## Tool results

`user` lines that answer a `tool_use` carry:
- `message.content: [{type:"tool_result", tool_use_id, content, is_error?}]`
- `toolUseResult` — structured mirror, shape depends on tool:
  - Bash → `{stdout, stderr, interrupted, isImage, gitOperation?, backgroundTaskId?}`
  - Edit → `{filePath, oldString, newString, structuredPatch, userModified, replaceAll}`
  - Write → `{type: "create"|"update", filePath, content, structuredPatch}`
  - Read → `{type: "text", file}`
  - AskUserQuestion → `{questions, answers, annotations?}`
  - may be a plain string (e.g. some MCP tools), or an array-like object keyed "0","1",…

## Detection heuristics Debrief uses

- **Session title**: last `ai-title` line, else `summary`, else first non-meta user prompt.
- **Waiting on you**: last meaningful event is an `AskUserQuestion` tool_use without a
  following result, or an `end_turn` whose text ends with a question, or a permission
  denial as the final event.
- **Commits**: Bash tool_use whose command contains `git commit` and whose result is not
  an error → parse short hash + message from stdout.
- **Tests**: Bash commands matching test runners (`npm test`, `pytest`, `vitest`, `jest`,
  `go test`, `cargo test`, …); pass/fail from `is_error` + stdout/stderr markers.
- **Errors**: `tool_result.is_error === true`, `system` lines with `level: "error"`,
  or API error markers.
- **Files touched**: union of Edit/Write/NotebookEdit `file_path` inputs (deduped),
  with per-file edit counts.
- **Subagents**: `subagents/agent-*.jsonl` files under the session directory (tokens
  and tool calls from those files roll up into the parent session, flagged as agent work).

All fields must be treated as optional. Malformed lines are counted and skipped.
