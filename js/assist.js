// Intelligence layer, part 3: morning brief, meeting prep, Chief of Staff, quick capture, drafts, weekly review, search.
import { db, config, listSnapshotDates, readSnapshot, uid } from './store.js';
import { DAY, startOfDay, endOfDay, addDays, fmtTime, fmtDay, relDay, ago, parseWhen, dateKey } from './dates.js';
import { aiEnabled, askJson, HONESTY } from './ai.js';
import { L, P, AI_LANG, LOCALE } from './i18n.js';
import { LEVEL_LABEL } from './plan.js';
import { myEmail, settings, commitmentState, isImportantPerson, threads, personName } from './core.js';
import { relatedToEvent, eventsOnDay, openTasks, needsPrep } from './plan.js';

const allIds = () => new Set([...Object.keys(db.messages), ...Object.keys(db.events), ...Object.keys(db.tasks), ...Object.keys(db.documents), ...Object.keys(db.commitments), ...Object.keys(db.decisions)]);
const cleanSources = (arr, ids) => (Array.isArray(arr) ? arr : []).filter((x) => ids.has(x)).slice(0, 6);
const TAGS = ['FACT', 'INFERENCE', 'RECOMMENDATION'];
const cleanTag = (t) => (TAGS.includes(String(t).toUpperCase()) ? String(t).toUpperCase() : 'INFERENCE');
const hiddenThread = (m) => { const h = db.hidden[m.threadId]; return !!h && (h.archived || (h.snoozeUntil && new Date(h.snoozeUntil) > new Date())); };
export const visibleTriage = (cat) => Object.values(db.messages).filter((m) => m.triage?.category === cat && !hiddenThread(m)).sort((a, b) => b.date.localeCompare(a.date));
const staleSources = () => Object.values(db.sync).filter((s) => s.status && s.status !== 'ok').map((s) => s.label);
const ITEMS_BY_LENGTH = { compact: 3, standard: 6, detailed: 9 };

