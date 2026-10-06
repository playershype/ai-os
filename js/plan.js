// Intelligence layer, part 2: priorities, timeline, project pulse, change detection, risks, snapshots.
import { db } from './store.js';
import { DAY, startOfDay, endOfDay, addDays, fmtTime, relDay, parseHM, dateKey, ago } from './dates.js';
import { L, P } from './i18n.js';
import { settings, isImportantPerson, isImportantProject, urgentHours, commitmentState, isExternal, isMe, personName } from './core.js';

const projName = (id) => db.projects[id]?.name || null;
const hidden = (m) => { const h = db.hidden[m.threadId]; return !!h && (h.archived || (h.snoozeUntil && new Date(h.snoozeUntil) > new Date())); };
export const openTasks = () => Object.values(db.tasks).filter((t) => t.status !== 'done' && !t.duplicateOf);
const SRC_LABEL = { gmail: 'Gmail', gcal: L('Calendar', 'Calendario'), gdrive: 'Drive', gtasks: 'Google Tasks', native: L('Your tasks', 'Tus tareas'), demo: 'Demo' };

export function eventsOnDay(day) {
  const s = startOfDay(day); const e = endOfDay(day);
  return Object.values(db.events).filter((ev) => new Date(ev.start) <= e && new Date(ev.end) > s && ev.myResponse !== 'declined').sort((a, b) => a.start.localeCompare(b.start));
}
const others = (e) => e.attendees.filter((a) => !a.self && !isMe(a.email));
const SKIP_PREP = /\b(standup|stand-up|lunch|focus|hold|block|ooo|out of office|commute|gym|prep)\b/i;
export function needsPrep(e) {
  if (e.allDay || SKIP_PREP.test(e.title)) return false;
  const o = others(e);
  return o.length >= 2 || o.some((a) => isExternal(a.email)) || o.some((a) => isImportantPerson(a.email)) || (e.project && isImportantProject(e.project));
}

// Items related to an event (context graph lookups) — used by prep briefs and priorities.
const STOP = new Set('the and for with from your this that meeting review call sync weekly daily notes about into will have'.split(' '));
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
export function relatedToEvent(e, now = new Date()) {
  const att = others(e).map((a) => a.email);
  const kw = new Set([...words(e.title), ...words(e.description.slice(0, 200))]);
  const overlap = (s) => words(s).filter((w) => kw.has(w)).length;
  const messages = Object.values(db.messages).filter((m) => !m.bulk && now - new Date(m.date) < 21 * DAY && (att.includes(m.from.email) || m.to.some((t) => att.includes(t.email)) || (e.project && m.project === e.project) || overlap(m.subject) >= 1))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const documents = Object.values(db.documents).filter((d) => (e.project && d.project === e.project) || overlap(d.name) >= 1).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)).slice(0, 6);
  const commitments = Object.values(db.commitments).filter((c) => c.status === 'open' && (att.includes(c.person?.email) || (e.project && c.project === e.project)));
  const previous = Object.values(db.events).filter((x) => x.id !== e.id && new Date(x.start) < new Date(e.start) && ((e.recurringId && x.recurringId === e.recurringId) || x.title === e.title)).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 2);
  const tasks = openTasks().filter((t) => e.project && t.project === e.project);
  return { messages, documents, commitments, previous, tasks };
}

function dueLabel(due, now, hasTime = true) {
  if (!due) return L('No date', 'Sin fecha');
  const d = new Date(due);
  if (d < now) return startOfDay(d).getTime() === startOfDay(now).getTime() ? L(`Overdue · was ${fmtTime(d)}`, `Vencido · era a las ${fmtTime(d)}`) : L(`Overdue · since ${relDay(d, now)}`, `Vencido · desde ${relDay(d, now)}`);
  const r = relDay(d, now);
  if (startOfDay(d).getTime() === startOfDay(now).getTime()) return hasTime ? L(`Due ${fmtTime(d)}`, `Vence ${fmtTime(d)}`) : L('Due today', 'Vence hoy');
  return L(`Due ${r}`, `Vence ${r}`) + (hasTime ? ' ' + fmtTime(d) : '');
}

