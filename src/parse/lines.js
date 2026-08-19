'use strict';
// Streaming JSONL reader + shared field helpers for Claude Code transcripts.
// Every field is optional; malformed lines are surfaced as {__bad: true}.
const fs = require('fs');
const readline = require('readline');

async function* readLines(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const raw of rl) {
    if (!raw || raw.charCodeAt(0) !== 123 /* '{' */) {
      if (raw && raw.trim()) yield { __bad: true };
      continue;
    }
    try {
      yield JSON.parse(raw);
    } catch {
      yield { __bad: true };
    }
  }
}

function contentBlocks(line) {
  const c = line.message && line.message.content;
  return Array.isArray(c) ? c : [];
}

// A "real" user prompt: string content (or text blocks) that isn't harness metadata.
// Pass sidechainOk when parsing subagent transcripts, where every line is a sidechain.
function userPromptText(line, sidechainOk) {
  if (line.isMeta || (line.isSidechain && !sidechainOk)) return null;
  const c = line.message && line.message.content;
  let text = null;
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) {
    if (c.some((b) => b && b.type === 'tool_result')) return null;
    const parts = c.filter((b) => b && b.type === 'text' && typeof b.text === 'string');
    if (parts.length) text = parts.map((b) => b.text).join('\n');
  }
  if (!text) return null;
  const stripped = stripHarnessMarkup(text);
  return stripped ? stripped : null;
}

// Removes <system-reminder>, command wrappers, and caveat blocks. Returns '' if
// nothing user-authored remains. Slash commands come back as "/name args".
function stripHarnessMarkup(text) {
  let t = text;
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  t = t.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '');
  t = t.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '');
  t = t.replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '');
  t = t.replace(/<task-reminder>[\s\S]*?<\/task-reminder>/g, '');
  const cmd = /<command-name>([\s\S]*?)<\/command-name>/.exec(t);
  const cmdArgs = /<command-args>([\s\S]*?)<\/command-args>/.exec(t);
  if (cmd) {
    t = t.replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
      .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
      .replace(/<command-args>[\s\S]*?<\/command-args>/g, '');
    const name = cmd[1].trim();
    const args = cmdArgs ? cmdArgs[1].trim() : '';
    const rest = t.trim();
    const slash = (name.startsWith('/') ? name : '/' + name) + (args ? ' ' + args : '');
    return rest ? slash + '\n' + rest : slash;
  }
  return t.trim();
}

function truncate(s, n) {
  if (typeof s !== 'string') return s == null ? '' : String(s).slice(0, n);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// tool_result content can be a string or an array of {type:'text'|'image'} blocks.
function resultText(block) {
  const c = block && block.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => (b && b.type === 'text' ? b.text : b && b.type === 'image' ? '[image]' : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

const TEST_CMD = /\b(npm (?:run )?test|npx (?:vitest|jest|playwright|mocha)|yarn test|pnpm test|vitest|jest|pytest|go test|cargo test|rspec|phpunit|mix test|dotnet test|node --test)\b/;
const COMMIT_CMD = /\bgit\b[^\n|;&]*\bcommit\b/;
const PUSH_CMD = /\bgit\b[^\n|;&]*\bpush\b/;
const INSTALL_CMD = /\b(npm (?:i|install|ci)|yarn(?: install)?|pnpm (?:i|install)|pip install|poetry (?:install|add)|bundle install|cargo add|brew install)\b/;

function classifyCommand(cmd) {
  if (!cmd) return 'other';
  if (COMMIT_CMD.test(cmd)) return 'commit';
  if (PUSH_CMD.test(cmd)) return 'push';
  if (TEST_CMD.test(cmd)) return 'test';
  if (INSTALL_CMD.test(cmd)) return 'install';
  return 'other';
}

// "[main 1a2b3c4] message" from git commit stdout.
function parseCommit(stdout) {
  const m = /\[([^\s\]]+)[^\]]*?\s([0-9a-f]{7,40})\]\s*(.*)/.exec(stdout || '');
  if (!m) return null;
  return { branch: m[1], hash: m[2].slice(0, 7), message: truncate((m[3] || '').trim(), 120) };
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);
const SPAWN_TOOLS = new Set(['Task', 'Agent']);

module.exports = {
  readLines, contentBlocks, userPromptText, stripHarnessMarkup, truncate, resultText,
  classifyCommand, parseCommit, EDIT_TOOLS, SPAWN_TOOLS,
};