// ---------- morning brief ----------
export async function generateBrief({ now, priorities, timeline, pulse, risks, changes, allowAi = true }) {
  const iOwe = Object.values(db.commitments).filter((c) => c.direction === 'i_owe' && c.status === 'open');
  const theyOwe = Object.values(db.commitments).filter((c) => c.direction === 'they_owe' && c.status === 'open');
  const overdueMine = iOwe.filter((c) => commitmentState(c, now).key === 'overdue');
  const overdueTheirs = theyOwe.filter((c) => commitmentState(c, now).key === 'overdue');
  const conflicts = timeline.issues.filter((i) => i.level === 'crit');
  const noise = visibleTriage('noise').length + visibleTriage('fyi').length;
  const stale = staleSources();
  const chips = [
    { label: P(priorities.filter((p) => p.level === 'Critical').length, 'critical', 'critical', 'crítica', 'críticas'), level: 'crit', show: priorities.some((p) => p.level === 'Critical') },
    { label: P(conflicts.length, 'schedule conflict', 'schedule conflicts', 'choque de horario', 'choques de horario'), level: 'crit', show: conflicts.length > 0 },
    { label: P(overdueMine.length, 'overdue commitment', 'overdue commitments', 'compromiso vencido', 'compromisos vencidos'), level: 'warn', show: overdueMine.length > 0 },
    { label: P(pulse.filter((p) => p.status === 'blocked').length, 'project blocked', 'projects blocked', 'proyecto bloqueado', 'proyectos bloqueados'), level: 'warn', show: pulse.some((p) => p.status === 'blocked') },
    { label: P(visibleTriage('needs_reply').length, 'needs a reply', 'need a reply', 'por responder', 'por responder'), level: 'info', show: visibleTriage('needs_reply').length > 0 },
    { label: P(noise, 'safe to ignore', 'safe to ignore', 'se puede ignorar', 'se pueden ignorar'), level: 'mute', show: noise > 0 }
  ].filter((c) => c.show);
  const n = ITEMS_BY_LENGTH[settings().length] || 6;
  let brief = null; let aiError = null;
  if (allowAi && aiEnabled() && (priorities.length || timeline.items.length || iOwe.length)) {
    try {
      const facts = {
        today: now.toDateString(), now: fmtTime(now),
        priorities: priorities.map((p) => ({ id: p.id, title: p.title, level: p.level, due: p.dueLabel, project: p.projectName, evidence: p.why.map((w) => `${w.tag}: ${w.text}`), source_ids: p.sources.map((s) => s.id).filter(Boolean) })),
        schedule: timeline.items.filter((i) => i.time).map((i) => ({ id: i.eventId || i.taskId || i.id, kind: i.kind, title: i.title, when: i.meta, flags: i.flags.map((f) => f.label) })),
        schedule_problems: timeline.issues.map((i) => i.title + ': ' + i.text),
        i_owe: iOwe.slice(0, 12).map((c) => ({ id: c.id, to: c.person?.name, what: c.what, quote: c.quote, state: commitmentState(c, now).label })),
        they_owe: theyOwe.slice(0, 12).map((c) => ({ id: c.id, from: c.person?.name, what: c.what, quote: c.quote, state: commitmentState(c, now).label })),
        projects: pulse.filter((p) => p.status !== 'quiet').map((p) => ({ name: p.name, status: p.statusLabel, evidence: p.evidence })),
        changes_since_yesterday: changes.map((c) => c.text + (c.ctx ? ' — ' + c.ctx : '')),
        missing_sources: stale, ignorable_messages: noise
      };
      const out = await askJson({
        maxTokens: 2500,
        system: `You are the user's chief of staff writing their morning brief. Interpret, don't just list. ${HONESTY} ${AI_LANG()} Keep the tag values FACT, INFERENCE, RECOMMENDATION in English.`,
        prompt: `Write today's brief from these facts. Return:
{"headline":"one sentence that captures the shape of the day","items":[{"tag":"FACT|INFERENCE|RECOMMENDATION","lead":"short bold opener","text":"one or two sentences","sources":["ids"]}],"next_steps":{"<priority id>":"one concrete next action"}}
Write ${n} items, most important first. End with at most one RECOMMENDATION about how to sequence the day. If sources are missing, mention that insights may be incomplete.
Facts:\n${JSON.stringify(facts)}`
      });
      const ids = allIds();
      brief = {
        headline: String(out.headline || '').slice(0, 300),
        items: (out.items || []).slice(0, n + 1).map((i) => ({ tag: cleanTag(i.tag), lead: String(i.lead || '').slice(0, 160), text: String(i.text || '').slice(0, 400), sources: cleanSources(i.sources, ids) })),
        nextSteps: out.next_steps || {}, basis: 'ai'
      };
    } catch (e) { aiError = e.message; }
  }
  if (!brief) {
    const items = [];
    for (const p of priorities.slice(0, Math.max(2, n - 3))) items.push({ tag: p.why[0]?.tag || 'FACT', lead: `${p.title}.`, text: p.why.slice(0, 2).map((w) => w.text).join(' '), sources: p.sources.map((s) => s.id).filter(Boolean) });
    for (const c of conflicts.slice(0, 1)) items.push({ tag: 'FACT', lead: c.title + '.', text: c.text, sources: c.eventIds || [] });
    if (overdueTheirs.length) items.push({ tag: 'FACT', lead: L(`Waiting on ${overdueTheirs[0].person?.name}.`, `Esperando a ${overdueTheirs[0].person?.name}.`), text: L(`“${overdueTheirs[0].quote}” — that date has passed.`, `“${overdueTheirs[0].quote}” — esa fecha ya pasó.`), sources: [overdueTheirs[0].sourceId] });
    for (const p of pulse.filter((x) => x.status === 'blocked' || x.status === 'at_risk').slice(0, 1)) items.push({ tag: 'FACT', lead: L(`${p.name} is ${p.statusLabel.toLowerCase()}.`, `${p.name}: ${p.statusLabel.toLowerCase()}.`), text: p.evidence, sources: [] });
    if (stale.length) items.push({ tag: 'FACT', lead: L('Some sources are missing.', 'Faltan algunas fuentes.'), text: L(`${stale.join(', ')} did not sync, so this brief may be incomplete.`, `${stale.join(', ')} no se sincronizó, así que este resumen puede estar incompleto.`), sources: [] });
    const sug = timeline.items.find((i) => i.suggested);
    if (sug) items.push({ tag: 'RECOMMENDATION', lead: L('Protect time:', 'Reserva tiempo:'), text: L(`${sug.meta.split(' · ')[0]} for “${sug.title.replace(/^(Work on|Trabajar en): /, '')}”.`, `${sug.meta.split(' · ')[0]} para “${sug.title.replace(/^(Work on|Trabajar en): /, '')}”.`), sources: [] });
    else if (priorities[0]) items.push({ tag: 'RECOMMENDATION', lead: L('Start with', 'Empieza por'), text: `“${priorities[0].title}”.`, sources: [] });
    const meetings = timeline.items.filter((i) => i.kind === 'Meeting').length;
    brief = {
      headline: priorities.length ? L(`${P(priorities.length, 'priority', 'priorities', '', '')} and ${P(meetings, 'meeting', 'meetings', '', '')} today${conflicts.length ? ', with a schedule conflict to resolve' : ''}.`, `${P(priorities.length, '', '', 'prioridad', 'prioridades')} y ${P(meetings, '', '', 'reunión', 'reuniones')} hoy${conflicts.length ? ', con un choque de horario por resolver' : ''}.`) : meetings ? L(`A lighter day: ${P(meetings, 'meeting', 'meetings', '', '')} and nothing urgent detected.`, `Un día más tranquilo: ${P(meetings, '', '', 'reunión', 'reuniones')} y nada urgente detectado.`) : L('Nothing urgent detected in your connected sources.', 'No se detectó nada urgente en tus fuentes conectadas.'),
      items: items.slice(0, n), nextSteps: {}, basis: 'rules'
    };
  }
  return { ...brief, chips, aiError, generatedAt: now.toISOString(), sourcesUsed: Object.values(db.sync).map((s) => ({ label: s.label, status: s.status, records: s.records, lastSuccess: s.lastSuccess })) };
}