// ---------- priorities ----------
export const LEVEL_LABEL = { Critical: L('Critical', 'Crítica'), High: L('High', 'Alta'), Normal: 'Normal', Low: L('Low', 'Baja') };
export function computePriorities(now = new Date()) {
  const eod = endOfDay(now); const tEnd = endOfDay(addDays(now, 1));
  const uh = urgentHours();
  const meetings = eventsOnDay(now).filter((e) => !e.allDay && new Date(e.end) > now);
  const meetingFor = (project, emails = []) => meetings.find((e) => (project && e.project === project) || others(e).some((a) => emails.includes(a.email)));
  const dl = (due) => { if (!due) return 0; const d = new Date(due); const h = (d - now) / 3600000; if (h < 0) return 40; if (uh && h <= uh) return 32; if (h <= 3) return 35; if (d <= eod) return 25; if (d <= tEnd) return 12; if (h <= 72) return 5; return 0; };
  const recentDocs = (pid) => pid ? Object.values(db.documents).filter((d) => d.project === pid).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)).slice(0, 2) : [];
  const recentMsgs = (pid) => pid ? Object.values(db.messages).filter((m) => m.project === pid && !m.bulk && !m.isSent).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2) : [];
  const docSrc = (d) => ({ kind: 'DOCUMENT', label: L(`${d.name} — edited by ${d.modifiedBy || 'unknown'}`, `${d.name} — editado por ${d.modifiedBy || 'desconocido'}`), when: relDay(d.modifiedTime, now) + ' ' + fmtTime(d.modifiedTime), link: d.link, id: d.id });
  const msgSrc = (m) => ({ kind: 'EMAIL', label: `${m.isSent ? L('You → ', 'Tú → ') + (m.to[0]?.name || '') : m.from.name} — “${m.subject}”`, when: relDay(m.date, now) + ' ' + fmtTime(m.date), link: m.link, id: m.id });
  const evSrc = (e) => ({ kind: 'CALENDAR', label: `${e.title} — ${P(others(e).length, 'other attendee', 'other attendees', 'participante más', 'participantes más')}`, when: relDay(e.start, now) + ' ' + fmtTime(e.start), link: e.link, id: e.id });
  const cands = [];
  const taskFromMsg = new Set(openTasks().map((t) => t.sourceMessageId).filter(Boolean));
  const taskFromCommit = new Set(openTasks().map((t) => t.fromCommitment).filter(Boolean));

  for (const t of openTasks()) {
    if (t.status === 'blocked') continue;
    const due = t.due ? new Date(t.due) : null;
    const prio = t.priority === 'critical' ? 20 : t.priority === 'high' ? 10 : 0;
    if (!(due && due <= tEnd) && !(prio && (!due || due - now < 7 * DAY))) continue;
    const mt = meetingFor(t.project);
    const why = [];
    if (due) why.push({ tag: 'FACT', text: `${dueLabel(t.due, now, t.dueHasTime)} (${SRC_LABEL[t.source] || t.source}).` });
    if (mt) why.push({ tag: 'INFERENCE', text: L(`Likely needed for “${mt.title}” at ${fmtTime(mt.start)} — same project.`, `Probablemente se necesita para “${mt.title}” a las ${fmtTime(mt.start)} — mismo proyecto.`) });
    if (prio) why.push({ tag: 'FACT', text: L(`Marked ${t.priority} priority.`, `Marcada con prioridad ${({ critical: 'crítica', high: 'alta', normal: 'normal', low: 'baja' })[t.priority] || t.priority}.`) });
    if (t.project && isImportantProject(t.project)) why.push({ tag: 'FACT', text: L(`${projName(t.project)} is one of your important projects.`, `${projName(t.project)} es uno de tus proyectos importantes.`) });
    if (t.postponed >= 2) why.push({ tag: 'FACT', text: L(`Postponed ${t.postponed} times.`, `Pospuesta ${t.postponed} veces.`) });
    if (uh && due && (due - now) / 3600000 <= uh && due > now) why.push({ tag: 'FACT', text: L(`Your rule: anything due within ${uh} hours is urgent.`, `Tu regla: todo lo que vence en menos de ${uh} horas es urgente.`) });
    const docs = recentDocs(t.project); const msgs = recentMsgs(t.project);
    cands.push({
      id: 'p_' + t.id, kind: 'task', refId: t.id, title: t.title, score: dl(t.due) + prio + (t.project && isImportantProject(t.project) ? 15 : 0) + (mt ? 12 : 0) + Math.min(6, (t.postponed || 0) * 2),
      dueAt: t.due, dueLabel: dueLabel(t.due, now, t.dueHasTime), project: t.project, people: [...new Set(msgs.map((m) => m.from.name))],
      why, next: docs[0] ? L(`Open “${docs[0].name}” and finish the next step${due ? ' before ' + fmtTime(due) : ''}.`, `Abre “${docs[0].name}” y termina el siguiente paso${due ? ' antes de las ' + fmtTime(due) : ''}.`) : msgs[0] ? L(`Re-read ${msgs[0].from.name}’s email “${msgs[0].subject}”, then finish the task.`, `Relee el correo de ${msgs[0].from.name} “${msgs[0].subject}” y termina la tarea.`) : L(`Block time for it${due ? ' before ' + fmtTime(due) : ''}.`, `Reserva tiempo para hacerla${due ? ' antes de las ' + fmtTime(due) : ''}.`),
      action: { type: 'complete', label: L('Mark done', 'Marcar hecha'), taskId: t.id }, link: t.link,
      sources: [{ kind: 'TASK', label: `${t.title} (${SRC_LABEL[t.source] || t.source})`, when: t.due ? relDay(t.due, now) + (t.dueHasTime ? ' ' + fmtTime(t.due) : '') : L('no date', 'sin fecha'), link: t.link, id: t.id }, ...(mt ? [evSrc(mt)] : []), ...docs.map(docSrc), ...msgs.map(msgSrc)]
    });
  }

  for (const c of Object.values(db.commitments)) {
    if (c.direction !== 'i_owe' || c.status !== 'open' || taskFromCommit.has(c.id)) continue;
    const st = commitmentState(c, now);
    const due = c.promisedDate ? new Date(c.promisedDate) : null;
    if (!(st.key === 'overdue' || (due && due <= tEnd))) continue;
    const mt = meetingFor(c.project, [c.person?.email]);
    const imp = isImportantPerson(c.person?.email);
    const m = db.messages[c.sourceId];
    const why = [{ tag: c.confidence === 'clear' ? 'FACT' : 'INFERENCE', text: L(`You wrote “${c.quote}” (${relDay(c.detectedAt, now)}).`, `Escribiste “${c.quote}” (${relDay(c.detectedAt, now)}).`) }];
    if (st.key === 'overdue') why.push({ tag: 'FACT', text: L('That date has passed.', 'Esa fecha ya pasó.') });
    if (mt) why.push({ tag: 'FACT', text: L(`You meet ${c.person?.name} at ${fmtTime(mt.start)} (“${mt.title}”).`, `Te reúnes con ${c.person?.name} a las ${fmtTime(mt.start)} (“${mt.title}”).`) });
    cands.push({
      id: 'p_' + c.id, kind: 'commitment', refId: c.id, title: `${c.what} → ${c.person?.name}`, score: dl(c.promisedDate) + 10 + (imp ? 15 : 0) + (mt ? 12 : 0),
      dueAt: c.promisedDate, dueLabel: st.key === 'overdue' ? L(`Overdue · promised ${relDay(c.promisedDate, now)}`, `Vencido · prometido para ${relDay(c.promisedDate, now)}`) : dueLabel(c.promisedDate, now, false), project: c.project, people: [c.person?.name],
      why, next: mt ? L(`Send it before ${fmtTime(mt.start)} so it’s not open in the meeting.`, `Envíalo antes de las ${fmtTime(mt.start)} para no llegar con esto pendiente a la reunión.`) : L(`Send it, or tell ${c.person?.name} the new date.`, `Envíalo, o avísale a ${c.person?.name} la nueva fecha.`),
      action: m ? { type: 'draft', label: L('Draft reply', 'Redactar respuesta'), messageId: m.id } : { type: 'commit_done', label: L('Mark done', 'Marcar hecho'), commitmentId: c.id }, link: c.link,
      sources: [...(m ? [msgSrc(m)] : []), ...(mt ? [evSrc(mt)] : [])]
    });
  }

  for (const m of Object.values(db.messages)) {
    const t = m.triage;
    if (!t || t.category !== 'needs_reply' || hidden(m) || taskFromMsg.has(m.id)) continue;
    const dd = t.deadline?.date ? new Date(t.deadline.date) : null;
    if (t.importance !== 'high' && !(dd && dd <= tEnd)) continue;
    const mt = meetingFor(m.project, [m.from.email]);
    const age = now - new Date(m.date);
    const why = [{ tag: 'FACT', text: L(`${m.from.name} asked: “${(t.action || t.summary || m.subject).slice(0, 140)}”`, `${m.from.name} pidió: “${(t.action || t.summary || m.subject).slice(0, 140)}”`) }];
    if (t.deadline) why.push({ tag: t.deadline.date ? 'FACT' : 'INFERENCE', text: L(`Deadline in the email: “${t.deadline.text}”.`, `Plazo en el correo: “${t.deadline.text}”.`) });
    if (mt) why.push({ tag: 'FACT', text: L(`You meet ${m.from.name} at ${fmtTime(mt.start)}.`, `Te reúnes con ${m.from.name} a las ${fmtTime(mt.start)}.`) });
    if (t.ruleApplied) why.push({ tag: 'FACT', text: L(`Your rule (${t.ruleApplied}) marks this important.`, `Tu regla (${t.ruleApplied}) lo marca como importante.`) });
    if (age > 2 * DAY) why.push({ tag: 'FACT', text: L(`Waiting ${ago(m.date, now)} for your reply.`, `Lleva ${ago(m.date, now)} esperando tu respuesta.`) });
    cands.push({
      id: 'p_' + m.id, kind: 'reply', refId: m.id, title: L(`Reply to ${m.from.name}: ${m.subject}`, `Responder a ${m.from.name}: ${m.subject}`), score: dl(t.deadline?.date) + (t.importance === 'high' ? 15 : 0) + (isImportantPerson(m.from.email) ? 10 : 0) + (mt ? 12 : 0) + (age > 2 * DAY ? 5 : 0),
      dueAt: t.deadline?.date || null, dueLabel: t.deadline ? (t.deadline.date ? dueLabel(t.deadline.date, now, true) : t.deadline.text) : L(`Received ${ago(m.date, now)} ago`, `Recibido hace ${ago(m.date, now)}`), project: m.project, people: [m.from.name],
      why, next: mt ? L(`Reply before ${fmtTime(mt.start)}.`, `Responde antes de las ${fmtTime(mt.start)}.`) : L('Reply, or turn it into a task with a date.', 'Responde, o conviértelo en tarea con fecha.'), action: { type: 'draft', label: L('Draft reply', 'Redactar respuesta'), messageId: m.id }, link: m.link, sources: [msgSrc(m), ...(mt ? [evSrc(mt)] : [])]
    });
  }

  for (const e of meetings) {
    if (new Date(e.start) <= now || !needsPrep(e)) continue;
    const rel = relatedToEvent(e, now);
    const ext = others(e).some((a) => isExternal(a.email)); const imp = others(e).some((a) => isImportantPerson(a.email));
    const hrs = (new Date(e.start) - now) / 3600000;
    const why = [{ tag: 'FACT', text: `${P(others(e).length, 'other attendee', 'other attendees', 'participante más', 'participantes más')}${ext ? L(', including external people', ', incluidas personas externas') : ''}.` }];
    if (rel.commitments.length) why.push({ tag: 'FACT', text: L(`${P(rel.commitments.length, 'open commitment', 'open commitments', '', '')} with these people.`, `${P(rel.commitments.length, '', '', 'compromiso abierto', 'compromisos abiertos')} con estas personas.`) });
    if (rel.documents.length) why.push({ tag: 'INFERENCE', text: `${P(rel.documents.length, 'related document changed recently.', 'related documents changed recently.', 'documento relacionado cambió hace poco.', 'documentos relacionados cambiaron hace poco.')}` });
    cands.push({
      id: 'p_' + e.id, kind: 'meeting', refId: e.id, title: L(`Prepare for ${e.title}`, `Prepararte para ${e.title}`), score: 8 + (hrs <= 3 ? 14 : 4) + (ext ? 8 : 0) + (imp ? 8 : 0) + (e.project && isImportantProject(e.project) ? 10 : 0) + rel.commitments.length * 3,
      dueAt: e.start, dueLabel: L(`Starts ${fmtTime(e.start)}`, `Empieza ${fmtTime(e.start)}`), project: e.project, people: others(e).slice(0, 3).map((a) => a.name),
      why, next: L('Open the meeting brief 30 minutes before.', 'Abre el resumen de la reunión 30 minutos antes.'), action: { type: 'prep', label: L('Prep me', 'Prepárame'), eventId: e.id }, link: e.link, sources: [evSrc(e), ...rel.documents.slice(0, 2).map(docSrc), ...rel.messages.slice(0, 2).map(msgSrc)]
    });
  }

  cands.sort((a, b) => b.score - a.score);
  return cands.filter((c) => c.score >= 10).slice(0, 7).map((c, i) => ({
    ...c, rank: i + 1, level: c.score >= 55 ? 'Critical' : c.score >= 30 ? 'High' : 'Normal', levelLabel: LEVEL_LABEL[c.score >= 55 ? 'Critical' : c.score >= 30 ? 'High' : 'Normal'], projectName: projName(c.project),
    from: [...new Set(c.sources.map((s) => s.kind))].join(' · ')
  }));
}

