// Action layer (browser): the same API the server version had, but running inside the page.
import { config, saveConfig, db, saveDb, resetDb, uid, storageUsedKB } from './store.js';
import * as G from './google.js';
import { aiEnabled, pickModel, usage } from './ai.js';
import { clearDemo } from './connectors.js';
import { RULE_TYPES, commitmentState, myEmail, resolvePeople, triageEmail } from './core.js';
import { openTasks, eventsOnDay, computePriorities, computeTimeline, computePulse, computeRisks } from './plan.js';
import { chat, prepMeeting, parseCapture, draftReply, weekly, weeklySummary, search, visibleTriage, describe } from './assist.js';
import { runPipeline, runState, startScheduler, nextMorningRun, hasSources } from './pipeline.js';
import { BRAND } from './brand.js';
import { L, LOCALE } from './i18n.js';
import { fmtTime, relDay, ago, timeZone, addDays, startOfDay, fmtDay } from './dates.js';

export const VERSION = '1.1.0-web';

// ---------- view model ----------
function recompute() {
  const now = new Date();
  const priorities = computePriorities(now);
  for (const p of priorities) { const old = (db.insights.priorities || []).find((x) => x.id === p.id); if (old?.nextBasis === 'ai') { p.next = old.next; p.nextBasis = 'ai'; } }
  const timeline = computeTimeline(now, priorities); const pulse = computePulse(now);
  Object.assign(db.insights, { priorities, timeline, pulse, risks: computeRisks(now, pulse, timeline), computedAt: now.toISOString() });
}
const projName = (id) => db.projects[id]?.name || null;
function msgView(m, now) {
  const t = m.triage || {};
  return { id: m.id, threadId: m.threadId, from: m.from, to: m.to.slice(0, 3), subject: m.subject, summary: t.summary || m.snippet, category: t.category, importance: t.importance, action: t.action, deadline: t.deadline?.text || null,
    project: projName(m.project), age: ago(m.date, now), date: m.date, link: m.link, basis: t.basis, rule: t.ruleApplied || null, isSent: m.isSent };
}
function commitView(c, now) {
  const st = commitmentState(c, now);
  return { id: c.id, direction: c.direction, person: c.person, what: c.what, quote: c.quote, promised: c.promisedDate ? relDay(c.promisedDate, now) : c.promisedText || null, detected: relDay(c.detectedAt, now), state: st, confidence: c.confidence, project: projName(c.project), link: c.link, source: describe(c.sourceId), sourceId: c.sourceId, basis: c.basis };
}
function stateView() {
  const now = new Date();
  if (!db.insights.computedAt || now - new Date(db.insights.computedAt) > 60000) recompute();
  const ins = db.insights;
  const inbox = {};
  for (const k of ['needs_reply', 'waiting_on', 'important', 'fyi', 'noise']) inbox[k] = visibleTriage(k).map((m) => msgView(m, now));
  const commitments = Object.values(db.commitments).filter((c) => c.status === 'open');
  const order = { overdue: 0, today: 1, open: 2, nodate: 3 };
  const cs = (a, b) => order[commitmentState(a, now).key] - order[commitmentState(b, now).key];
  const tasks = openTasks().sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999'))).map((t) => ({ id: t.id, title: t.title, project: projName(t.project), source: t.source, alsoIn: t.alsoIn || [], due: t.due ? relDay(t.due, now) + (t.dueHasTime ? ' ' + fmtTime(t.due) : '') : null, overdue: !!t.due && new Date(t.due) < now, status: t.status, priority: t.priority, blockedBy: t.blockedBy, link: t.link, editable: t.source === 'native' || t.source === 'demo', postponed: t.postponed || 0 }));
  const upcoming = [];
  for (let i = 1; i <= 10; i++) {
    const d = addDays(startOfDay(now), i);
    const label = d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' });
    for (const e of eventsOnDay(d)) if (!e.allDay && e.attendees.some((a) => !a.self) && (e.attendees.length >= 3 || e.project)) upcoming.push({ date: label, title: e.title, ctx: fmtTime(e.start) + (projName(e.project) ? ' · ' + projName(e.project) : ''), t: e.start });
    for (const t of openTasks()) if (t.due && startOfDay(t.due).getTime() === d.getTime()) upcoming.push({ date: label, title: t.title, ctx: L('deadline', 'plazo') + (projName(t.project) ? ' · ' + projName(t.project) : ''), t: t.due, deadline: true });
  }
  const last = db.runs[0];
  return {
    app: {
      version: VERSION, brand: BRAND, demo: !!db.meta.demo, ai: aiEnabled(), model: config.anthropic.model || null, tz: timeZone(), me: myEmail(), storageKB: storageUsedKB(),
      google: { configured: G.isConfigured(), connected: G.isConnected(), tokenValid: G.tokenValid(), tokenExpires: config.google.token?.expires_at || null, email: config.google.email || null, redirectUri: G.redirectUri(), origin: G.jsOrigin(), clientId: config.google.clientId || '', scopes: config.google.grantedScopes || [], missingScopes: config.google.grantedScopes ? G.SCOPES.filter((s) => !config.google.grantedScopes.includes(s)) : [] },
      settings: config.settings, ruleTypes: RULE_TYPES, onboarded: !!config.onboarded, hasSources: hasSources(), usage
    },
    run: { ...runState(), last: last ? { type: last.type, status: last.status, startedAt: last.startedAt, finishedAt: last.finishedAt, stages: last.stages, error: last.error } : null,
      lastBriefAt: db.insights.brief?.generatedAt || null, briefReadyAt: db.meta.briefReadyAt || null, nextMorning: nextMorningRun()?.toISOString() || null },
    brief: db.insights.brief || null, priorities: ins.priorities || [], timeline: ins.timeline || { items: [], issues: [] }, pulse: ins.pulse || [], risks: ins.risks || [], changes: ins.changes || [], live: db.live || [],
    inbox, commitments: { iOwe: commitments.filter((c) => c.direction === 'i_owe').sort(cs).map((c) => commitView(c, now)), theyOwe: commitments.filter((c) => c.direction === 'they_owe').sort(cs).map((c) => commitView(c, now)) },
    tasks, upcoming: upcoming.sort((a, b) => a.t.localeCompare(b.t)).slice(0, 12),
    sources: Object.entries(db.sync).map(([k, s]) => ({ key: k, ...s })), focus: db.focus && db.focus.active ? focusView(now) : null,
    projects: Object.values(db.projects).map((p) => ({ id: p.id, name: p.name, keywords: p.keywords || [], people: p.people || [], important: !!p.important, owner: p.owner && p.owner !== 'You' ? p.owner : L('You', 'Tú'), demo: !!p.demo })),
    chat: db.chat.slice(-8)
  };
}
function focusView(now) {
  const f = db.focus; const t = db.tasks[f.taskId];
  const next = Object.values(db.events).filter((e) => new Date(e.start) > now && !e.allDay && e.myResponse !== 'declined' && e.attendees.some((a) => !a.self)).sort((a, b) => a.start.localeCompare(b.start))[0];
  const deadline = t?.due ? new Date(t.due) : null;
  const until = [deadline, next ? new Date(next.start) : null].filter((d) => d && d > now).sort((a, b) => a - b)[0];
  const held = Object.values(db.messages).filter((m) => !m.isSent && new Date(m.date) > new Date(f.startedAt) && m.triage && m.triage.category !== 'noise');
  const proj = t?.project;
  return {
    ...f, task: t ? { id: t.id, title: t.title, due: t.due ? relDay(t.due, now) + (t.dueHasTime ? ' ' + fmtTime(t.due) : '') : null, project: projName(proj), link: t.link } : null,
    minutesAvailable: until ? Math.round((until - now) / 60000) : null, untilLabel: until ? fmtTime(until) : null,
    nextMeeting: next ? { title: next.title, when: relDay(next.start, now) + ' ' + fmtTime(next.start), people: next.attendees.filter((a) => !a.self).length } : null,
    documents: proj ? Object.values(db.documents).filter((d) => d.project === proj).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)).slice(0, 4).map((d) => ({ name: d.name, link: d.link, meta: L(`edited ${ago(d.modifiedTime, now)} ago by ${d.modifiedBy}`, `editado hace ${ago(d.modifiedTime, now)} por ${d.modifiedBy}`) })) : [],
    messages: proj ? Object.values(db.messages).filter((m) => m.project === proj && !m.bulk).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((m) => ({ from: m.isSent ? L('You', 'Tú') : m.from.name, text: m.triage?.summary || m.snippet, when: ago(m.date, now), link: m.link })) : [],
    held: held.filter((m) => m.triage.importance !== 'high').map((m) => ({ text: `${m.from.name} — ${m.subject}`, when: ago(m.date, now) })),
    breakthrough: held.filter((m) => m.triage.importance === 'high').map((m) => ({ id: m.id, text: `${m.from.name} — ${m.subject}`, when: ago(m.date, now) }))
  };
}

