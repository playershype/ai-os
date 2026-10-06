// The morning pipeline and live updates.
// CONNECTORS → INGEST → NORMALIZE → DEDUPLICATE → ENTITY RESOLUTION → CONTEXT GRAPH → COMMITMENTS
// → CHANGE DETECTION → PRIORITIZATION → RISKS → MEETING PREP → MORNING BRIEF → DAILY SNAPSHOT → DASHBOARD
import { db, config, saveDb, writeSnapshot, previousSnapshot, uid } from './store.js';
import { dateKey, parseHM, addDays, startOfDay, fmtTime } from './dates.js';
import { syncGoogle, syncDemo } from './connectors.js';
import { isConnected, tokenValid } from './google.js';
import { resolvePeople, linkProjects, triageEmail, extractCommitments } from './core.js';
import { computePriorities, computeTimeline, computePulse, computeRisks, buildSnapshot, detectChanges, eventsOnDay, needsPrep, relatedToEvent } from './plan.js';
import { generateBrief } from './assist.js';
import { L, P } from './i18n.js';

let current = null;
export const runState = () => (current ? { running: true, type: current.run.type, stage: current.stage, startedAt: current.run.startedAt } : { running: false });
export const hasSources = () => db.meta.demo || isConnected();

export function runPipeline(type = 'manual') {
  if (current) return current.promise;
  const run = { id: uid('run'), type, startedAt: new Date().toISOString(), stages: [], status: 'running' };
  current = { run, stage: 'Starting' };
  dispatchEvent(new CustomEvent('aios-run', { detail: 'start' }));
  current.promise = execute(run).catch((e) => { run.status = 'failed'; run.error = e.message; console.error('[pipeline]', e); })
    .finally(() => { run.finishedAt = new Date().toISOString(); db.runs.unshift(run); db.runs = db.runs.slice(0, 40); saveDb(true); current = null; dispatchEvent(new CustomEvent('aios-run', { detail: 'end' })); });
  return current.promise;
}

function dedupeTasks() {
  const key = (t) => t.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const seen = {}; let merged = 0;
  const pref = { native: 0, gtasks: 1, demo: 2 };
  const list = Object.values(db.tasks).filter((t) => t.status !== 'done').sort((a, b) => (pref[a.source] ?? 9) - (pref[b.source] ?? 9));
  for (const t of list) {
    delete t.duplicateOf;
    const k = key(t); if (!k) continue;
    if (seen[k] && seen[k].source !== t.source) { t.duplicateOf = seen[k].id; (seen[k].alsoIn ||= []).includes(t.source) || seen[k].alsoIn.push(t.source); merged++; } else seen[k] = t;
  }
  return merged;
}