// ---------- timeline + schedule problems ----------
function busyToday(now) { return eventsOnDay(now).filter((e) => !e.allDay && e.busy); }
export function freeSlots(now, from, to, minMinutes = 30) {
  const busy = busyToday(now).map((e) => [new Date(e.start), new Date(e.end)]).sort((a, b) => a[0] - b[0]);
  const out = []; let cur = new Date(from);
  for (const [s, e] of busy) { if (e <= cur) continue; if (s > cur && (Math.min(s, to) - cur) / 60000 >= minMinutes) out.push([new Date(cur), new Date(Math.min(s, to))]); if (e > cur) cur = new Date(e); if (cur >= to) break; }
  if ((to - cur) / 60000 >= minMinutes) out.push([cur, new Date(to)]);
  return out;
}
const span = (s, e) => `${fmtTime(s).replace(':00', '')}–${fmtTime(e).replace(':00', '')}`;

export function computeTimeline(now = new Date(), priorities = []) {
  const ws = parseHM(settings().workStart); const we = parseHM(settings().workEnd);
  const dayStart = new Date(startOfDay(now)); dayStart.setHours(ws.h, ws.m);
  const dayEnd = new Date(startOfDay(now)); dayEnd.setHours(we.h, we.m);
  const evs = eventsOnDay(now);
  const items = []; const issues = [];
  const flags = {};
  const flag = (id, f) => (flags[id] ||= []).push(f);
  const timed = evs.filter((e) => !e.allDay && e.busy);
  for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
    const a = timed[i]; const b = timed[j];
    const s = Math.max(new Date(a.start), new Date(b.start)); const e = Math.min(new Date(a.end), new Date(b.end));
    if (e > s) {
      flag(a.id, { label: L('Conflict', 'Choque'), level: 'crit' }); flag(b.id, { label: L('Conflict', 'Choque'), level: 'crit' });
      issues.push({ level: 'crit', title: L(`Conflict · ${span(s, e)}`, `Choque de horario · ${span(s, e)}`), text: L(`“${a.title}” (${span(a.start, a.end)}) overlaps “${b.title}” (${span(b.start, b.end)}) by ${Math.round((e - s) / 60000)} minutes.`, `“${a.title}” (${span(a.start, a.end)}) se cruza con “${b.title}” (${span(b.start, b.end)}) por ${Math.round((e - s) / 60000)} minutos.`), eventIds: [a.id, b.id] });
    }
  }
  let chain = [timed[0]].filter(Boolean);
  const flushChain = () => { if (chain.length >= 3) issues.push({ level: 'warn', title: L(`Back-to-back ${span(chain[0].start, chain[chain.length - 1].end)}`, `Reuniones seguidas ${span(chain[0].start, chain[chain.length - 1].end)}`), text: L(`${chain.length} meetings with no break.`, `${chain.length} reuniones sin descanso.`) }); };
  for (let i = 1; i < timed.length; i++) {
    const gap = (new Date(timed[i].start) - new Date(chain[chain.length - 1].end)) / 60000;
    if (gap < 5) chain.push(timed[i]); else { flushChain(); chain = [timed[i]]; }
  }
  flushChain();
  const mins = timed.reduce((s, e) => s + (Math.min(new Date(e.end), endOfDay(now)) - Math.max(new Date(e.start), startOfDay(now))) / 60000, 0);
  if (mins > 360) issues.push({ level: 'warn', title: L(`Heavy day · ${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m of meetings`, `Día cargado · ${Math.floor(mins / 60)} h ${Math.round(mins % 60)} min de reuniones`), text: L('Consider moving anything that is not time-critical.', 'Considera mover lo que no sea urgente.') });
  for (const e of timed) {
    if (new Date(e.start) <= now || !needsPrep(e)) continue;
    const kw = new Set(words(e.title));
    const hasPrepBlock = timed.some((x) => x !== e && /\bprep/i.test(x.title) && new Date(x.end) <= new Date(e.start) && words(x.title).some((w) => kw.has(w)));
    if (hasPrepBlock) continue;
    const from = new Date(Math.max(now, new Date(e.start) - 2 * 3600000, dayStart));
    const slots = freeSlots(now, from, new Date(e.start), 15);
    if (!slots.length) { flag(e.id, { label: L('No prep time', 'Sin tiempo de preparación'), level: 'warn' }); issues.push({ level: 'warn', title: L(`No prep time before ${e.title}`, `Sin tiempo para preparar ${e.title}`), text: L(`No free 15 minutes in the 2 hours before ${fmtTime(e.start)}.`, `No hay 15 minutos libres en las 2 horas antes de las ${fmtTime(e.start)}.`) }); }
  }
  for (const e of evs) {
    const o = others(e);
    items.push({ id: e.id, time: e.allDay ? null : e.start, end: e.end, allDay: e.allDay, kind: o.length ? 'Meeting' : 'Block', title: e.title,
      meta: [e.allDay ? L('All day', 'Todo el día') : span(e.start, e.end), e.location, e.meetLink ? L('Video call', 'Videollamada') : '', o.length ? P(o.length, 'other', 'others', 'persona más', 'personas más') : ''].filter(Boolean).join(' · '),
      flags: flags[e.id] || [], eventId: e.id, prep: needsPrep(e), link: e.link, past: new Date(e.end) < now });
  }
  for (const t of openTasks()) {
    if (!t.due || startOfDay(t.due).getTime() !== startOfDay(now).getTime()) continue;
    const pr = priorities.find((p) => p.refId === t.id);
    items.push({ id: t.id, time: t.dueHasTime ? t.due : null, kind: 'Deadline', title: t.title, meta: `${SRC_LABEL[t.source] || t.source}${t.project ? ' · ' + projName(t.project) : ''}`, flags: pr && pr.level !== 'Normal' ? [{ label: LEVEL_LABEL[pr.level], level: pr.level === 'Critical' ? 'crit' : 'warn' }] : [], taskId: t.id, link: t.link, past: false });
    if (t.dueHasTime && new Date(t.due) > now && pr && pr.level !== 'Normal') {
      const slots = freeSlots(now, new Date(Math.max(now, dayStart)), new Date(t.due), 30);
      if (!slots.length) issues.push({ level: 'warn', title: L(`No free time before ${t.title}`, `Sin tiempo libre antes de ${t.title}`), text: L(`It’s due ${fmtTime(t.due)} and there is no free 30 minutes before then.`, `Vence a las ${fmtTime(t.due)} y no hay 30 minutos libres antes.`) });
      else items.push({ id: 'sug_' + t.id, time: slots[0][0].toISOString(), end: slots[0][1].toISOString(), kind: 'Suggested', title: L(`Work on: ${t.title}`, `Trabajar en: ${t.title}`), meta: L(`${span(slots[0][0], slots[0][1])} is free · protects the ${fmtTime(t.due)} deadline`, `${span(slots[0][0], slots[0][1])} está libre · protege el plazo de las ${fmtTime(t.due)}`), flags: [], suggested: true });
    }
  }
  for (const c of Object.values(db.commitments)) {
    if (c.direction !== 'i_owe' || c.status !== 'open' || !c.promisedDate) continue;
    if (startOfDay(c.promisedDate).getTime() !== startOfDay(now).getTime()) continue;
    items.push({ id: c.id, time: null, kind: 'Promise', title: `${c.what} → ${c.person?.name}`, meta: L('You promised this for today', 'Prometiste esto para hoy'), flags: [], link: c.link });
  }
  items.sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || String(a.time).localeCompare(String(b.time)));
  const free = freeSlots(now, new Date(Math.max(now, dayStart)), dayEnd, 15).reduce((s, [a, b]) => s + (b - a) / 60000, 0);
  return { items, issues, meetingMinutes: Math.round(mins), freeMinutes: Math.round(free) };
}

