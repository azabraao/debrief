'use strict';
// Launch-week licensing is an honor system: `debrief license <key>` stores the
// key locally and the app says thanks. Keys are format-checked only — real
// signature verification ships once real keys exist. Debrief is fully
// functional either way; paying is how you keep it alive.
const fs = require('fs');
const path = require('path');
const os = require('os');

const FILE = path.join(os.homedir(), '.debrief', 'license.json');
const KEY_RE = /^DBRF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function readLicense() {
  try {
    const l = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (l && KEY_RE.test(l.key)) return { key: l.key, activatedAt: l.activatedAt };
  } catch { /* none */ }
  return null;
}

function saveLicense(key) {
  const k = String(key || '').trim().toUpperCase();
  if (!KEY_RE.test(k)) {
    return { ok: false, error: 'Keys look like DBRF-XXXX-XXXX-XXXX (from your purchase receipt).' };
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ key: k, activatedAt: new Date().toISOString() }, null, 2));
  return { ok: true };
}

module.exports = { readLicense, saveLicense };