// ---------- meeting prep ----------
export async function prepMeeting(eventId, { force = false } = {}) {
  const e = db.events[eventId]; if (!e) throw new Error(L('Event not found', 'Evento no encontrado'));
  const cached = db.insights.prep?.[eventId];
  if (cached && !force && Date.now() - new Date(cached.generatedAt) < 6 * 3600000) return cached;
  const now = new Date();
  const rel = relatedToEvent(e, now);
  const people = e.attendees.filter((a) => !a.self).map((a) => a.name || a.email);
  const iOwe = rel.commitments.filter((c) => c.direction === 'i_owe'); const theyOwe = rel.commitments.filter((c) => c.direction === 'they_owe');
  const base = {
    eventId, title: e.title, when: `${relDay(e.start, now)} ${fmtTime(e.start)}–${fmtTime(e.end)}`, people,
    documents: rel.documents.map((d) => ({ id: d.id, name: d.name, link: d.link, when: ago(d.modifiedTime, now), by: d.modifiedBy })),
    messages: rel.messages.slice(0, 5).map((m) => ({ id: m.id, from: m.isSent ? L('You', 'Tú') : m.from.name, subject: m.subject, when: ago(m.date, now), link: m.link })),
    previous: rel.previous.map((p) => ({ id: p.id, title: p.title, when: fmtDay(p.start), notes: p.description.slice(0, 300) }))
  };
  let sections = null; let basis = 'rules';
  if (aiEnabled()) {
    try {
      const out = await askJson({
        maxTokens: 1800, system: `You prepare a compact meeting brief. ${HONESTY} ${AI_LANG()}`,
        prompt: `Meeting: ${JSON.stringify({ id: e.id, title: e.title, when: base.when, description: e.description, attendees: people })}
Related emails: ${JSON.stringify(rel.messages.map((m) => ({ id: m.id, from: m.isSent ? 'user' : m.from.name, subject: m.subject, date: m.date, text: (m.body || m.snippet).slice(0, 600) })))}
Related documents (names only, contents unknown): ${JSON.stringify(rel.documents.map((d) => ({ id: d.id, name: d.name, modified: d.modifiedTime, by: d.modifiedBy })))}
Open commitments: ${JSON.stringify(rel.commitments.map((c) => ({ id: c.id, direction: c.direction, person: c.person?.name, what: c.what, quote: c.quote, state: commitmentState(c, now).label })))}
Previous meetings: ${JSON.stringify(rel.previous.map((p) => ({ id: p.id, date: p.start, notes: p.description })))}
Return {"purpose":{"text","tag","sources"},"unresolved":{"text","tag","sources"},"you_owe":{"text","tag","sources"},"they_owe":{"text","tag","sources"},"prep":{"text","tag":"RECOMMENDATION","sources"}}. Use "${L('Not found in your data.', 'No se encontró en tus datos.')}" when unknown. Do not describe document contents — only names are known.`
      });
      const ids = allIds();
      const sec = (x) => ({ text: String(x?.text || L('Not found in your data.', 'No se encontró en tus datos.')).slice(0, 400), tag: cleanTag(x?.tag), sources: cleanSources(x?.sources, ids) });
      sections = { purpose: sec(out.purpose), unresolved: sec(out.unresolved), youOwe: sec(out.you_owe), theyOwe: sec(out.they_owe), prep: { ...sec(out.prep), tag: 'RECOMMENDATION' } };
      basis = 'ai';
    } catch (err) { base.aiError = err.message; }
  }
  if (!sections) {
    const firstLine = e.description.split(/\n|(?<=\.)\s/)[0];
    const prevNote = rel.previous[0]?.description.match(/[^.\n]*(open issue|unresolved|pending|follow[- ]up|todo|blocker)[^.\n]*/i)?.[0];
    sections = {
      purpose: firstLine ? { text: firstLine, tag: 'FACT', sources: [e.id] } : { text: L('No agenda in the invite.', 'La invitación no tiene agenda.'), tag: 'FACT', sources: [] },
      unresolved: prevNote ? { text: prevNote.trim(), tag: 'FACT', sources: [rel.previous[0].id] } : { text: L('Nothing recorded from earlier meetings.', 'No hay nada registrado de reuniones anteriores.'), tag: 'FACT', sources: [] },
      youOwe: iOwe.length ? { text: iOwe.map((c) => `${c.what} (${commitmentState(c, now).label})`).join('; '), tag: 'FACT', sources: iOwe.map((c) => c.sourceId) } : { text: L('No open commitments found.', 'No hay compromisos abiertos.'), tag: 'FACT', sources: [] },
      theyOwe: theyOwe.length ? { text: theyOwe.map((c) => `${c.person?.name}: ${c.what}`).join('; '), tag: 'FACT', sources: theyOwe.map((c) => c.sourceId) } : { text: L('No open commitments found.', 'No hay compromisos abiertos.'), tag: 'FACT', sources: [] },
      prep: { text: base.documents.length ? L(`Skim ${base.documents.slice(0, 2).map((d) => '“' + d.name + '”').join(' and ')} before ${fmtTime(new Date(new Date(e.start) - 30 * 60000))}.`, `Revisa ${base.documents.slice(0, 2).map((d) => '“' + d.name + '”').join(' y ')} antes de las ${fmtTime(new Date(new Date(e.start) - 30 * 60000))}.`) : base.messages.length ? L(`Re-read the latest thread (“${base.messages[0].subject}”).`, `Relee el último correo (“${base.messages[0].subject}”).`) : L('No related material found — ask the organizer for an agenda.', 'No se encontró material relacionado — pide la agenda a quien organiza.'), tag: 'RECOMMENDATION', sources: [] }
    };
  }
  const result = { ...base, sections, basis, generatedAt: new Date().toISOString() };
  (db.insights.prep ||= {})[eventId] = result;
  return result;
}