// ---------- routes ----------
const routes = [];
const on = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

on('GET', '/api/state', () => stateView());
on('POST', '/api/refresh', async (b) => {
  if (!hasSources()) throw new Error(L('Connect Google (or load demo data) first.', 'Primero conecta Google (o carga los datos de demo).'));
  if (!db.meta.demo && !G.tokenValid()) { G.startAuth(location.hash || '#/today'); return { redirecting: true }; }
  const p = runPipeline(b.type === 'live' ? 'live' : 'manual'); if (b.wait) await p; return { ok: true };
});
on('POST', '/api/settings', async (b) => {
  const s = config.settings; const allowed = ['name', 'briefTime', 'days', 'length', 'liveMinutes', 'autoGoogle', 'workStart', 'workEnd', 'morningMeans', 'importantPeople', 'rules'];
  for (const k of allowed) if (b[k] !== undefined) s[k] = b[k];
  if (!/^\d{2}:\d{2}$/.test(s.briefTime)) s.briefTime = '06:00';
  if (!Array.isArray(s.days) || s.days.length !== 7) s.days = [true, true, true, true, true, true, true];
  s.rules = (s.rules || []).filter((r) => RULE_TYPES[r.type]).map((r) => ({ id: r.id || uid('r'), type: r.type, value: String(r.value ?? '').slice(0, 120), on: r.on !== false }));
  if (b.onboarded) config.onboarded = true;
  saveConfig(); db.insights.computedAt = null;
  resolvePeople();
  await triageEmail({ allowAi: false });
  return { ok: true };
});
on('POST', '/api/config/google', (b) => {
  const id = String(b.clientId || '').trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error(L('That Client ID doesn’t look right — it should end with .apps.googleusercontent.com', 'Ese Client ID no parece correcto — debe terminar en .apps.googleusercontent.com'));
  config.google.clientId = id; saveConfig(); return { ok: true };
});
on('POST', '/api/google/connect', (b) => { if (!G.isConfigured()) throw new Error(L('Save your Client ID first.', 'Primero guarda tu Client ID.')); G.startAuth(b.returnTo || location.hash || '#/today', { consent: !!b.consent }); return { redirecting: true }; });
on('POST', '/api/config/anthropic', async (b) => {
  const key = String(b.apiKey ?? '').trim();
  if (!key) { config.anthropic = {}; saveConfig(); return { ok: true, ai: false }; }
  config.anthropic.apiKey = key; config.anthropic.model = ''; saveConfig();
  try { return { ok: true, model: await pickModel(true) }; }
  catch (e) { delete config.anthropic.apiKey; saveConfig(); throw new Error(L('Key not accepted: ', 'Clave no aceptada: ') + e.message); }
});
on('POST', '/api/google/disconnect', () => { G.disconnect(); return { ok: true }; });
on('POST', '/api/demo', async (b) => {
  if (b.on) { if (G.isConnected()) throw new Error(L('Demo data is only available before a real account is connected.', 'Los datos de demo solo están disponibles antes de conectar una cuenta real.')); db.meta.demo = true; }
  else { clearDemo(); db.meta.demo = false; db.sync = {}; db.insights = {}; db.processed = { classify: {}, commit: {} }; db.meta.lastBriefDate = null; }
  saveDb(true);
  if (b.on) await runPipeline('manual');
  return { ok: true };
});
on('POST', '/api/reset', () => { resetDb(); return { ok: true }; });