// ---------- project pulse ----------
export const PULSE = { blocked: [L('Blocked', 'Bloqueado'), 'crit'], at_risk: [L('At risk', 'En riesgo'), 'crit'], attention: [L('Needs attention', 'Requiere atención'), 'warn'], waiting: [L('Waiting', 'En espera'), 'info'], on_track: [L('On track', 'A tiempo'), 'ok'], quiet: [L('No recent activity', 'Sin actividad reciente'), 'mute'] };
export function computePulse(now = new Date()) {
  return Object.values(db.projects).map((p) => {
    const tasks = Object.values(db.tasks).filter((t) => t.project === p.id);
    const open = tasks.filter((t) => t.status !== 'done'); const done = tasks.filter((t) => t.status === 'done');
    const blocked = open.filter((t) => t.status === 'blocked');
    const overdue = open.filter((t) => t.status !== 'blocked' && t.due && new Date(t.due) < now);
    const comm = Object.values(db.commitments).filter((c) => c.project === p.id && c.status === 'open');
    const theyOver = comm.filter((c) => c.direction === 'they_owe' && commitmentState(c, now).key === 'overdue');
    const iOver = comm.filter((c) => c.direction === 'i_owe' && commitmentState(c, now).key === 'overdue');
    const theyOpen = comm.filter((c) => c.direction === 'they_owe');
    const msgs = Object.values(db.messages).filter((m) => m.project === p.id && now - new Date(m.date) < 7 * DAY && !m.bulk);
    const needReply = msgs.filter((m) => m.triage?.category === 'needs_reply' && !hidden(m));
    const upcoming = Object.values(db.events).filter((e) => e.project === p.id && new Date(e.start) >= now).sort((a, b) => a.start.localeCompare(b.start));
    const docs = Object.values(db.documents).filter((d) => d.project === p.id && now - new Date(d.modifiedTime) < 7 * DAY);
    const soon = open.filter((t) => t.due && new Date(t.due) >= now && new Date(t.due) - now < 2 * DAY);
    let status = 'quiet'; let evidence = L('No tasks, email, meetings or documents linked in the last 7 days.', 'Sin tareas, correos, reuniones ni documentos vinculados en los últimos 7 días.');
    if (blocked.length || theyOver.length) { status = 'blocked'; evidence = blocked.length ? L(`“${blocked[0].title}” is blocked`, `“${blocked[0].title}” está bloqueada`) + (blocked[0].blockedBy ? ': ' + blocked[0].blockedBy : '') + '.' : L(`${theyOver[0].person?.name} promised “${theyOver[0].what}” ${relDay(theyOver[0].promisedDate, now)} — overdue.`, `${theyOver[0].person?.name} prometió “${theyOver[0].what}” para ${relDay(theyOver[0].promisedDate, now)} — vencido.`); }
    else if (overdue.length || iOver.length) { status = 'at_risk'; evidence = overdue.length ? L(`“${overdue[0].title}” is overdue (${relDay(overdue[0].due, now)}).`, `“${overdue[0].title}” está vencida (${relDay(overdue[0].due, now)}).`) : L(`You promised “${iOver[0].what}” to ${iOver[0].person?.name} — overdue.`, `Prometiste “${iOver[0].what}” a ${iOver[0].person?.name} — vencido.`); }
    else if (soon.length || needReply.length) { status = 'attention'; evidence = soon.length ? L(`“${soon[0].title}” is due ${relDay(soon[0].due, now)}.`, `“${soon[0].title}” vence ${relDay(soon[0].due, now)}.`) : L(`${needReply[0].from.name} is waiting for your reply.`, `${needReply[0].from.name} espera tu respuesta.`); }
    else if (theyOpen.length) { status = 'waiting'; evidence = L(`Waiting on ${theyOpen[0].person?.name}: ${theyOpen[0].what}.`, `Esperando a ${theyOpen[0].person?.name}: ${theyOpen[0].what}.`); }
    else if (msgs.length || docs.length || open.length || upcoming.length) { status = 'on_track'; evidence = L('Activity this week and nothing overdue or blocked.', 'Hubo actividad esta semana y nada está vencido ni bloqueado.'); }
    const nextDated = [...open.filter((t) => t.due && new Date(t.due) >= now).map((t) => ({ label: t.title, date: t.due })), ...upcoming.slice(0, 3).map((e) => ({ label: e.title, date: e.start }))].sort((a, b) => a.date.localeCompare(b.date))[0];
    const activity = [...msgs.map((m) => ({ t: m.date, text: m.isSent ? L('You emailed ', 'Escribiste a ') + (m.to[0]?.name || '') : L('Email from ', 'Correo de ') + m.from.name })), ...docs.map((d) => ({ t: d.modifiedTime, text: L(`${d.name} edited by ${d.modifiedBy}`, `${d.name} editado por ${d.modifiedBy}`) })), ...done.filter((t) => t.completedAt).map((t) => ({ t: t.completedAt, text: L(`Completed: ${t.title}`, `Completada: ${t.title}`) }))].sort((a, b) => b.t.localeCompare(a.t))[0];
    const next = blocked[0] && theyOver[0] ? L(`Follow up with ${theyOver[0].person?.name}`, `Dar seguimiento a ${theyOver[0].person?.name}`) : overdue[0] ? overdue[0].title : iOver[0] ? `${iOver[0].what} → ${iOver[0].person?.name}` : needReply[0] ? L(`Reply to ${needReply[0].from.name}`, `Responder a ${needReply[0].from.name}`) : theyOver[0] ? L(`Follow up with ${theyOver[0].person?.name}`, `Dar seguimiento a ${theyOver[0].person?.name}`) : open.filter((t) => t.status !== 'blocked').sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')))[0]?.title || '—';
    const total = open.length + done.length;
    return {
      id: p.id, name: p.name, owner: p.owner && p.owner !== 'You' ? p.owner : L('You', 'Tú'), status, statusLabel: PULSE[status][0], level: PULSE[status][1], evidence,
      milestone: nextDated ? { label: nextDated.label, date: nextDated.date, when: relDay(nextDated.date, now) } : null,
      progress: total ? { done: done.length, total, pct: Math.round((done.length / total) * 100) } : null,
      activity: activity ? { text: activity.text, when: ago(activity.t, now) } : null,
      blocker: blocked[0] ? (blocked[0].blockedBy || blocked[0].title) : theyOver[0] ? L(`Waiting on ${theyOver[0].person?.name}`, `Esperando a ${theyOver[0].person?.name}`) : null,
      next, important: isImportantProject(p.id), counts: { open: open.length, overdue: overdue.length, messages: msgs.length, docs: docs.length }
    };
  });
}

