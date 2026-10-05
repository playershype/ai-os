// Connectors: fetch from each source and normalize into the unified model.
// Rule: a failing connector never erases data that was previously synced.
import * as G from './google.js';
import { db, config } from './store.js';
import { DAY, startOfDay, addDays } from './dates.js';
import { demoData } from './demo.js';

// ---------- helpers ----------
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
export const decodeEntities = (s) => String(s || '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]);
const header = (p, name) => (p?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
export function parseAddr(s) {
  s = String(s || '').trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || m[2], email: m[2].trim().toLowerCase() };
  return { name: s, email: s.toLowerCase() };
}
export function parseAddrList(s) {
  const out = []; let cur = ''; let q = false;
  for (const ch of String(s || '')) { if (ch === '"') q = !q; if (ch === ',' && !q) { if (cur.trim()) out.push(parseAddr(cur)); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(parseAddr(cur));
  return out;
}
const b64 = (d) => { try { const bin = atob(String(d || '').replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); } catch { return ''; } };
function findPart(p, type) {
  if (!p) return null;
  if (p.mimeType === type && p.body?.data) return p.body.data;
  for (const c of p.parts || []) { const r = findPart(c, type); if (r) return r; }
  return null;
}
const stripHtml = (h) => decodeEntities(String(h).replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr)>/gi, '\n').replace(/<[^>]+>/g, ' '));
export function cleanBody(t) {
  t = String(t || '').replace(/\r/g, '');
  const cut = t.search(/^(On .{5,200}wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+\nSent: )/m);
  if (cut > 0) t = t.slice(0, cut);
  t = t.split('\n').filter((l) => !l.startsWith('>')).join('\n');
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000);
}
function bodyOf(payload) {
  const plain = findPart(payload, 'text/plain');
  if (plain) return cleanBody(b64(plain));
  const html = findPart(payload, 'text/html');
  return html ? cleanBody(stripHtml(b64(html))) : '';
}

export function normalizeGmail(m) {
  const p = m.payload || {};
  const labels = m.labelIds || [];
  return {
    id: 'gm_' + m.id, source: 'gmail', sourceId: m.id, threadId: m.threadId,
    from: parseAddr(header(p, 'From')), to: parseAddrList(header(p, 'To')), cc: parseAddrList(header(p, 'Cc')),
    subject: header(p, 'Subject') || '(no subject)', snippet: decodeEntities(m.snippet), body: bodyOf(p),
    date: new Date(Number(m.internalDate)).toISOString(), labels,
    isSent: labels.includes('SENT'), inInbox: labels.includes('INBOX'), isUnread: labels.includes('UNREAD'),
    bulk: !!header(p, 'List-Unsubscribe') || /^(no-?reply|notifications?|news(letter)?|mailer|updates?)@/i.test(parseAddr(header(p, 'From')).email),
    link: `https://mail.google.com/mail/u/0/#all/${m.threadId}`, syncedAt: new Date().toISOString()
  };
}
export function normalizeEvent(e) {
  const allDay = !!e.start?.date;
  const start = allDay ? new Date(e.start.date + 'T00:00:00') : new Date(e.start?.dateTime);
  const end = allDay ? new Date(e.end.date + 'T00:00:00') : new Date(e.end?.dateTime);
  const self = (e.attendees || []).find((a) => a.self);
  return {
    id: 'gc_' + e.id, source: 'gcal', sourceId: e.id, title: e.summary || '(no title)', start: start.toISOString(), end: end.toISOString(), allDay,
    location: e.location || '', meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.find((x) => x.entryPointType === 'video')?.uri || '',
    description: stripHtml(e.description || '').slice(0, 1500),
    attendees: (e.attendees || []).filter((a) => !a.resource).map((a) => ({ email: (a.email || '').toLowerCase(), name: a.displayName || a.email, self: !!a.self, organizer: !!a.organizer, response: a.responseStatus })),
    organizer: e.organizer?.email || '', myResponse: self?.responseStatus || 'accepted', busy: e.transparency !== 'transparent',
    status: e.status, link: e.htmlLink, recurringId: e.recurringEventId || null, created: e.created, updated: e.updated
  };
}
export function normalizeDoc(f) {
  return {
    id: 'gd_' + f.id, source: 'gdrive', sourceId: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime,
    modifiedBy: f.lastModifyingUser?.displayName || '', modifiedByMe: !!f.lastModifyingUser?.me, link: f.webViewLink
  };
}
export function normalizeGTask(t) {
  return {
    id: 'gt_' + t.id, source: 'gtasks', sourceId: t.id, title: t.title || '(untitled)', notes: t.notes || '', list: t.listTitle,
    due: t.due ? new Date(t.due.slice(0, 10) + 'T23:59:00').toISOString() : null, dueHasTime: false,
    status: t.status === 'completed' ? 'done' : 'open', completedAt: t.completed || null, priority: 'normal', link: t.webViewLink || 'https://tasks.google.com/'
  };
}