on('POST', '/api/tasks', (b) => {
  if (!String(b.title || '').trim()) throw new Error(L('A title is required.', 'Falta el título.'));
  let due = null;
  if (b.date) { due = new Date(b.date + 'T' + (b.time || '23:59') + ':00'); if (isNaN(due)) due = null; }
  const t = { id: uid('nt'), source: 'native', sourceId: null, title: String(b.title).trim().slice(0, 200), notes: String(b.notes || '').slice(0, 2000), kind: b.kind || 'task', person: b.person || null,
    due: due ? due.toISOString() : null, dueHasTime: !!(due && b.time), status: 'open', priority: b.priority || 'normal', project: b.project || null, projectManual: !!b.project, createdAt: new Date().toISOString(),
    sourceMessageId: b.sourceMessageId || null, fromCommitment: b.fromCommitment || null, link: b.sourceMessageId ? db.messages[b.sourceMessageId]?.link : null };
  db.tasks[t.id] = t; db.insights.computedAt = null; saveDb(); return t;
});
on('PATCH', '/api/tasks/:id', (b, p) => {
  const t = db.tasks[p.id]; if (!t) throw new Error(L('Task not found', 'Tarea no encontrada'));
  const mine = t.source === 'native' || t.source === 'demo';
  if (b.status && !mine && b.status !== t.status) throw new Error(L('This task lives in Google Tasks — complete it there (this app has read-only access).', 'Esta tarea está en Google Tasks — márcala ahí (esta app solo puede leer).'));
  if (b.status) { t.status = b.status; t.completedAt = b.status === 'done' ? new Date().toISOString() : null; }
  if (b.date !== undefined && mine) { const old = t.due; t.due = b.date ? new Date(b.date + 'T' + (b.time || '23:59') + ':00').toISOString() : null; t.dueHasTime = !!b.time; if (old && t.due && t.due > old) t.postponed = (t.postponed || 0) + 1; }
  if (b.priority) t.priority = b.priority;
  if (b.steps) t.steps = b.steps.slice(0, 20).map((s) => ({ text: String(s.text).slice(0, 200), done: !!s.done }));
  db.insights.computedAt = null; saveDb(); return t;
});
on('POST', '/api/commitments', (b) => {
  const c = { id: uid('cm'), direction: b.direction === 'they_owe' ? 'they_owe' : 'i_owe', person: { name: b.person || 'Someone', email: b.email || '' }, what: String(b.what || '').slice(0, 200), quote: 'Added manually', promisedDate: b.date ? new Date(b.date + 'T23:59:00').toISOString() : null, promisedText: b.date || null, confidence: 'clear', detectedAt: new Date().toISOString(), sourceType: 'manual', sourceId: null, status: 'open', basis: 'manual', project: null };
  if (!c.what) throw new Error(L('Describe the commitment.', 'Describe el compromiso.'));
  db.commitments[c.id] = c; saveDb(); return c;
});
on('POST', '/api/commitments/:id', (b, p) => {
  const c = db.commitments[p.id]; if (!c) throw new Error(L('Not found', 'No encontrado'));
  if (['open', 'done', 'dismissed'].includes(b.status)) { c.status = b.status; c.statusChangedAt = new Date().toISOString(); }
  db.insights.computedAt = null; saveDb(); return c;
});
on('POST', '/api/messages/:id/hide', (b, p) => {
  const m = db.messages[p.id]; if (!m) throw new Error(L('Not found', 'No encontrado'));
  db.hidden[m.threadId] = b.archive ? { archived: true, at: new Date().toISOString() } : { snoozeUntil: new Date(Date.now() + (Number(b.hours) || 24) * 3600000).toISOString() };
  db.insights.computedAt = null; saveDb(); return { ok: true };
});
on('POST', '/api/messages/:id/category', (b, p) => {
  const m = db.messages[p.id]; if (!m?.triage) throw new Error(L('Not found', 'No encontrado'));
  if (!['needs_reply', 'waiting_on', 'important', 'fyi', 'noise'].includes(b.category)) throw new Error('Bad category');
  m.triage.category = b.category; m.triage.ruleApplied = 'you'; db.processed.classify[m.id] = { ...(db.processed.classify[m.id] || m.triage), category: b.category, basis: 'you' };
  db.insights.computedAt = null; saveDb(); return { ok: true };
});
on('POST', '/api/messages/:id/draft', (b, p) => draftReply(p.id));
on('GET', '/api/messages/:id/thread', (b, p) => { const m = db.messages[p.id]; if (!m) throw new Error(L('Not found', 'No encontrado')); return Object.values(db.messages).filter((x) => x.threadId === m.threadId).sort((a, c) => a.date.localeCompare(c.date)).map((x) => ({ from: x.isSent ? L('You', 'Tú') : x.from.name, date: fmtDay(x.date) + ' ' + fmtTime(x.date), text: x.body || x.snippet, subject: x.subject })); });
on('POST', '/api/events/:id/prep', (b, p) => prepMeeting(p.id, { force: !!b.force }));
on('POST', '/api/chat', (b) => { if (!String(b.q || '').trim()) throw new Error(L('Ask something.', 'Escribe una pregunta.')); return chat(String(b.q).slice(0, 1000)); });
on('POST', '/api/chat/clear', () => { db.chat = []; saveDb(); return { ok: true }; });
on('POST', '/api/capture/parse', (b) => parseCapture(String(b.text || '').slice(0, 500)));
on('GET', '/api/search', (b, p, q) => search(q.get('q')));
on('GET', '/api/describe', (b, p, q) => (q.get('ids') || '').split(',').filter(Boolean).slice(0, 20).map((id) => ({ id, ...(describe(id) || { type: 'Item', label: id }) })));
on('GET', '/api/weekly', () => weekly());
on('POST', '/api/weekly/summary', () => weeklySummary());
on('POST', '/api/focus', (b) => {
  if (b.action === 'stop') { db.focus = null; saveDb(); return { ok: true }; }
  if (b.action === 'start') {
    let taskId = b.taskId;
    if (!taskId && b.title) { const t = { id: uid('nt'), source: 'native', title: String(b.title).slice(0, 200), status: 'open', priority: 'high', createdAt: new Date().toISOString(), due: null, dueHasTime: false, project: null }; db.tasks[t.id] = t; taskId = t.id; }
    const t = db.tasks[taskId]; if (!t) throw new Error(L('Pick a task to focus on.', 'Elige una tarea para enfocarte.'));
    db.focus = { active: true, taskId, startedAt: new Date().toISOString(), steps: t.steps || [] }; saveDb(); return { ok: true };
  }
  if (b.action === 'steps' && db.focus) { db.focus.steps = (b.steps || []).slice(0, 20).map((s) => ({ text: String(s.text).slice(0, 200), done: !!s.done })); const t = db.tasks[db.focus.taskId]; if (t) t.steps = db.focus.steps; saveDb(); return { ok: true }; }
  throw new Error('Unknown focus action');
});
on('POST', '/api/projects', (b) => {
  if (b.delete) { delete db.projects[b.id]; for (const k of ['messages', 'events', 'tasks', 'documents', 'commitments']) for (const x of Object.values(db[k])) if (x.project === b.id) x.project = null; saveDb(); return { ok: true }; }
  const name = String(b.name || '').trim(); if (!name) throw new Error(L('Project needs a name.', 'El proyecto necesita un nombre.'));
  const id = b.id && db.projects[b.id] ? b.id : uid('pr');
  db.projects[id] = { ...(db.projects[id] || {}), id, name, keywords: (b.keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 20), people: (b.people || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 20), important: !!b.important, owner: b.owner || 'You' };
  saveDb(); return db.projects[id];
});

