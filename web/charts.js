// Hand-rolled SVG charts. Specs: bars ≤24px with 4px rounded data-ends and
// square baselines, 2px surface gaps between touching marks, hairline grids,
// text in ink tokens (never series colors), hover tooltips on every mark.
import { esc, money, dur, dayShort } from './format.js';

let tipEl = null;
export function bindTooltips(root) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  root.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tipEl.hidden = true; return; }
    tipEl.innerHTML = t.dataset.tip;
    tipEl.hidden = false;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  });
  root.addEventListener('pointerleave', () => { tipEl.hidden = true; }, true);
}

const NICE = [1, 2, 2.5, 5, 10];
function niceStep(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const n of NICE) if (n * mag >= v) return n * mag;
  return 10 * mag;
}
// Clean ticks: a nice step size yielding 3–5 ticks, and the max they imply.
function niceTicks(maxVal) {
  const step = niceStep(maxVal / 4);
  const ticks = [];
  for (let v = step; v < maxVal * 1.001 + step; v += step) ticks.push(v);
  while (ticks.length > 5) ticks.pop();
  const top = ticks[ticks.length - 1] >= maxVal ? ticks[ticks.length - 1] : ticks[ticks.length - 1] + step;
  if (top > ticks[ticks.length - 1]) ticks.push(top);
  return { ticks, max: top };
}

function roundedTopBar(x, y, w, h, r) {
  if (h <= 0.5 || w <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
function roundedEndHBar(x, y, w, h, r) {
  if (w <= 0.5 || h <= 0) return '';
  r = Math.min(r, h / 2, w);
  return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
}

// Stacked daily columns. series: [{key, color, label}], rows: [{dayMs, values:{key: usd}}]
export function stackedDays(rows, series, { height = 190, fmt = money } = {}) {
  const W = 560, H = height, padL = 44, padR = 8, padT = 12, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const totals = rows.map((r) => series.reduce((a, s) => a + (r.values[s.key] || 0), 0));
  const { ticks, max } = niceTicks(Math.max(...totals, 0.01));
  const n = rows.length;
  const band = iw / Math.max(n, 1);
  const bw = Math.min(24, Math.max(4, band * 0.55));
  const parts = [];
  for (const tv of ticks) {
    const y = padT + ih - (ih * tv) / max;
    parts.push(`<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"/>`);
    parts.push(`<text class="axis-label" x="${padL - 6}" y="${y + 3}" text-anchor="end">${fmt(tv)}</text>`);
  }
  parts.push(`<line x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}" stroke="var(--hairline-strong)" stroke-width="1"/>`);
  const labelEvery = Math.ceil(n / 8);
  rows.forEach((r, i) => {
    const x = padL + band * i + (band - bw) / 2;
    let y = padT + ih;
    const total = totals[i];
    const tip = [`<div class="tt-head">${esc(dayShort(r.dayMs))}</div>`];
    const segs = [];
    series.forEach((s, si) => {
      const v = r.values[s.key] || 0;
      if (v <= 0) return;
      const h = (v / max) * ih;
      const gap = segs.length ? 2 : 0; // 2px surface gap between touching segments
      y -= h;
      segs.push({ s, v, x, y: y + gap, h: Math.max(0, h - gap), top: si === series.length - 1 });
      tip.push(`<div class="row"><i style="background:${s.color}"></i>${esc(s.label)}<span class="v">${fmt(v)}</span></div>`);
    });
    if (total > 0) tip.push(`<div class="row" style="margin-top:3px">total<span class="v">${fmt(total)}</span></div>`);
    segs.forEach((g, gi) => {
      const isTop = gi === segs.length - 1;
      const d = isTop ? roundedTopBar(g.x, g.y, bw, g.h, 4) : `M${g.x},${g.y} h${bw} v${g.h} h${-bw} Z`;
      parts.push(`<path d="${d}" fill="${g.s.color}" data-tip='${tip.join('')}'/>`);
    });
    if (total <= 0) parts.push(`<rect x="${x}" y="${padT + ih - 1}" width="${bw}" height="1" fill="var(--grid)" data-tip='${tip.join('')}'/>`);
    if (i % labelEvery === 0) {
      parts.push(`<text class="axis-label" x="${x + bw / 2}" y="${H - 7}" text-anchor="middle">${esc(dayShort(r.dayMs))}</text>`);
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily totals">${parts.join('')}</svg>`;
}

// Horizontal bars: items [{label, value, color?, tip?}]
export function hbars(items, { fmt = String, color = 'var(--s1)', height = null } = {}) {
  const W = 560, rowH = 26, padL = 4, padR = 60, labelW = 150;
  const H = height || items.length * rowH + 6;
  const iw = W - padL - padR - labelW;
  const max = Math.max(...items.map((i) => i.value), 0.001);
  const parts = [];
  items.forEach((it, i) => {
    const y = 3 + i * rowH;
    const w = Math.max(2, (it.value / max) * iw);
    const c = it.color || color;
    const tip = it.tip || `<div class="row"><i style="background:${c}"></i>${esc(it.label)}<span class="v">${esc(fmt(it.value))}</span></div>`;
    parts.push(`<text class="axis-label" x="${padL + labelW - 10}" y="${y + rowH / 2 + 3}" text-anchor="end">${esc(it.label.length > 20 ? it.label.slice(0, 19) + '…' : it.label)}</text>`);
    parts.push(`<path d="${roundedEndHBar(padL + labelW, y + 5, w, rowH - 12, 4)}" fill="${c}" data-tip='${tip}'/>`);
    parts.push(`<text class="bar-label" x="${padL + labelW + w + 8}" y="${y + rowH / 2 + 3}">${esc(fmt(it.value))}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${parts.join('')}</svg>`;
}

// Hour-of-day activity strip: 24 cells, sequential single-hue (opacity ramp of s1).
export function hourStrip(hist) {
  const W = 560, H = 64, padL = 4, padR = 4, cellGap = 2;
  const cw = (W - padL - padR - cellGap * 23) / 24;
  const max = Math.max(...hist, 1);
  const parts = [];
  hist.forEach((v, h) => {
    const x = padL + h * (cw + cellGap);
    const alpha = v <= 0 ? 0 : 0.15 + 0.85 * (v / max);
    parts.push(`<rect x="${x}" y="8" width="${cw}" height="26" rx="4" fill="var(--s1)" opacity="${v <= 0 ? 0 : alpha.toFixed(2)}" ${v <= 0 ? '' : ''}/>`);
    parts.push(`<rect x="${x}" y="8" width="${cw}" height="26" rx="4" fill="${v <= 0 ? 'var(--surface-3)' : 'transparent'}" data-tip='<div class="row">${String(h).padStart(2, '0')}:00<span class="v">${esc(dur(v))} active</span></div>'/>`);
    if (h % 4 === 0) parts.push(`<text class="axis-label" x="${x}" y="52">${String(h).padStart(2, '0')}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Active time by hour of day">${parts.join('')}</svg>`;
}