// ---------- Chief of Staff ----------
function contextForChat(now) {
  const ins = db.insights;
  return {
    now: now.toString(), user: myEmail(),
    priorities: (ins.priorities || []).map((p) => ({ id: p.refId, title: p.title, level: p.level, due: p.dueLabel })),
    today: (ins.timeline?.items || []).map((i) => ({ id: i.eventId || i.taskId || i.id, kind: i.kind, title: i.title, when: i.time ? fmtTime(i.time) : L('today', 'hoy'), meta: i.meta })),
    schedule_problems: (ins.timeline?.issues || []).map((i) => i.title),
    next_7_days: Object.values(db.events).filter((e) => new Date(e.start) > endOfDay(now) && new Date(e.start) < addDays(now, 7)).sort((a, b) => a.start.localeCompare(b.start)).map((e) => ({ id: e.id, title: e.title, when: fmtDay(e.start) + ' ' + fmtTime(e.start), people: e.attendees.filter((a) => !a.self).slice(0, 5).map((a) => a.name) })),
    needs_reply: visibleTriage('needs_reply').map((m) => ({ id: m.id, from: m.from.name, subject: m.subject, summary: m.triage.summary, age: ago(m.date, now), project: db.projects[m.project]?.name })),
    waiting_on: visibleTriage('waiting_on').map((m) => ({ id: m.id, to: m.to[0]?.name, subject: m.subject, age: ago(m.date, now) })),
    important: visibleTriage('important').slice(0, 10).map((m) => ({ id: m.id, from: m.from.name, subject: m.subject, summary: m.triage.summary })),
    commitments: Object.values(db.commitments).filter((c) => c.status === 'open').map((c) => ({ id: c.id, direction: c.direction, person: c.person?.name, what: c.what, quote: c.quote, state: commitmentState(c, now).label, detected: fmtDay(c.detectedAt) })),
    tasks: openTasks().map((t) => ({ id: t.id, title: t.title, due: t.due ? fmtDay(t.due) + (t.dueHasTime ? ' ' + fmtTime(t.due) : '') : null, status: t.status, project: db.projects[t.project]?.name, postponed: t.postponed || 0, source: t.source })),
    projects: (ins.pulse || []).map((p) => ({ name: p.name, status: p.statusLabel, evidence: p.evidence, next: p.next })),
    changes_since_yesterday: (ins.changes || []).map((c) => c.text + (c.ctx ? ' — ' + c.ctx : '')),
    recent_documents: Object.values(db.documents).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)).slice(0, 25).map((d) => ({ id: d.id, name: d.name, by: d.modifiedBy, when: ago(d.modifiedTime, now) })),
    decisions: Object.values(db.decisions).map((d) => ({ id: d.id, decision: d.decision, date: fmtDay(d.date) })),
    missing_sources: staleSources()
  };
}

