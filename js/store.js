// Data layer (browser): everything is saved in this browser on this device (localStorage).
import { BRAND } from './brand.js';
// Each brand keeps its data under its own key, so two brands never mix data — even on the same website.
const K = BRAND.id + ':';
function read(k, fallback) { try { const v = localStorage.getItem(K + k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function write(k, v) {
  const s = JSON.stringify(v);
  try { localStorage.setItem(K + k, s); return true; }
  catch { // storage full: drop old email bodies and old snapshots, then retry
    if (k === 'db') shrink();
    pruneSnapshots(10);
    try { localStorage.setItem(K + k, JSON.stringify(v)); return true; } catch (e) { console.warn('Storage full', e); return false; }
  }
}

const DEFAULT_SETTINGS = {
  name: '', briefTime: '06:00', days: [true, true, true, true, true, true, true], length: 'standard',
  liveMinutes: 15, autoGoogle: true, workStart: '09:00', workEnd: '18:00', morningMeans: '09:00', importantPeople: [],
  rules: [{ id: 'r1', type: 'due_within', value: '24', on: true }, { id: 'r2', type: 'ignore_promotions', value: '', on: true }]
};

export const config = read('config', {});
config.google ??= {};
config.anthropic ??= {};
config.settings = { ...DEFAULT_SETTINGS, ...(config.settings || {}) };
export function saveConfig() { write('config', config); }

const EMPTY_DB = () => ({
  messages: {}, events: {}, tasks: {}, documents: {}, commitments: {}, decisions: {},
  people: {}, projects: {}, hidden: {}, processed: { classify: {}, commit: {} },
  sync: {}, runs: [], chat: [], insights: {}, live: [], focus: null, meta: { demo: false }
});
export const db = Object.assign(EMPTY_DB(), read('db', {}));
for (const [k, v] of Object.entries(EMPTY_DB())) if (db[k] === undefined) db[k] = v;

function shrink() {
  const week = Date.now() - 7 * 86400000;
  for (const m of Object.values(db.messages)) if (new Date(m.date) < week && m.body) m.body = m.body.slice(0, 300);
  db.runs = db.runs.slice(0, 10);
  db.insights.prep = {};
}
let timer = null;
export function saveDb(now = false) {
  if (now) { clearTimeout(timer); timer = null; write('db', db); return; }
  if (timer) return;
  timer = setTimeout(() => { timer = null; write('db', db); }, 300);
}
addEventListener('pagehide', () => saveDb(true));
export function resetDb() {
  const keep = db.projects;
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, EMPTY_DB(), { projects: keep });
  for (const d of listSnapshotDates()) localStorage.removeItem(K + 'snap:' + d);
  saveDb(true);
}

// ---- daily snapshots ----
export function listSnapshotDates() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(K + 'snap:')) out.push(k.slice((K + 'snap:').length)); }
  return out.sort();
}
function pruneSnapshots(keep) { const d = listSnapshotDates(); for (const x of d.slice(0, Math.max(0, d.length - keep))) localStorage.removeItem(K + 'snap:' + x); }
export function writeSnapshot(s) { write('snap:' + s.date, s); pruneSnapshots(35); }
export function readSnapshot(date) { return read('snap:' + date, null); }
export function previousSnapshot(before) { const d = listSnapshotDates().filter((x) => x < before); return d.length ? readSnapshot(d[d.length - 1]) : null; }
export function uid(p = 'x') { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function storageUsedKB() { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(K)) n += (localStorage.getItem(k) || '').length; } return Math.round(n / 1024); }
