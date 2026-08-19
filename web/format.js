// Shared formatting for the Debrief UI.
export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function money(v) {
  if (v == null) return '—';
  if (v >= 1000) return '$' + Math.round(v).toLocaleString('en-US');
  if (v >= 100) return '$' + v.toFixed(0);
  return '$' + v.toFixed(2);
}

export function tokens(n) {
  n = n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

export function dur(ms) {
  if (!ms || ms < 60000) return ms ? Math.max(1, Math.round(ms / 1000)) + 's' : '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function clock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function day(ms) {
  return new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function dayShort(ms) {
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ago(ms) {
  const d = Date.now() - ms;
  if (d < 90e3) return 'just now';
  if (d < 3600e3) return Math.round(d / 60e3) + 'm ago';
  if (d < 86400e3) return Math.round(d / 3600e3) + 'h ago';
  return Math.round(d / 86400e3) + 'd ago';
}

// Fixed model → categorical slot (color follows the entity, never rank).
// Exact ids first so two versions of one family never share a color; family
// fallback covers ids we haven't seen yet.
const MODEL_ID_SLOT = {
  'opus-5': 1, 'sonnet-5': 2, 'fable-5': 3, 'haiku-4-5': 4,
  'opus-4-8': 5, 'sonnet-4-6': 6, 'opus-4-7': 7, 'opus-4-6': 7, 'mythos-5': 8,
};
const MODEL_FAMILY_SLOT = { opus: 1, sonnet: 2, fable: 3, haiku: 4, mythos: 8 };
export function modelSlot(model) {
  const m = String(model || '').toLowerCase();
  for (const k of Object.keys(MODEL_ID_SLOT)) if (m.includes(k)) return MODEL_ID_SLOT[k];
  for (const k of Object.keys(MODEL_FAMILY_SLOT)) if (m.includes(k)) return MODEL_FAMILY_SLOT[k];
  return 8;
}

// "mcp__claude-in-chrome__computer" → "chrome:computer"
const TOOL_LABEL = {
  AskUserQuestion: 'question', NotebookEdit: 'notebook', WebFetch: 'fetch',
  WebSearch: 'search', TodoWrite: 'tasks', ToolSearch: 'toolsearch',
};
export function shortTool(name) {
  if (TOOL_LABEL[name]) return TOOL_LABEL[name];
  const m = /^mcp__(.+?)__(.+)$/.exec(String(name || ''));
  if (!m) return name;
  const server = m[1].replace(/^claude[-_]?(ai[-_]?)?(in[-_]?)?/, '').replace(/^plugin_/, '').split(/[_-]/)[0];
  return `${server}:${m[2]}`;
}
export const slotVar = (n) => `var(--s${n})`;

export function displayModel(model) {
  if (!model) return 'unknown';
  const m = String(model).replace(/^claude-/, '').replace(/-(\d{8})$/, '').replace(/@.*$/, '');
  const parts = m.split('-');
  const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const ver = parts.slice(1).join('.');
  return ver ? `${name} ${ver}` : name;
}