function ruleAnswer(q, now) {
  const ql = q.toLowerCase(); const ins = db.insights;
  const commit = (dir) => Object.values(db.commitments).filter((c) => c.direction === dir && c.status === 'open');
  const ci = (c) => ({ tag: c.confidence === 'clear' ? 'FACT' : 'INFERENCE', text: `${dir(c)} — ${c.what} (${commitmentState(c, now).label}). “${c.quote}”`, sources: [c.sourceId] });
  const dir = (c) => (c.direction === 'i_owe' ? L('You → ', 'Tú → ') + c.person?.name : `${c.person?.name} → ` + L('you', 'ti'));
  let items = []; let note = '';
  if (/forget|missing|slip|olvid|falt|se me pas/.test(ql)) {
    items = [...commit('i_owe').filter((c) => ['overdue', 'today', 'nodate'].includes(commitmentState(c, now).key)).map(ci),
      ...visibleTriage('needs_reply').filter((m) => now - new Date(m.date) > 2 * DAY).map((m) => ({ tag: 'FACT', text: L(`${m.from.name} has waited ${ago(m.date, now)} for a reply: “${m.subject}”.`, `${m.from.name} lleva ${ago(m.date, now)} esperando respuesta: “${m.subject}”.`), sources: [m.id] })),
      ...openTasks().filter((t) => t.due && new Date(t.due) < now).map((t) => ({ tag: 'FACT', text: L(`Overdue task: ${t.title}.`, `Tarea vencida: ${t.title}.`), sources: [t.id] }))];
  } else if (/waiting|owe me|owes me|who owes|esper|me debe|me deben|quién me|quien me/.test(ql)) {
    items = [...commit('they_owe').map(ci), ...visibleTriage('waiting_on').map((m) => ({ tag: 'FACT', text: L(`No reply yet from ${m.to[0]?.name} to “${m.subject}” (${ago(m.date, now)}).`, `${m.to[0]?.name} aún no responde “${m.subject}” (${ago(m.date, now)}).`), sources: [m.id] }))];
  } else if (/commit|promis|i owe|compromis|prometí|prometi|debo/.test(ql)) items = commit('i_owe').map(ci);
  else if (/deadline|due|coming up|plazo|vence|vencen|fecha|próxim|proxim/.test(ql)) {
    items = [...openTasks().filter((t) => t.due && new Date(t.due) < addDays(now, 7)).sort((a, b) => a.due.localeCompare(b.due)).map((t) => ({ tag: 'FACT', text: `${t.title} — ` + L('due ', 'vence ') + `${relDay(t.due, now)}${t.dueHasTime ? ' ' + fmtTime(t.due) : ''}.`, sources: [t.id] })),
      ...Object.values(db.commitments).filter((c) => c.status === 'open' && c.promisedDate && new Date(c.promisedDate) < addDays(now, 7)).map(ci)];
  } else if (/chang|since yesterday|new|cambi|desde ayer|nuevo/.test(ql)) items = (ins.changes || []).map((c) => ({ tag: 'FACT', text: c.text + (c.ctx ? ' — ' + c.ctx : ''), sources: [] }));
  else if (/repl|email|inbox|respond|correo|bandeja/.test(ql)) items = visibleTriage('needs_reply').map((m) => ({ tag: 'FACT', text: `${m.from.name}: “${m.subject}” — ${m.triage.summary}`, sources: [m.id] }));
  else if (/week|semana/.test(ql)) items = Object.values(db.events).filter((e) => new Date(e.start) >= now && new Date(e.start) < addDays(now, 7) && needsPrep(e)).sort((a, b) => a.start.localeCompare(b.start)).map((e) => ({ tag: 'FACT', text: `${fmtDay(e.start)} ${fmtTime(e.start)} — ${e.title}.`, sources: [e.id] }));
  else if (/meeting|prep|reuni/.test(ql)) {
    const next = eventsOnDay(now).concat(eventsOnDay(addDays(now, 1))).find((e) => new Date(e.start) > now && !e.allDay);
    items = next ? [{ tag: 'FACT', text: L(`Next: ${next.title} at ${fmtTime(next.start)} with ${next.attendees.filter((a) => !a.self).map((a) => a.name).join(', ') || 'no one else'}. Use “Prep me” on the timeline for the full brief.`, `Siguiente: ${next.title} a las ${fmtTime(next.start)} con ${next.attendees.filter((a) => !a.self).map((a) => a.name).join(', ') || 'nadie más'}. Usa “Prepárame” en la agenda para el resumen completo.`), sources: [next.id] }] : [];
  } else if (/focus|priorit|should i|first|next|enfoc|prioridad|primero|siguiente|deber/.test(ql)) items = (ins.priorities || []).map((p) => ({ tag: 'RECOMMENDATION', text: `${p.rank}. ${p.title} — ${p.dueLabel}.`, sources: p.sources.map((s) => s.id).filter(Boolean).slice(0, 2) }));
  else { const hits = search(q).slice(0, 6); items = hits.map((h) => ({ tag: 'FACT', text: `${h.typeLabel || h.type}: ${h.title}${h.sub ? ' — ' + h.sub : ''}`, sources: [h.id] })); note = L('Showing search matches. Add an Anthropic API key in Settings for free-form answers.', 'Mostrando coincidencias de búsqueda. Agrega una clave de Anthropic en Ajustes para respuestas libres.'); }
  if (!items.length) items = [{ tag: 'FACT', text: L('Nothing found in your connected sources for that.', 'No se encontró nada sobre eso en tus fuentes conectadas.'), sources: [] }];
  return { answer: items.slice(0, 10), note, actions: [], basis: 'rules' };
}

export async function chat(q) {
  const now = new Date();
  let out = null;
  if (aiEnabled()) {
    try {
      const ctx = contextForChat(now);
      const hits = search(q).slice(0, 12).map((h) => ({ id: h.id, type: h.type, title: h.title, sub: h.sub, when: h.when }));
      const history = db.chat.slice(-6).map((c) => ({ q: c.q, a: (c.answer || []).map((a) => a.text).join(' ') }));
      const r = await askJson({
        maxTokens: 2000,
        system: `You are the user's AI Chief of Staff. Reason across email, calendar, tasks, documents and commitments together. ${HONESTY}
You cannot send email, change calendars or delete anything. You may PROPOSE actions; the user confirms them. ${AI_LANG()} Keep tag values in English.`,
        prompt: `Data:\n${JSON.stringify(ctx)}\nSearch matches for the question:\n${JSON.stringify(hits)}\nRecent conversation:\n${JSON.stringify(history)}
Question: ${q}
Return {"answer":[{"tag":"FACT|INFERENCE|RECOMMENDATION","text":"...","sources":["ids"]}],"note":"caveats (e.g. missing sources) or empty","actions":[{"type":"create_task","title":"...","due":"YYYY-MM-DD or null"}|{"type":"reschedule_task","task_id":"...","due":"YYYY-MM-DD"}|{"type":"draft_reply","message_id":"..."}]}`
      });
      const ids = allIds();
      const actions = (r.actions || []).filter((a) => (a.type === 'create_task' && a.title) || (a.type === 'reschedule_task' && db.tasks[a.task_id] && /^\d{4}-\d{2}-\d{2}$/.test(a.due)) || (a.type === 'draft_reply' && db.messages[a.message_id])).slice(0, 6)
        .map((a) => ({ ...a, label: a.type === 'create_task' ? L(`Create task: ${a.title}`, `Crear tarea: ${a.title}`) : a.type === 'reschedule_task' ? L(`Move “${db.tasks[a.task_id].title}” to ${fmtDay(a.due + 'T12:00:00')}`, `Mover “${db.tasks[a.task_id].title}” al ${fmtDay(a.due + 'T12:00:00')}`) : L(`Draft reply to ${db.messages[a.message_id].from.name}`, `Redactar respuesta a ${db.messages[a.message_id].from.name}`) }));
      out = { answer: (r.answer || []).slice(0, 10).map((a) => ({ tag: cleanTag(a.tag), text: String(a.text || '').slice(0, 600), sources: cleanSources(a.sources, ids) })), note: String(r.note || ''), actions, basis: 'ai' };
    } catch (e) { out = { ...ruleAnswer(q, now), note: L(`AI unavailable (${e.message}). Showing a rules-based answer.`, `IA no disponible (${e.message}). Se muestra una respuesta basada en reglas.`) }; }
  } else out = ruleAnswer(q, now);
  out.sourcesInfo = Object.fromEntries(out.answer.flatMap((a) => a.sources).map((id) => [id, describe(id)]));
  const entry = { id: uid('chat'), q, at: now.toISOString(), ...out };
  db.chat.push(entry); db.chat = db.chat.slice(-40);
  return entry;
}