// ---------- risks ----------
export function computeRisks(now, pulse, timeline) {
  const r = [];
  for (const p of pulse) if (p.status === 'blocked' || p.status === 'at_risk') r.push({ level: p.level, label: p.statusLabel, title: p.name, tag: 'FACT', text: p.evidence, evidence: p.milestone ? L(`Next milestone: ${p.milestone.label} · ${p.milestone.when}`, `Próximo hito: ${p.milestone.label} · ${p.milestone.when}`) : '' });
  for (const c of Object.values(db.commitments)) if (c.direction === 'they_owe' && c.status === 'open' && commitmentState(c, now).key === 'overdue' && !pulse.some((p) => p.id === c.project && p.status === 'blocked'))
    r.push({ level: 'warn', label: L('Overdue', 'Vencido'), title: `${c.person?.name}: ${c.what}`, tag: c.confidence === 'clear' ? 'FACT' : 'INFERENCE', text: L(`Promised “${c.quote}”`, `Prometió “${c.quote}”`), evidence: L(`Email · ${relDay(c.detectedAt, now)}`, `Correo · ${relDay(c.detectedAt, now)}`) });
  for (const i of timeline.issues.filter((x) => x.level === 'crit')) r.push({ level: 'crit', label: L('Schedule', 'Agenda'), title: i.title, tag: 'FACT', text: i.text, evidence: L('Calendar', 'Calendario') });
  for (const t of openTasks()) if ((t.postponed || 0) >= 3) r.push({ level: 'warn', label: L('Postponed', 'Pospuesta'), title: t.title, tag: 'FACT', text: L(`Moved ${t.postponed} times.`, `Movida ${t.postponed} veces.`), evidence: SRC_LABEL[t.source] || t.source });
  for (const [k, s] of Object.entries(db.sync)) if (s.status && s.status !== 'ok') r.push({ level: 'mute', label: L('Incomplete', 'Incompleto'), title: L(`${s.label} not synced`, `${s.label} sin sincronizar`) + (s.lastSuccess ? L(' since ', ' desde ') + relDay(s.lastSuccess, now) + ' ' + fmtTime(s.lastSuccess) : ''), tag: 'FACT', text: L('Anything that only exists there is missing from today’s view.', 'Lo que solo está ahí no aparece en la vista de hoy.'), evidence: s.error || k });
  return r;
}

