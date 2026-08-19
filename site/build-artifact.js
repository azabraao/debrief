'use strict';
// Builds site/artifact.html — the self-contained artifact-ready variant of the
// landing page: outer document shell stripped (the artifact host provides it),
// images inlined as data URIs (the artifact CSP blocks external assets).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const head = src.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = src.match(/<body>([\s\S]*?)<\/body>/)[1];
// Keep title, font links, and style from head; drop charset/viewport/meta/icon
// (host supplies those).
const keep = [];
const title = head.match(/<title>[\s\S]*?<\/title>/); if (title) keep.push(title[0]);
for (const m of head.matchAll(/<link[^>]+fonts[^>]*>/g)) keep.push(m[0]);
const style = head.match(/<style>[\s\S]*?<\/style>/); if (style) keep.push(style[0]);

let out = keep.join('\n') + '\n' + body;
out = out.replace(/src="assets\/([^"]+)"/g, (_, file) => {
  const buf = fs.readFileSync(path.join(__dirname, 'assets', file));
  return `src="data:image/jpeg;base64,${buf.toString('base64')}"`;
});
fs.writeFileSync(path.join(__dirname, 'artifact.html'), out);
console.log('site/artifact.html:', (out.length / 1024).toFixed(0) + 'KB');