export function describe(id) {
  const m = db.messages[id]; if (m) return { type: L('Email', 'Correo'), label: `${m.isSent ? L('You → ', 'Tú → ') + (m.to[0]?.name || '') : m.from.name} — ${m.subject}`, when: fmtDay(m.date), link: m.link };
  const e = db.events[id]; if (e) return { type: L('Calendar', 'Calendario'), label: e.title, when: fmtDay(e.start) + ' ' + fmtTime(e.start), link: e.link };
  const t = db.tasks[id]; if (t) return { type: L('Task', 'Tarea'), label: t.title, when: t.due ? fmtDay(t.due) : L('no date', 'sin fecha'), link: t.link };
  const d = db.documents[id]; if (d) return { type: L('Document', 'Documento'), label: d.name, when: fmtDay(d.modifiedTime), link: d.link };
  const c = db.commitments[id]; if (c) return { type: L('Commitment', 'Compromiso'), label: c.what, when: fmtDay(c.detectedAt), link: c.link };
  const x = db.decisions[id]; if (x) return { type: L('Decision', 'Decisión'), label: x.decision, when: fmtDay(x.date), link: x.link };
  return null;
}

// ---------- quick capture ----------
export async function parseCapture(text) {
  const now = new Date();
  if (aiEnabled()) {
    try {
      const r = await askJson({
        maxTokens: 600, system: `You turn a quick note (in any language) into a structured item. ${HONESTY} ${AI_LANG()}`,
        prompt: `Today is ${now.toDateString()} (${now.toTimeString().slice(0, 5)}). "Morning" means ${settings().morningMeans}. Known people: ${JSON.stringify(Object.values(db.people).slice(0, 80).map((p) => p.name))}.
Text: ${JSON.stringify(text)}
Return {"type":"task|reminder|note|follow_up|event","title":"short imperative title","date":"YYYY-MM-DD or null","time":"HH:MM or null","person":"name from known people or as written, or null","context":"topic or null","assumptions":["each assumption you made"]}`
      });
      return { type: r.type || 'task', title: r.title || text, date: r.date || null, time: r.time || null, person: r.person || null, context: r.context || null, assumptions: (r.assumptions || []).slice(0, 4), basis: 'ai' };
    } catch { /* fall back */ }
  }
  const w = parseWhen(text, now, settings().morningMeans);
  const type = /\bremind\b|recu[ée]rd|recordar/i.test(text) ? 'reminder' : /^\s*(note|nota)\b/i.test(text) ? 'note' : /\bfollow[ -]?up\b|seguimiento/i.test(text) ? 'follow_up' : /\b(meeting|schedule|call with)\b|reuni[óo]n|agendar|llamada con/i.test(text) ? 'event' : 'task';
  let title = text.replace(/^\s*(remind me (to|about)|i need to|todo:?|note:?|task:?|recu[ée]rdame (que |de )?|recordar(me)? (que |de )?|tengo que |necesito |nota:? |tarea:? |pendiente:? )\s*/i, '');
  if (w.matched) title = title.replace(new RegExp('\\s*(on |by |next |this |el |para el |este |antes del )?' + w.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}])', 'iu'), '');
  title = title.replace(/\s*(\b(morning|afternoon|evening|tonight)\b|(por|en) la (mañana|tarde|noche)|a primera hora)\s*[.!?]?\s*$/iu, '').replace(/\s*a las \d{1,2}(:\d{2})?\s*[.!?]?\s*$/i, '').trim().replace(/[.!?]+$/, '');
  title = title.charAt(0).toUpperCase() + title.slice(1);
  const person = Object.values(db.people).find((p) => p.name && new RegExp('\\b' + p.name.split(' ')[0].replace(/[^a-z]/gi, '') + '\\b', 'i').test(text))?.name || (text.match(/\b(?:ask|tell|email|call|with|to)\s+([A-Z][a-z]+)/) || text.match(/(?:a|con|pregúntale a|preguntarle a|preguntar a|llamar a|escribir a|escribirle a|decirle a)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/u) || [])[1] || null;
  return { type, title, date: w.date ? dateKey(w.date) : null, time: w.hasTime ? `${String(w.date.getHours()).padStart(2, '0')}:${String(w.date.getMinutes()).padStart(2, '0')}` : null, person, context: null, assumptions: w.hasTime && /morning|mañana|primera hora/i.test(text) && !/\d/.test(text) ? [L(`“morning” = ${settings().morningMeans}`, `“mañana” = ${settings().morningMeans}`)] : [], basis: 'rules' };
}

