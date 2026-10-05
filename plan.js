// Intelligence layer, part 2: priorities, timeline, project pulse, change detection, risks, snapshots.
import { db } from './store.js';
import { DAY, startOfDay, endOfDay, addDays, fmtTime, relDay, parseHM, dateKey, ago } from './dates.js';
import { settings, isImportantPerson, isImportantProject, urgentHours, commitmentState, isExternal, isMe, personName } from './core.js';

const projName = (id) => db.projects[id]?.name || null;
const hidden = (m) => { const h = db.hidden[m.threadId]; return !!h && (h.archived || (h.snoozeUntil && new Date(h.snoozeUntil) > new Date())); };
export const openTasks = () => Object.values(db.tasks).filter((t) => t.status !== 'done' && !t.duplicateOf);
const SRC_LABEL = { gmail: 'Gmail', gcal: 'Calendar', gdrive: 'Drive', gtasks: 'Google Tasks', native: 'Your tasks', demo: 'Demo' };

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
  if (!due) return 'No date';
  const d = new Date(due);
  if (d < now) return startOfDay(d).getTime() === startOfDay(now).getTime() ? `Overdue · was ${fmtTime(d)}` : `Overdue · since ${relDay(d, now)}`;
  const r = relDay(d, now);
  if (r === 'today') return hasTime ? `Due ${fmtTime(d)}` : 'Due today';
  return `Due ${r}${hasTime ? ' ' + fmtTime(d) : ''}`;
}