// ---------- sync bookkeeping ----------
async function syncSource(name, label, fn) {
  const s = (db.sync[name] ||= { label });
  s.label = label; s.lastAttempt = new Date().toISOString();
  try {
    const n = await fn();
    Object.assign(s, { status: 'ok', lastSuccess: new Date().toISOString(), records: n, error: null });
  } catch (e) {
    Object.assign(s, { status: e instanceof G.ReconnectNeeded ? 'reconnect' : 'failed', error: e.message });
  }
  return s;
}

function pruneOld() {
  const cutoff = Date.now() - 35 * DAY;
  for (const [id, m] of Object.entries(db.messages)) if (new Date(m.date) < cutoff) delete db.messages[id];
  for (const [id, d] of Object.entries(db.documents)) if (new Date(d.modifiedTime) < cutoff) delete db.documents[id];
}

export async function syncGoogle({ full }) {
  const now = new Date();
  const res = {};
  res.gmail = await syncSource('gmail', 'Gmail', async () => {
    const inbox = await G.gmailList(`in:inbox newer_than:${full ? 4 : 1}d`, full ? 80 : 30);
    const sent = await G.gmailList(`in:sent newer_than:${full ? 10 : 2}d`, full ? 40 : 15);
    let ids = [...new Set([...inbox, ...sent])];
    if (!full) ids = ids.filter((id) => !db.messages['gm_' + id]);
    const got = await G.pool(ids, 6, G.gmailGet);
    const err = got.find((x) => x?.__error);
    if (err && got.every((x) => x?.__error)) throw err.__error;
    let n = 0;
    for (const m of got) if (m && !m.__error) { const x = normalizeGmail(m); db.messages[x.id] = x; n++; }
    if (full) { // emails archived in Gmail since the last sync count as handled
      const inboxSet = new Set(inbox); const windowStart = Date.now() - 4 * DAY;
      for (const m of Object.values(db.messages)) if (m.source === 'gmail' && !m.isSent && new Date(m.date) > windowStart) m.inInbox = inboxSet.has(m.sourceId);
    }
    return n;
  });
  res.gcal = await syncSource('gcal', 'Google Calendar', async () => {
    const items = await G.calendarEvents(addDays(startOfDay(now), -30), addDays(startOfDay(now), 22));
    for (const id of Object.keys(db.events)) if (db.events[id].source === 'gcal') delete db.events[id];
    let n = 0;
    for (const e of items) { if (e.status === 'cancelled') continue; const x = normalizeEvent(e); db.events[x.id] = x; n++; }
    return n;
  });
  res.gdrive = await syncSource('gdrive', 'Google Drive', async () => {
    const files = await G.driveRecent(new Date(now - (full ? 7 : 1) * DAY));
    for (const f of files) { const x = normalizeDoc(f); db.documents[x.id] = x; }
    return files.length;
  });
  res.gtasks = await syncSource('gtasks', 'Google Tasks', async () => {
    const items = await G.googleTasks();
    const keep = {};
    for (const [id, t] of Object.entries(db.tasks)) if (t.source === 'gtasks') keep[id] = t;
    for (const id of Object.keys(keep)) delete db.tasks[id];
    let n = 0;
    for (const t of items) {
      const x = normalizeGTask(t);
      if (x.status === 'done' && x.completedAt && new Date(x.completedAt) < now - 21 * DAY) continue;
      const prev = keep[x.id];
      if (prev) { x.project = prev.project; x.steps = prev.steps; x.postponed = prev.postponed; }
      db.tasks[x.id] = x; n++;
    }
    return n;
  });
  pruneOld();
  return res;
}

// Demo connector — same pipeline, data clearly marked as DEMO.
export async function syncDemo() {
  const d = demoData(new Date());
  for (const [k, list] of Object.entries({ messages: d.messages, events: d.events, documents: d.documents })) {
    for (const id of Object.keys(db[k])) if (db[k][id].source === 'demo') delete db[k][id];
    for (const x of list) db[k][x.id] = x;
  }
  for (const t of d.tasks) if (!db.tasks[t.id]) db.tasks[t.id] = t;
  for (const p of d.projects) if (!db.projects[p.id]) db.projects[p.id] = p;
  const at = new Date().toISOString();
  db.sync = {
    gmail: { label: 'Gmail (demo)', status: 'ok', lastSuccess: at, lastAttempt: at, records: d.messages.length },
    gcal: { label: 'Google Calendar (demo)', status: 'ok', lastSuccess: at, lastAttempt: at, records: d.events.length },
    gdrive: { label: 'Google Drive (demo)', status: 'ok', lastSuccess: at, lastAttempt: at, records: d.documents.length },
    gtasks: { label: 'Google Tasks (demo)', status: 'failed', lastSuccess: new Date(Date.now() - 15 * 3600000).toISOString(), lastAttempt: at, records: 0, error: 'Demo: simulated outage to show how missing sources are flagged.' }
  };
  return { demo: true };
}

export function clearDemo() {
  for (const k of ['messages', 'events', 'documents', 'tasks', 'commitments', 'decisions', 'projects']) {
    for (const id of Object.keys(db[k])) if (db[k][id].source === 'demo' || db[k][id].demo) delete db[k][id];
  }
}