// ---------- draft reply ----------
export async function draftReply(messageId) {
  const m = db.messages[messageId]; if (!m) throw new Error(L('Message not found', 'Mensaje no encontrado'));
  if (!aiEnabled()) throw new Error(L('Drafting needs an Anthropic API key (Settings → AI).', 'Para redactar se necesita una clave de Anthropic (Ajustes → IA).'));
  const list = (threads()[m.threadId] || [m]).slice(-6);
  const r = await askJson({
    maxTokens: 1200, system: `You draft email replies for ${myEmail()} in a clear, warm, professional voice. Never promise dates, numbers or deliverables that the user hasn't stated; use [placeholders] for anything unknown. Reply in the same language as the thread.`,
    prompt: `Thread (oldest first):\n${JSON.stringify(list.map((x) => ({ from: x.isSent ? 'user' : x.from.name, date: x.date, subject: x.subject, text: (x.body || x.snippet).slice(0, 1500) })))}\nReturn {"subject":"Re: ...","body":"the reply text","placeholders":["things the user must fill in"]}`
  });
  return { to: m.isSent ? m.to[0] : m.from, subject: r.subject || 'Re: ' + m.subject, body: r.body || '', placeholders: r.placeholders || [], link: m.link };
}

// ---------- weekly review ----------
export function weekly(now = new Date()) {
  const from = startOfDay(addDays(now, -6));
  const snaps = listSnapshotDates().filter((d) => d >= dateKey(from)).map(readSnapshot).filter(Boolean);
  const done = Object.values(db.tasks).filter((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt) >= from).map((t) => ({ title: t.title, when: relDay(t.completedAt, now) }));
  const delivered = Object.values(db.commitments).filter((c) => c.status === 'done' && c.statusChangedAt && new Date(c.statusChangedAt) >= from).map((c) => ({ title: `${c.what} (${c.direction === 'i_owe' ? L('you → ', 'tú → ') : ''}${c.person?.name}${c.direction === 'they_owe' ? L(' → you', ' → ti') : ''})`, when: relDay(c.statusChangedAt, now) }));
  const seen = {};
  for (const s of snaps) for (const p of s.priorities || []) { (seen[p.refId] ||= { title: p.title, days: 0, level: p.level }).days++; }
  const unfinished = Object.entries(seen).filter(([ref]) => { const t = db.tasks[ref]; const c = db.commitments[ref]; const m = db.messages[ref]; return (t && t.status !== 'done') || (c && c.status === 'open') || (m && m.triage?.category === 'needs_reply'); })
    .map(([ref, v]) => ({ title: v.title, days: v.days, postponed: db.tasks[ref]?.postponed || 0 })).sort((a, b) => b.days - a.days);
  for (const t of openTasks()) if ((t.postponed || 0) >= 2 && !unfinished.some((u) => u.title === t.title)) unfinished.push({ title: t.title, days: 0, postponed: t.postponed });
  const overdue = Object.values(db.commitments).filter((c) => c.status === 'open' && commitmentState(c, now).key === 'overdue').map((c) => ({ direction: c.direction, person: c.person?.name, what: c.what, promised: relDay(c.promisedDate, now) }));
  const first = snaps[0];
  const pulse = db.insights.pulse || [];
  const projects = pulse.map((p) => { const was = first?.projects?.find((x) => x.id === p.id); return { name: p.name, from: was?.pct ?? null, to: p.progress?.pct ?? null, wasStatus: was?.label || null, status: p.statusLabel, level: p.level, note: p.evidence }; });
  const decisions = Object.values(db.decisions).filter((d) => new Date(d.date) >= from).map((d) => ({ decision: d.decision, when: relDay(d.date, now), subject: d.subject, link: d.link }));
  const th = threads();
  const people = [];
  for (const m of visibleTriage('needs_reply')) if (now - new Date(m.date) > 3 * DAY) people.push({ name: m.from.name, why: L(`unanswered email “${m.subject}” · ${ago(m.date, now)}`, `correo sin responder “${m.subject}” · ${ago(m.date, now)}`) });
  for (const c of Object.values(db.commitments)) if (c.direction === 'they_owe' && c.status === 'open' && commitmentState(c, now).key === 'overdue') people.push({ name: c.person?.name, why: L(`owes you: ${c.what}`, `te debe: ${c.what}`) });
  for (const p of Object.values(db.people)) if (p.important && p.last && now - new Date(p.last) > 14 * DAY) people.push({ name: p.name, why: L(`no contact for ${ago(p.last, now)}`, `sin contacto hace ${ago(p.last, now)}`) });
  const pastEvents = Object.values(db.events).filter((e) => new Date(e.start) >= from && new Date(e.start) < now && !e.allDay && e.attendees.some((a) => !a.self));
  const hours = pastEvents.reduce((s, e) => s + (new Date(e.end) - new Date(e.start)) / 3600000, 0);
  const next = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(startOfDay(now), i);
    const evs = eventsOnDay(d).filter((e) => !e.allDay);
    const deadlines = [...openTasks().filter((t) => t.due && startOfDay(t.due).getTime() === d.getTime()).map((t) => t.title), ...Object.values(db.commitments).filter((c) => c.status === 'open' && c.promisedDate && startOfDay(c.promisedDate).getTime() === d.getTime()).map((c) => c.what)];
    const key = evs.filter(needsPrep)[0] || evs[0];
    next.push({ day: d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }).toUpperCase(), title: deadlines[0] || key?.title || L('Nothing scheduled', 'Nada programado'), ctx: deadlines.length > 1 ? '+' + P(deadlines.length - 1, 'more deadline', 'more deadlines', 'plazo más', 'plazos más') : key && deadlines[0] ? key.title : '', meetings: evs.length, deadlines: deadlines.length });
  }
  return {
    range: `${fmtDay(from)} – ${fmtDay(now)}`, snapshots: snaps.length,
    stats: { done: done.length + delivered.length, unfinished: unfinished.length, overdueMine: overdue.filter((o) => o.direction === 'i_owe').length, overdueTheirs: overdue.filter((o) => o.direction === 'they_owe').length, meetings: pastEvents.length, meetingHours: Math.round(hours) },
    done: [...done, ...delivered], unfinished, overdue, projects, decisions, people: people.slice(0, 8), next, summary: db.insights.weekSummary || null, threads: Object.keys(th).length
  };
}
export async function weeklySummary() {
  const w = weekly();
  const r = await askJson({ maxTokens: 700, system: `You summarize a professional's week. ${HONESTY} ${AI_LANG()}`, prompt: `Data: ${JSON.stringify(w)}\nReturn {"summary":"3–4 sentences: what got done, what slipped, the pressure points next week, one recommendation (labelled as such)."}` });
  db.insights.weekSummary = { text: r.summary, at: new Date().toISOString() };
  return db.insights.weekSummary;
}