// ---------- priorities ----------
export function computePriorities(now = new Date()) {
  const eod = endOfDay(now); const tEnd = endOfDay(addDays(now, 1));
  const uh = urgentHours();
  const meetings = eventsOnDay(now).filter((e) => !e.allDay && new Date(e.end) > now);
  const meetingFor = (project, emails = []) => meetings.find((e) => (project && e.project === project) || others(e).some((a) => emails.includes(a.email)));
  const dl = (due) => { if (!due) return 0; const d = new Date(due); const h = (d - now) / 3600000; if (h < 0) return 40; if (uh && h <= uh) return 32; if (h <= 3) return 35; if (d <= eod) return 25; if (d <= tEnd) return 12; if (h <= 72) return 5; return 0; };
  const recentDocs = (pid) => pid ? Object.values(db.documents).filter((d) => d.project === pid).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)).slice(0, 2) : [];
  const recentMsgs = (pid) => pid ? Object.values(db.messages).filter((m) => m.project === pid && !m.bulk && !m.isSent).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2) : [];
  const docSrc = (d) => ({ kind: 'DOCUMENT', label: `${d.name} — edited by ${d.modifiedBy || 'unknown'}`, when: relDay(d.modifiedTime, now) + ' ' + fmtTime(d.modifiedTime), link: d.link, id: d.id });
  const msgSrc = (m) => ({ kind: 'EMAIL', label: `${m.isSent ? 'You → ' + (m.to[0]?.name || '') : m.from.name} — “${m.subject}”`, when: relDay(m.date, now) + ' ' + fmtTime(m.date), link: m.link, id: m.id });
  const evSrc = (e) => ({ kind: 'CALENDAR', label: `${e.title} — ${others(e).length} other attendee${others(e).length === 1 ? '' : 's'}`, when: relDay(e.start, now) + ' ' + fmtTime(e.start), link: e.link, id: e.id });
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
    if (mt) why.push({ tag: 'INFERENCE', text: `Likely needed for “${mt.title}” at ${fmtTime(mt.start)} — same project.` });
    if (prio) why.push({ tag: 'FACT', text: `Marked ${t.priority} priority.` });
    if (t.project && isImportantProject(t.project)) why.push({ tag: 'FACT', text: `${projName(t.project)} is one of your important projects.` });
    if (t.postponed >= 2) why.push({ tag: 'FACT', text: `Postponed ${t.postponed} times.` });
    if (uh && due && (due - now) / 3600000 <= uh && due > now) why.push({ tag: 'FACT', text: `Your rule: anything due within ${uh} hours is urgent.` });
    const docs = recentDocs(t.project); const msgs = recentMsgs(t.project);
    cands.push({
      id: 'p_' + t.id, kind: 'task', refId: t.id, title: t.title, score: dl(t.due) + prio + (t.project && isImportantProject(t.project) ? 15 : 0) + (mt ? 12 : 0) + Math.min(6, (t.postponed || 0) * 2),
      dueAt: t.due, dueLabel: dueLabel(t.due, now, t.dueHasTime), project: t.project, people: [...new Set(msgs.map((m) => m.from.name))],
      why, next: docs[0] ? `Open “${docs[0].name}” and finish the next step${due ? ' before ' + fmtTime(due) : ''}.` : msgs[0] ? `Re-read ${msgs[0].from.name}’s email “${msgs[0].subject}”, then finish the task.` : `Block time for it${due ? ' before ' + fmtTime(due) : ''}.`,
      action: { type: 'complete', label: 'Mark done', taskId: t.id }, link: t.link,
      sources: [{ kind: 'TASK', label: `${t.title} (${SRC_LABEL[t.source] || t.source})`, when: t.due ? relDay(t.due, now) + (t.dueHasTime ? ' ' + fmtTime(t.due) : '') : 'no date', link: t.link, id: t.id }, ...(mt ? [evSrc(mt)] : []), ...docs.map(docSrc), ...msgs.map(msgSrc)]
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
    const why = [{ tag: c.confidence === 'clear' ? 'FACT' : 'INFERENCE', text: `You wrote “${c.quote}” (${relDay(c.detectedAt, now)}).` }];
    if (st.key === 'overdue') why.push({ tag: 'FACT', text: `That date has passed.` });
    if (mt) why.push({ tag: 'FACT', text: `You meet ${c.person?.name} at ${fmtTime(mt.start)} (“${mt.title}”).` });
    cands.push({
      id: 'p_' + c.id, kind: 'commitment', refId: c.id, title: `${c.what} → ${c.person?.name}`, score: dl(c.promisedDate) + 10 + (imp ? 15 : 0) + (mt ? 12 : 0),
      dueAt: c.promisedDate, dueLabel: st.key === 'overdue' ? `Overdue · promised ${relDay(c.promisedDate, now)}` : dueLabel(c.promisedDate, now, false), project: c.project, people: [c.person?.name],
      why, next: mt ? `Send it before ${fmtTime(mt.start)} so it’s not open in the meeting.` : `Send it, or tell ${c.person?.name} the new date.`,
      action: m ? { type: 'draft', label: 'Draft reply', messageId: m.id } : { type: 'commit_done', label: 'Mark done', commitmentId: c.id }, link: c.link,
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
    const why = [{ tag: 'FACT', text: `${m.from.name} asked: “${(t.action || t.summary || m.subject).slice(0, 140)}”` }];
    if (t.deadline) why.push({ tag: t.deadline.date ? 'FACT' : 'INFERENCE', text: `Deadline in the email: “${t.deadline.text}”.` });
    if (mt) why.push({ tag: 'FACT', text: `You meet ${m.from.name} at ${fmtTime(mt.start)}.` });
    if (t.ruleApplied) why.push({ tag: 'FACT', text: `Your rule (${t.ruleApplied}) marks this important.` });
    if (age > 2 * DAY) why.push({ tag: 'FACT', text: `Waiting ${ago(m.date, now)} for your reply.` });
    cands.push({
      id: 'p_' + m.id, kind: 'reply', refId: m.id, title: `Reply to ${m.from.name}: ${m.subject}`, score: dl(t.deadline?.date) + (t.importance === 'high' ? 15 : 0) + (isImportantPerson(m.from.email) ? 10 : 0) + (mt ? 12 : 0) + (age > 2 * DAY ? 5 : 0),
      dueAt: t.deadline?.date || null, dueLabel: t.deadline ? (t.deadline.date ? dueLabel(t.deadline.date, now, true) : t.deadline.text) : `Received ${ago(m.date, now)} ago`, project: m.project, people: [m.from.name],
      why, next: mt ? `Reply before ${fmtTime(mt.start)}.` : 'Reply, or turn it into a task with a date.', action: { type: 'draft', label: 'Draft reply', messageId: m.id }, link: m.link, sources: [msgSrc(m), ...(mt ? [evSrc(mt)] : [])]
    });
  }

  for (const e of meetings) {
    if (new Date(e.start) <= now || !needsPrep(e)) continue;
    const rel = relatedToEvent(e, now);
    const ext = others(e).some((a) => isExternal(a.email)); const imp = others(e).some((a) => isImportantPerson(a.email));
    const hrs = (new Date(e.start) - now) / 3600000;
    const why = [{ tag: 'FACT', text: `${others(e).length} other attendee${others(e).length === 1 ? '' : 's'}${ext ? ', including external people' : ''}.` }];
    if (rel.commitments.length) why.push({ tag: 'FACT', text: `${rel.commitments.length} open commitment${rel.commitments.length > 1 ? 's' : ''} with these people.` });
    if (rel.documents.length) why.push({ tag: 'INFERENCE', text: `${rel.documents.length} related document${rel.documents.length > 1 ? 's' : ''} changed recently.` });
    cands.push({
      id: 'p_' + e.id, kind: 'meeting', refId: e.id, title: `Prepare for ${e.title}`, score: 8 + (hrs <= 3 ? 14 : 4) + (ext ? 8 : 0) + (imp ? 8 : 0) + (e.project && isImportantProject(e.project) ? 10 : 0) + rel.commitments.length * 3,
      dueAt: e.start, dueLabel: `Starts ${fmtTime(e.start)}`, project: e.project, people: others(e).slice(0, 3).map((a) => a.name),
      why, next: 'Open the meeting brief 30 minutes before.', action: { type: 'prep', label: 'Prep me', eventId: e.id }, link: e.link, sources: [evSrc(e), ...rel.documents.slice(0, 2).map(docSrc), ...rel.messages.slice(0, 2).map(msgSrc)]
    });
  }

  cands.sort((a, b) => b.score - a.score);
  return cands.filter((c) => c.score >= 10).slice(0, 7).map((c, i) => ({
    ...c, rank: i + 1, level: c.score >= 55 ? 'Critical' : c.score >= 30 ? 'High' : 'Normal', projectName: projName(c.project),
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
      flag(a.id, { label: 'Conflict', level: 'crit' }); flag(b.id, { label: 'Conflict', level: 'crit' });
      issues.push({ level: 'crit', title: `Conflict · ${span(s, e)}`, text: `“${a.title}” (${span(a.start, a.end)}) overlaps “${b.title}” (${span(b.start, b.end)}) by ${Math.round((e - s) / 60000)} minutes.`, eventIds: [a.id, b.id] });
    }
  }
  let chain = [timed[0]].filter(Boolean);
  const flushChain = () => { if (chain.length >= 3) issues.push({ level: 'warn', title: `Back-to-back ${span(chain[0].start, chain[chain.length - 1].end)}`, text: `${chain.length} meetings with no break.` }); };
  for (let i = 1; i < timed.length; i++) {
    const gap = (new Date(timed[i].start) - new Date(chain[chain.length - 1].end)) / 60000;
    if (gap < 5) chain.push(timed[i]); else { flushChain(); chain = [timed[i]]; }
  }
  flushChain();
  const mins = timed.reduce((s, e) => s + (Math.min(new Date(e.end), endOfDay(now)) - Math.max(new Date(e.start), startOfDay(now))) / 60000, 0);
  if (mins > 360) issues.push({ level: 'warn', title: `Heavy day · ${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m of meetings`, text: 'Consider moving anything that is not time-critical.' });
  for (const e of timed) {
    if (new Date(e.start) <= now || !needsPrep(e)) continue;
    const kw = new Set(words(e.title));
    const hasPrepBlock = timed.some((x) => x !== e && /\bprep/i.test(x.title) && new Date(x.end) <= new Date(e.start) && words(x.title).some((w) => kw.has(w)));
    if (hasPrepBlock) continue;
    const from = new Date(Math.max(now, new Date(e.start) - 2 * 3600000, dayStart));
    const slots = freeSlots(now, from, new Date(e.start), 15);
    if (!slots.length) { flag(e.id, { label: 'No prep time', level: 'warn' }); issues.push({ level: 'warn', title: `No prep time before ${e.title}`, text: `No free 15 minutes in the 2 hours before ${fmtTime(e.start)}.` }); }
  }
  for (const e of evs) {
    const o = others(e);
    items.push({ id: e.id, time: e.allDay ? null : e.start, end: e.end, allDay: e.allDay, kind: o.length ? 'Meeting' : 'Block', title: e.title,
      meta: [e.allDay ? 'All day' : span(e.start, e.end), e.location, e.meetLink ? 'Video call' : '', o.length ? `${o.length} other${o.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '),
      flags: flags[e.id] || [], eventId: e.id, prep: needsPrep(e), link: e.link, past: new Date(e.end) < now });
  }
  for (const t of openTasks()) {
    if (!t.due || startOfDay(t.due).getTime() !== startOfDay(now).getTime()) continue;
    const pr = priorities.find((p) => p.refId === t.id);
    items.push({ id: t.id, time: t.dueHasTime ? t.due : null, kind: 'Deadline', title: t.title, meta: `${SRC_LABEL[t.source] || t.source}${t.project ? ' · ' + projName(t.project) : ''}`, flags: pr && pr.level !== 'Normal' ? [{ label: pr.level, level: pr.level === 'Critical' ? 'crit' : 'warn' }] : [], taskId: t.id, link: t.link, past: false });
    if (t.dueHasTime && new Date(t.due) > now && pr && pr.level !== 'Normal') {
      const slots = freeSlots(now, new Date(Math.max(now, dayStart)), new Date(t.due), 30);
      if (!slots.length) issues.push({ level: 'warn', title: `No free time before ${t.title}`, text: `It’s due ${fmtTime(t.due)} and there is no free 30 minutes before then.` });
      else items.push({ id: 'sug_' + t.id, time: slots[0][0].toISOString(), end: slots[0][1].toISOString(), kind: 'Suggested', title: `Work on: ${t.title}`, meta: `${span(slots[0][0], slots[0][1])} is free · protects the ${fmtTime(t.due)} deadline`, flags: [], suggested: true });
    }
  }
  for (const c of Object.values(db.commitments)) {
    if (c.direction !== 'i_owe' || c.status !== 'open' || !c.promisedDate) continue;
    if (startOfDay(c.promisedDate).getTime() !== startOfDay(now).getTime()) continue;
    items.push({ id: c.id, time: null, kind: 'Promise', title: `${c.what} → ${c.person?.name}`, meta: `You promised this for today`, flags: [], link: c.link });
  }
  items.sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || String(a.time).localeCompare(String(b.time)));
  const free = freeSlots(now, new Date(Math.max(now, dayStart)), dayEnd, 15).reduce((s, [a, b]) => s + (b - a) / 60000, 0);
  return { items, issues, meetingMinutes: Math.round(mins), freeMinutes: Math.round(free) };
}

// ---------- project pulse ----------
export const PULSE = { blocked: ['Blocked', 'crit'], at_risk: ['At risk', 'crit'], attention: ['Needs attention', 'warn'], waiting: ['Waiting', 'info'], on_track: ['On track', 'ok'], quiet: ['No recent activity', 'mute'] };
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
    let status = 'quiet'; let evidence = 'No tasks, email, meetings or documents linked in the last 7 days.';
    if (blocked.length || theyOver.length) { status = 'blocked'; evidence = blocked.length ? `“${blocked[0].title}” is blocked${blocked[0].blockedBy ? ': ' + blocked[0].blockedBy : ''}.` : `${theyOver[0].person?.name} promised “${theyOver[0].what}” ${relDay(theyOver[0].promisedDate, now)} — overdue.`; }
    else if (overdue.length || iOver.length) { status = 'at_risk'; evidence = overdue.length ? `“${overdue[0].title}” is overdue (${relDay(overdue[0].due, now)}).` : `You promised “${iOver[0].what}” to ${iOver[0].person?.name} — overdue.`; }
    else if (soon.length || needReply.length) { status = 'attention'; evidence = soon.length ? `“${soon[0].title}” is due ${relDay(soon[0].due, now)}.` : `${needReply[0].from.name} is waiting for your reply.`; }
    else if (theyOpen.length) { status = 'waiting'; evidence = `Waiting on ${theyOpen[0].person?.name}: ${theyOpen[0].what}.`; }
    else if (msgs.length || docs.length || open.length || upcoming.length) { status = 'on_track'; evidence = 'Activity this week and nothing overdue or blocked.'; }
    const nextDated = [...open.filter((t) => t.due && new Date(t.due) >= now).map((t) => ({ label: t.title, date: t.due })), ...upcoming.slice(0, 3).map((e) => ({ label: e.title, date: e.start }))].sort((a, b) => a.date.localeCompare(b.date))[0];
    const activity = [...msgs.map((m) => ({ t: m.date, text: `${m.isSent ? 'You emailed ' + (m.to[0]?.name || '') : 'Email from ' + m.from.name}` })), ...docs.map((d) => ({ t: d.modifiedTime, text: `${d.name} edited by ${d.modifiedBy}` })), ...done.filter((t) => t.completedAt).map((t) => ({ t: t.completedAt, text: `Completed: ${t.title}` }))].sort((a, b) => b.t.localeCompare(a.t))[0];
    const next = blocked[0] && theyOver[0] ? `Follow up with ${theyOver[0].person?.name}` : overdue[0] ? overdue[0].title : iOver[0] ? `${iOver[0].what} → ${iOver[0].person?.name}` : needReply[0] ? `Reply to ${needReply[0].from.name}` : theyOver[0] ? `Follow up with ${theyOver[0].person?.name}` : open.filter((t) => t.status !== 'blocked').sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')))[0]?.title || '—';
    const total = open.length + done.length;
    return {
      id: p.id, name: p.name, owner: p.owner || 'You', status, statusLabel: PULSE[status][0], level: PULSE[status][1], evidence,
      milestone: nextDated ? { label: nextDated.label, date: nextDated.date, when: relDay(nextDated.date, now) } : null,
      progress: total ? { done: done.length, total, pct: Math.round((done.length / total) * 100) } : null,
      activity: activity ? { text: activity.text, when: ago(activity.t, now) } : null,
      blocker: blocked[0] ? (blocked[0].blockedBy || blocked[0].title) : theyOver[0] ? `Waiting on ${theyOver[0].person?.name}` : null,
      next, important: isImportantProject(p.id), counts: { open: open.length, overdue: overdue.length, messages: msgs.length, docs: docs.length }
    };
  });
}

// ---------- risks ----------
export function computeRisks(now, pulse, timeline) {
  const r = [];
  for (const p of pulse) if (p.status === 'blocked' || p.status === 'at_risk') r.push({ level: p.level, label: p.statusLabel, title: p.name, tag: 'FACT', text: p.evidence, evidence: p.milestone ? `Next milestone: ${p.milestone.label} · ${p.milestone.when}` : '' });
  for (const c of Object.values(db.commitments)) if (c.direction === 'they_owe' && c.status === 'open' && commitmentState(c, now).key === 'overdue' && !pulse.some((p) => p.id === c.project && p.status === 'blocked'))
    r.push({ level: 'warn', label: 'Overdue', title: `${c.person?.name}: ${c.what}`, tag: c.confidence === 'clear' ? 'FACT' : 'INFERENCE', text: `Promised “${c.quote}”`, evidence: `Email · ${relDay(c.detectedAt, now)}` });
  for (const i of timeline.issues.filter((x) => x.level === 'crit')) r.push({ level: 'crit', label: 'Schedule', title: i.title, tag: 'FACT', text: i.text, evidence: 'Calendar' });
  for (const t of openTasks()) if ((t.postponed || 0) >= 3) r.push({ level: 'warn', label: 'Postponed', title: t.title, tag: 'FACT', text: `Moved ${t.postponed} times.`, evidence: SRC_LABEL[t.source] || t.source });
  for (const [k, s] of Object.entries(db.sync)) if (s.status && s.status !== 'ok') r.push({ level: 'mute', label: 'Incomplete', title: `${s.label} not synced${s.lastSuccess ? ' since ' + relDay(s.lastSuccess, now) + ' ' + fmtTime(s.lastSuccess) : ''}`, tag: 'FACT', text: 'Anything that only exists there is missing from today’s view.', evidence: s.error || k });
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
  if (!prev) return [{ sym: '•', level: 'mute', text: 'First daily snapshot saved.', ctx: 'From tomorrow this section shows what changed overnight.' }];
  const out = []; const since = new Date(prev.createdAt);
  const inbound = Object.values(db.messages).filter((m) => !m.isSent && new Date(m.date) > since);
  const imp = inbound.filter((m) => ['needs_reply', 'important'].includes(m.triage?.category));
  if (inbound.length) out.push({ sym: '+', level: 'info', text: `${imp.length} important email${imp.length === 1 ? '' : 's'}`, ctx: `of ${inbound.length} received${imp.length ? ' · ' + [...new Set(imp.map((m) => m.from.name))].slice(0, 3).join(', ') : ''}` });
  const prevEv = Object.fromEntries(prev.events.map((e) => [e.id, e]));
  const curEv = Object.values(db.events).filter((e) => new Date(e.start) >= now && new Date(e.start) <= addDays(since, 7));
  const calOk = !db.sync.gcal || db.sync.gcal.status === 'ok';
  for (const e of curEv) {
    const p = prevEv[e.id];
    if (!p) out.push({ sym: '+', level: 'info', text: `New meeting: ${e.title}`, ctx: `${relDay(e.start, now)} ${fmtTime(e.start)}` });
    else if (p.start !== e.start) out.push({ sym: '~', level: 'warn', text: `Moved: ${e.title}`, ctx: `${relDay(p.start, now)} ${fmtTime(p.start)} → ${relDay(e.start, now)} ${fmtTime(e.start)}` });
  }
  if (calOk) for (const p of prev.events) if (new Date(p.start) >= now && !db.events[p.id]) out.push({ sym: '−', level: 'warn', text: `Removed: ${p.title}`, ctx: `was ${relDay(p.start, now)} ${fmtTime(p.start)}` });
  const prevOpen = Object.fromEntries(prev.tasksOpen.map((t) => [t.id, t]));
  for (const t of Object.values(db.tasks)) {
    const p = prevOpen[t.id];
    if (p && t.status === 'done') out.push({ sym: '✓', level: 'ok', text: `Completed: ${t.title}`, ctx: '' });
    else if (t.status !== 'done' && t.due && new Date(t.due) < now && new Date(t.due) > since) out.push({ sym: '!', level: 'crit', text: `Became overdue: ${t.title}`, ctx: `was due ${relDay(t.due, now)}` });
    else if (p && t.due && p.due && p.due !== t.due) { const later = t.due > p.due; out.push({ sym: '~', level: 'warn', text: `Deadline ${later ? 'pushed' : 'pulled in'}: ${t.title}`, ctx: `${relDay(p.due, now)} → ${relDay(t.due, now)}` }); }
  }
  const prevC = Object.fromEntries(prev.commitments.map((c) => [c.id, c]));
  for (const c of Object.values(db.commitments)) {
    const p = prevC[c.id];
    if (!p && c.status === 'open') out.push({ sym: '+', level: 'info', text: `New commitment: ${c.what}`, ctx: c.direction === 'i_owe' ? `you → ${c.person?.name}` : `${c.person?.name} → you` });
    else if (p && p.status === 'open' && c.status === 'done') out.push({ sym: '✓', level: 'ok', text: `Delivered: ${c.what}`, ctx: c.person?.name });
    else if (p && p.state !== 'overdue' && c.status === 'open' && commitmentState(c, now).key === 'overdue') out.push({ sym: '!', level: 'crit', text: `Commitment overdue: ${c.what}`, ctx: c.direction === 'i_owe' ? `you owe ${c.person?.name}` : `${c.person?.name} owes you` });
  }
  const prevP = Object.fromEntries(prev.projects.map((p) => [p.id, p]));
  for (const p of computePulse(now)) { const q = prevP[p.id]; if (q && q.status !== p.status) out.push({ sym: '!', level: p.level, text: `${p.name}: ${q.label} → ${p.statusLabel}`, ctx: p.evidence }); }
  const docs = Object.values(db.documents).filter((d) => new Date(d.modifiedTime) > since && !d.modifiedByMe);
  if (docs.length) out.push({ sym: '~', level: 'mute', text: docs.length === 1 ? `${docs[0].name} edited` : `${docs.length} shared files edited`, ctx: docs.slice(0, 3).map((d) => `${d.name} (${d.modifiedBy})`).join(', ') });
  for (const [k, s] of Object.entries(db.sync)) if (s.status !== 'ok' && prev.sources?.[k] === 'ok') out.push({ sym: '!', level: 'warn', text: `${s.label} stopped syncing`, ctx: s.error || '' });
  const order = { crit: 0, warn: 1, info: 2, ok: 3, mute: 4 };
  return out.sort((a, b) => order[a.level] - order[b.level]).slice(0, 14);
}

export function personLabel(email) { return personName(email); }