// ---------- snapshots & change detection ----------
export function buildSnapshot(now, priorities, pulse, risks) {
  const in7 = addDays(now, 7);
  return {
    date: dateKey(now), createdAt: now.toISOString(),
    priorities: priorities.map((p) => ({ id: p.id, refId: p.refId, title: p.title, level: p.level })),
    events: Object.values(db.events).filter((e) => new Date(e.start) >= startOfDay(now) && new Date(e.start) <= in7).map((e) => ({ id: e.id, title: e.title, start: e.start })),
    tasksOpen: openTasks().map((t) => ({ id: t.id, title: t.title, due: t.due, project: t.project })),
    tasksDone: Object.values(db.tasks).filter((t) => t.status === 'done').map((t) => ({ id: t.id, title: t.title, completedAt: t.completedAt, project: t.project })),
    commitments: Object.values(db.commitments).map((c) => ({ id: c.id, what: c.what, person: c.person?.name, direction: c.direction, status: c.status, state: commitmentState(c, now).key, promisedDate: c.promisedDate })),
    important: Object.values(db.messages).filter((m) => ['needs_reply', 'important'].includes(m.triage?.category)).map((m) => m.id),
    projects: pulse.map((p) => ({ id: p.id, name: p.name, status: p.status, label: p.statusLabel, pct: p.progress?.pct ?? null })),
    risks: risks.map((r) => r.title),
    decisions: Object.values(db.decisions).map((d) => d.id),
    sources: Object.fromEntries(Object.entries(db.sync).map(([k, s]) => [k, s.status]))
  };
}

