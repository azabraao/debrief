'use strict';
// Model pricing in USD per million tokens, from Anthropic's published list prices
// (platform.claude.com/docs/en/about-claude/pricing, fetched 2026-08-18).
// Debrief reports *API-equivalent value*: what the usage would cost at list price.
// For subscription (Pro/Max) users that's the value the plan delivered, not a bill.
//
// [input, output, cacheWrite5m, cacheWrite1h, cacheRead]
const PRICES = {
  'claude-fable-5':    [10, 50, 12.5, 20, 1],
  'claude-mythos-5':   [10, 50, 12.5, 20, 1],
  'claude-opus-5':     [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-8':   [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-7':   [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-6':   [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-5':   [5, 25, 6.25, 10, 0.5],
  'claude-opus-4-1':   [15, 75, 18.75, 30, 1.5],
  'claude-opus-4':     [15, 75, 18.75, 30, 1.5],
  'claude-sonnet-5':   [2, 10, 2.5, 4, 0.2],
  'claude-sonnet-4-6': [3, 15, 3.75, 6, 0.3],
  'claude-sonnet-4-5': [3, 15, 3.75, 6, 0.3],
  'claude-sonnet-4':   [3, 15, 3.75, 6, 0.3],
  'claude-haiku-4-5':  [1, 5, 1.25, 2, 0.1],
  'claude-haiku-3-5':  [0.8, 4, 1, 1.6, 0.08],
  'claude-3-5-haiku':  [0.8, 4, 1, 1.6, 0.08],
  'claude-3-5-sonnet': [3, 15, 3.75, 6, 0.3],
  'claude-3-7-sonnet': [3, 15, 3.75, 6, 0.3],
  'claude-3-opus':     [15, 75, 18.75, 30, 1.5],
};

// Fast mode (research preview) reprices Opus 5 / 4.8 input+output; cache
// multipliers stack on the fast input price.
const FAST_PRICES = {
  'claude-opus-5':   [10, 50, 12.5, 20, 1],
  'claude-opus-4-8': [10, 50, 12.5, 20, 1],
};

const resolveCache = new Map();

// Longest-prefix match so dated ids like claude-opus-4-5-20251101 resolve.
function resolveModel(model) {
  if (!model) return null;
  if (resolveCache.has(model)) return resolveCache.get(model);
  let best = null;
  for (const key of Object.keys(PRICES)) {
    if (model === key || model.startsWith(key + '-') || model.startsWith(key + '@')) {
      if (!best || key.length > best.length) best = key;
    }
  }
  resolveCache.set(model, best);
  return best;
}

// tokens: {input, output, cacheW5m, cacheW1h, cacheW, cacheRead}, speed: 'standard'|'fast'
// Returns USD, or null when the model is unknown (caller shows tokens without a price).
function costUSD(model, tokens, speed) {
  const key = resolveModel(model);
  if (!key) return null;
  const p = (speed === 'fast' && FAST_PRICES[key]) || PRICES[key];
  const [inP, outP, w5, w1h, read] = p;
  const M = 1e6;
  return (
    (tokens.input || 0) * inP / M +
    (tokens.output || 0) * outP / M +
    (tokens.cacheW5m || 0) * w5 / M +
    (tokens.cacheW1h || 0) * w1h / M +
    (tokens.cacheW || 0) * w5 / M + // TTL unknown: price at the cheaper 5m rate
    (tokens.cacheRead || 0) * read / M
  );
}

// Short display name: "claude-opus-4-8" -> "Opus 4.8", "claude-fable-5" -> "Fable 5"
function displayModel(model) {
  if (!model) return 'unknown';
  const m = model.replace(/^claude-/, '').replace(/-(\d{8})$/, '').replace(/@.*$/, '');
  const parts = m.split('-');
  const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const ver = parts.slice(1).join('.');
  return ver ? `${name} ${ver}` : name;
}

module.exports = { PRICES, resolveModel, costUSD, displayModel };