// ---------- universal search ----------
export function search(q) {
  const fold = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const toks = fold(q).split(/[^\p{L}\p{N}@.]+/u).filter((t) => t.length > 1 && !['the', 'and', 'for', 'from', 'that', 'sent', 'last', 'with', 'about', 'what', 'find', 'show', 'everything', 'related', 'el', 'la', 'los', 'las', 'de', 'del', 'que', 'con', 'por', 'para', 'una', 'uno', 'un', 'mes', 'pasado', 'envio', 'mando', 'todo', 'sobre', 'buscar', 'busca', 'muestra', 'relacionado', 'relacionada'].includes(t));
  if (!toks.length) return [];
  const score = (s) => { s = fold(s); return toks.reduce((n, t) => n + (s.includes(t) ? 1 : 0), 0); };
  const now = new Date(); const out = [];
  const pid = Object.values(db.projects).find((p) => toks.some((t) => p.name.toLowerCase().includes(t)))?.id;
  for (const m of Object.values(db.messages)) { const s = score(`${m.subject} ${m.from.name} ${m.from.email} ${m.to.map((t) => t.name).join(' ')} ${m.body || m.snippet}`) + (pid && m.project === pid ? 1 : 0); if (s) out.push({ s, id: m.id, type: 'Email', typeLabel: L('Email', 'Correo'), title: m.subject, sub: m.isSent ? L('You → ', 'Tú → ') + (m.to[0]?.name || '') : m.from.name, when: relDay(m.date, now), t: m.date, link: m.link }); }
  for (const e of Object.values(db.events)) { const s = score(`${e.title} ${e.description} ${e.attendees.map((a) => a.name + ' ' + a.email).join(' ')}`) + (pid && e.project === pid ? 1 : 0); if (s) out.push({ s, id: e.id, type: 'Meeting', typeLabel: L('Meeting', 'Reunión'), title: e.title, sub: e.attendees.filter((a) => !a.self).slice(0, 3).map((a) => a.name).join(', '), when: relDay(e.start, now) + ' ' + fmtTime(e.start), t: e.start, link: e.link }); }
  for (const t of Object.values(db.tasks)) { const s = score(`${t.title} ${t.notes}`) + (pid && t.project === pid ? 1 : 0); if (s) out.push({ s, id: t.id, type: 'Task', typeLabel: L('Task', 'Tarea'), title: t.title, sub: t.status === 'done' ? L('Done', 'Hecha') : t.due ? L('Due ', 'Vence ') + relDay(t.due, now) : L('No date', 'Sin fecha'), when: '', t: t.due || '', link: t.link }); }
  for (const d of Object.values(db.documents)) { const s = score(`${d.name} ${d.modifiedBy}`) + (pid && d.project === pid ? 1 : 0); if (s) out.push({ s, id: d.id, type: 'Document', typeLabel: L('Document', 'Documento'), title: d.name, sub: L('edited by ', 'editado por ') + d.modifiedBy, when: relDay(d.modifiedTime, now), t: d.modifiedTime, link: d.link }); }
  for (const c of Object.values(db.commitments)) { const s = score(`${c.what} ${c.quote} ${c.person?.name}`) + (pid && c.project === pid ? 1 : 0); if (s) out.push({ s, id: c.id, type: 'Commitment', typeLabel: L('Commitment', 'Compromiso'), title: c.what, sub: c.direction === 'i_owe' ? L('You → ', 'Tú → ') + c.person?.name : `${c.person?.name} → ` + L('you', 'ti'), when: relDay(c.detectedAt, now), t: c.detectedAt, link: c.link }); }
  for (const p of Object.values(db.people)) { const s = score(`${p.name} ${p.email}`); if (s) out.push({ s: s + 0.5, id: 'person:' + p.email, type: 'Person', typeLabel: L('Person', 'Persona'), title: p.name, sub: p.email, when: p.last ? relDay(p.last, now) : '', t: p.last || '', link: `mailto:${p.email}` }); }
  return out.sort((a, b) => b.s - a.s || String(b.t).localeCompare(String(a.t))).slice(0, 30);
}

export { personName };