export function detectChanges(prev, now = new Date()) {
  if (!prev) return [{ sym: '•', level: 'mute', text: L('First daily snapshot saved.', 'Se guardó la primera foto del día.'), ctx: L('From tomorrow this section shows what changed overnight.', 'Desde mañana aquí verás qué cambió de un día a otro.') }];
  const out = []; const since = new Date(prev.createdAt);
  const inbound = Object.values(db.messages).filter((m) => !m.isSent && new Date(m.date) > since);
  const imp = inbound.filter((m) => ['needs_reply', 'important'].includes(m.triage?.category));
  if (inbound.length) out.push({ sym: '+', level: 'info', text: P(imp.length, 'important email', 'important emails', 'correo importante', 'correos importantes'), ctx: L(`of ${inbound.length} received`, `de ${inbound.length} recibidos`) + `${imp.length ? ' · ' + [...new Set(imp.map((m) => m.from.name))].slice(0, 3).join(', ') : ''}` });
  const prevEv = Object.fromEntries(prev.events.map((e) => [e.id, e]));
  const curEv = Object.values(db.events).filter((e) => new Date(e.start) >= now && new Date(e.start) <= addDays(since, 7));
  const calOk = !db.sync.gcal || db.sync.gcal.status === 'ok';
  for (const e of curEv) {
    const p = prevEv[e.id];
    if (!p) out.push({ sym: '+', level: 'info', text: L(`New meeting: ${e.title}`, `Nueva reunión: ${e.title}`), ctx: `${relDay(e.start, now)} ${fmtTime(e.start)}` });
    else if (p.start !== e.start) out.push({ sym: '~', level: 'warn', text: L(`Moved: ${e.title}`, `Movida: ${e.title}`), ctx: `${relDay(p.start, now)} ${fmtTime(p.start)} → ${relDay(e.start, now)} ${fmtTime(e.start)}` });
  }
  if (calOk) for (const p of prev.events) if (new Date(p.start) >= now && !db.events[p.id]) out.push({ sym: '−', level: 'warn', text: L(`Removed: ${p.title}`, `Eliminada: ${p.title}`), ctx: L('was ', 'era ') + `${relDay(p.start, now)} ${fmtTime(p.start)}` });
  const prevOpen = Object.fromEntries(prev.tasksOpen.map((t) => [t.id, t]));
  for (const t of Object.values(db.tasks)) {
    const p = prevOpen[t.id];
    if (p && t.status === 'done') out.push({ sym: '✓', level: 'ok', text: L(`Completed: ${t.title}`, `Completada: ${t.title}`), ctx: '' });
    else if (t.status !== 'done' && t.due && new Date(t.due) < now && new Date(t.due) > since) out.push({ sym: '!', level: 'crit', text: L(`Became overdue: ${t.title}`, `Se venció: ${t.title}`), ctx: L(`was due ${relDay(t.due, now)}`, `vencía ${relDay(t.due, now)}`) });
    else if (p && t.due && p.due && p.due !== t.due) { const later = t.due > p.due; out.push({ sym: '~', level: 'warn', text: (later ? L('Deadline pushed', 'Plazo aplazado') : L('Deadline pulled in', 'Plazo adelantado')) + `: ${t.title}`, ctx: `${relDay(p.due, now)} → ${relDay(t.due, now)}` }); }
  }
  const prevC = Object.fromEntries(prev.commitments.map((c) => [c.id, c]));
  for (const c of Object.values(db.commitments)) {
    const p = prevC[c.id];
    if (!p && c.status === 'open') out.push({ sym: '+', level: 'info', text: L(`New commitment: ${c.what}`, `Nuevo compromiso: ${c.what}`), ctx: c.direction === 'i_owe' ? L('you → ', 'tú → ') + c.person?.name : `${c.person?.name} → ` + L('you', 'ti') });
    else if (p && p.status === 'open' && c.status === 'done') out.push({ sym: '✓', level: 'ok', text: L(`Delivered: ${c.what}`, `Entregado: ${c.what}`), ctx: c.person?.name });
    else if (p && p.state !== 'overdue' && c.status === 'open' && commitmentState(c, now).key === 'overdue') out.push({ sym: '!', level: 'crit', text: L(`Commitment overdue: ${c.what}`, `Compromiso vencido: ${c.what}`), ctx: c.direction === 'i_owe' ? L(`you owe ${c.person?.name}`, `le debes a ${c.person?.name}`) : L(`${c.person?.name} owes you`, `${c.person?.name} te debe`) });
  }
  const prevP = Object.fromEntries(prev.projects.map((p) => [p.id, p]));
  for (const p of computePulse(now)) { const q = prevP[p.id]; if (q && q.status !== p.status) out.push({ sym: '!', level: p.level, text: `${p.name}: ${q.label} → ${p.statusLabel}`, ctx: p.evidence }); }
  const docs = Object.values(db.documents).filter((d) => new Date(d.modifiedTime) > since && !d.modifiedByMe);
  if (docs.length) out.push({ sym: '~', level: 'mute', text: docs.length === 1 ? L(`${docs[0].name} edited`, `${docs[0].name} fue editado`) : L(`${docs.length} shared files edited`, `${docs.length} archivos compartidos editados`), ctx: docs.slice(0, 3).map((d) => `${d.name} (${d.modifiedBy})`).join(', ') });
  for (const [k, s] of Object.entries(db.sync)) if (s.status !== 'ok' && prev.sources?.[k] === 'ok') out.push({ sym: '!', level: 'warn', text: L(`${s.label} stopped syncing`, `${s.label} dejó de sincronizar`), ctx: s.error || '' });
  const order = { crit: 0, warn: 1, info: 2, ok: 3, mute: 4 };
  return out.sort((a, b) => order[a.level] - order[b.level]).slice(0, 14);
}

export function personLabel(email) { return personName(email); }