async function execute(run) {
  const live = run.type === 'live';
  const stage = async (name, fn) => {
    current.stage = name; const t0 = Date.now();
    try { const r = await fn(); run.stages.push({ name, status: r?.status || 'ok', detail: r?.detail ?? String(r ?? ''), ms: Date.now() - t0 }); return r; }
    catch (e) { run.stages.push({ name, status: 'failed', detail: e.message, ms: Date.now() - t0 }); console.error(`[pipeline] ${name}:`, e); return null; }
  };
  await stage(L('Connectors', 'Conectores'), async () => {
    if (db.meta.demo) { await syncDemo(); }
    else if (isConnected()) { await syncGoogle({ full: !live }); }
    else return { status: 'skipped', detail: L('No accounts connected', 'No hay cuentas conectadas') };
    const s = Object.values(db.sync); const ok = s.filter((x) => x.status === 'ok').length;
    return { status: ok === s.length ? 'ok' : 'partial', detail: L(`${ok} of ${s.length} sources responded`, `${ok} de ${s.length} fuentes respondieron`) + (ok < s.length ? ` · ${s.filter((x) => x.status !== 'ok').map((x) => x.label).join(', ')} ` + L('kept from last sync', 'se mantiene de la última sincronización') : '') };
  });
  await stage(L('Normalize & deduplicate', 'Normalizar y quitar duplicados'), () => { const n = dedupeTasks(); return { detail: [P(Object.keys(db.messages).length, 'message', 'messages', 'mensaje', 'mensajes'), P(Object.keys(db.events).length, 'event', 'events', 'evento', 'eventos'), P(Object.keys(db.tasks).length, 'task', 'tasks', 'tarea', 'tareas'), P(n, 'duplicate merged', 'duplicates merged', 'duplicado unido', 'duplicados unidos')].join(' · ') }; });
  await stage(L('Entity resolution', 'Identificar personas'), () => ({ detail: P(resolvePeople(), 'person', 'people', 'persona', 'personas') }));
  await stage(L('Context graph', 'Mapa de relaciones'), () => { linkProjects(); const n = [...Object.values(db.messages), ...Object.values(db.events), ...Object.values(db.tasks), ...Object.values(db.documents)].filter((x) => x.project).length; return { detail: L(`${n} items linked to ${Object.keys(db.projects).length} projects`, `${n} elementos vinculados a ${Object.keys(db.projects).length} proyectos`) }; });
  await stage(L('Email triage', 'Clasificar correo'), async () => { const r = await triageEmail({ allowAi: true }); return { status: r.aiError ? 'partial' : 'ok', detail: Object.entries(r.counts).map(([k, v]) => `${v} ${({ needs_reply: L('need reply', 'por responder'), waiting_on: L('waiting on', 'en espera'), important: L('important', 'importantes'), fyi: L('FYI', 'informativos'), noise: L('noise', 'ruido') })[k] || k}`).join(' · ') + (r.aiError ? ` · ${L('AI', 'IA')}: ${r.aiError}` : r.aiCount ? ` · ${r.aiCount} ${L('by AI', 'con IA')}` : '') }; });
  await stage(L('Commitment extraction', 'Detectar compromisos'), async () => { const r = await extractCommitments({ allowAi: true }); linkProjects(); return { status: r.aiError ? 'partial' : 'ok', detail: L(`${r.found} new · ${Object.values(db.commitments).filter((c) => c.status === 'open').length} open`, `${r.found} nuevos · ${Object.values(db.commitments).filter((c) => c.status === 'open').length} abiertos`) + (r.aiError ? ` · ${L('AI', 'IA')}: ${r.aiError}` : '') }; });

  const now = new Date();
  const prev = previousSnapshot(dateKey(now));
  let changes = db.insights.changes || [];
  if (!live) changes = (await stage(L('Change detection', 'Detectar cambios'), () => { const c = detectChanges(prev, now); return { detail: L(`${c.length} meaningful changes vs ${prev ? prev.date : 'no previous snapshot'}`, `${c.length} cambios importantes vs ${prev ? prev.date : 'sin foto anterior'}`), changes: c }; }))?.changes || [];
  const priorities = (await stage(L('Prioritization', 'Priorizar'), () => { const p = computePriorities(now); return { detail: P(p.length, 'priority', 'priorities', 'prioridad', 'prioridades'), p }; }))?.p || [];
  const timeline = computeTimeline(now, priorities);
  const pulse = computePulse(now);
  const risks = (await stage(L('Risk detection', 'Detectar riesgos'), () => { const r = computeRisks(now, pulse, timeline); return { detail: P(r.length, 'risk', 'risks', 'riesgo', 'riesgos') + ' · ' + P(timeline.issues.length, 'schedule issue', 'schedule issues', 'problema de agenda', 'problemas de agenda'), r }; }))?.r || [];
  await stage(L('Meeting preparation', 'Preparar reuniones'), () => { const m = eventsOnDay(now).filter((e) => new Date(e.start) > now && needsPrep(e)); for (const e of m) relatedToEvent(e, now); return { detail: L(`${P(m.length, 'meeting', 'meetings', '', '')} ready for “Prep me”`, `${P(m.length, '', '', 'reunión lista', 'reuniones listas')} para “Prepárame”`) }; });

  const prevBrief = db.insights.brief;
  Object.assign(db.insights, { priorities, timeline, pulse, risks, changes, computedAt: now.toISOString() });
  if (live && prevBrief) {
    const since = new Date(prevBrief.generatedAt);
    const fresh = Object.values(db.messages).filter((m) => !m.isSent && new Date(m.date) > since && ['needs_reply', 'important'].includes(m.triage?.category));
    db.live = fresh.map((m) => ({ id: m.id, text: `${m.from.name}: ${m.subject}`, at: m.date, level: m.triage.importance === 'high' ? 'warn' : 'info' })).slice(-12);
  } else {
    const brief = await stage(L('Morning brief', 'Resumen matutino'), async () => { const b = await generateBrief({ now, priorities, timeline, pulse, risks, changes }); return { status: b.aiError ? 'partial' : 'ok', detail: P(b.items.length, 'insight', 'insights', 'punto', 'puntos') + ' · ' + (b.basis === 'ai' ? L('written by AI', 'escrito por IA') : L('built-in rules', 'reglas integradas')) + (b.aiError ? ` · ${L('AI', 'IA')}: ` + b.aiError : ''), b }; });
    if (brief?.b) {
      db.insights.brief = brief.b;
      for (const p of priorities) if (brief.b.nextSteps?.[p.id]) { p.next = String(brief.b.nextSteps[p.id]).slice(0, 240); p.nextBasis = 'ai'; }
    }
    db.live = [];
    await stage(L('Daily snapshot', 'Foto del día'), () => { const s = buildSnapshot(now, priorities, pulse, risks); writeSnapshot(s); return { detail: L(`Saved ${s.date}`, `Guardada ${s.date}`) }; });
    if (run.type === 'morning' || !db.meta.lastBriefDate || db.meta.lastBriefDate !== dateKey(now)) { db.meta.lastBriefDate = dateKey(now); db.meta.briefReadyAt = now.toISOString(); }
  }
  run.status = run.stages.some((s) => s.status === 'failed') ? 'failed' : run.stages.some((s) => s.status === 'partial') ? 'partial' : 'ok';
}

// ---------- scheduler (runs while the app is open; phones can't run apps in the background) ----------
export function nextMorningRun(from = new Date()) {
  const s = config.settings; const { h, m } = parseHM(s.briefTime);
  for (let i = 0; i < 8; i++) {
    const d = addDays(startOfDay(from), i); d.setHours(h, m, 0, 0);
    if (d > from && s.days[d.getDay()]) return d;
  }
  return null;
}
export function schedulerTick() {
  if (!hasSources() || current) return;
  if (!db.meta.demo && !tokenValid()) return;
  const now = new Date(); const s = config.settings;
  const { h, m } = parseHM(s.briefTime);
  const due = new Date(now); due.setHours(h, m, 0, 0);
  if (s.days[now.getDay()] && now >= due && db.meta.lastBriefDate !== dateKey(now)) { runPipeline('morning'); return; }
  if (!db.meta.lastBriefDate) { runPipeline('manual'); return; }
  const last = db.runs[0]?.finishedAt;
  if (!last || Date.now() - new Date(last) > (Number(s.liveMinutes) || 15) * 60000) runPipeline('live');
}
export function startScheduler() {
  setInterval(schedulerTick, 30000);
  setTimeout(schedulerTick, 300);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedulerTick(); });
}