// Plain-data copy so the UI can never mutate the data layer by accident.
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
export async function api(path, opts = {}) {
  const method = opts.method || (opts.body ? 'POST' : 'GET');
  const url = new URL(path, 'http://local');
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = url.pathname.match(r.re); if (!m) continue;
    const params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
    const out = await r.fn(opts.body || {}, params, url.searchParams);
    if (method !== 'GET') saveDb();
    return clone(out);
  }
  throw new Error('Not found: ' + path);
}

// Page start: finish Google sign-in if we're returning from it, then start the scheduler.
export async function boot() {
  const res = await G.handleRedirect();
  if (!res?.ok && G.isConfigured() && G.isConnected() && !G.tokenValid() && config.settings.autoGoogle && navigator.onLine && !sessionStorage.getItem(BRAND.id + '-auto-auth') && !res?.error) {
    sessionStorage.setItem(BRAND.id + '-auto-auth', '1'); // only once per visit — never loops
    G.startAuth(location.hash || '#/today');
    return { redirecting: true };
  }
  if (res?.ok && db.meta.demo) { clearDemo(); db.meta.demo = false; db.sync = {}; db.insights = {}; db.processed = { classify: {}, commit: {} }; db.meta.lastBriefDate = null; saveDb(true); }
  startScheduler();
  return res || {};
}
