// Intelligence layer, part 1: rules, people, projects (context graph), email triage, commitments.
import { db, config } from './store.js';
import { parseWhen, DAY } from './dates.js';
import { aiEnabled, askJson, HONESTY } from './ai.js';
import { DEMO_ME } from './demo.js';

export const settings = () => config.settings;
export const myEmail = () => (db.meta.demo ? DEMO_ME : (config.google.email || '')).toLowerCase();
export const isMe = (e) => !!e && e.toLowerCase() === myEmail();
const myDomain = () => myEmail().split('@')[1] || '';
export const isExternal = (e) => !!e && !!myDomain() && !e.endsWith('@' + myDomain()) && !isMe(e);

// ---------- user rules (explicit rules always override AI) ----------
export const RULE_TYPES = {
  important_sender: { label: 'Emails from … are always important', needs: 'email or @domain' },
  important_project: { label: 'Anything involving project … is high priority', needs: 'project name' },
  keyword_important: { label: 'Emails mentioning … are important', needs: 'word or phrase' },
  ignore_sender: { label: 'Ignore email from …', needs: 'email or @domain' },
  ignore_promotions: { label: 'Ignore promotional and bulk email', needs: '' },
  due_within: { label: 'Anything due within … hours is urgent', needs: 'hours' },
  amount_over: { label: 'Surface emails mentioning amounts over $…', needs: 'amount' }
};
const rules = (type) => (settings().rules || []).filter((r) => r.on && r.type === type);
const senderMatch = (email, v) => { v = String(v || '').toLowerCase().trim(); email = String(email || '').toLowerCase(); if (!v) return false; if (v.startsWith('@')) return email.endsWith(v); if (!v.includes('@')) return email.endsWith('@' + v); return email === v; };
export const isImportantPerson = (email) => !!email && ((settings().importantPeople || []).some((p) => senderMatch(email, p)) || rules('important_sender').some((r) => senderMatch(email, r.value)));
export const isIgnoredSender = (email) => rules('ignore_sender').some((r) => senderMatch(email, r.value));
export function isImportantProject(pid) {
  const p = db.projects[pid]; if (!p) return false;
  return !!p.important || rules('important_project').some((r) => r.value && p.name.toLowerCase().includes(r.value.toLowerCase().trim()));
}
export const urgentHours = () => Math.max(0, ...rules('due_within').map((r) => Number(r.value) || 0)) || 0;
function amountOver(text) {
  const lim = rules('amount_over').map((r) => Number(String(r.value).replace(/[^\d.]/g, '')) || 0).filter(Boolean);
  if (!lim.length) return false;
  const amounts = [...String(text).matchAll(/\$\s?([\d,]+(?:\.\d+)?)\s?(k|m)?/gi)].map((m) => parseFloat(m[1].replace(/,/g, '')) * (m[2] ? (m[2].toLowerCase() === 'k' ? 1e3 : 1e6) : 1));
  return amounts.some((a) => lim.some((l) => a >= l));
}

// ---------- context graph: projects ----------
export function matchProject(text, emails = []) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  let best = null; let bestScore = 0;
  for (const p of Object.values(db.projects)) {
    let s = 0;
    if (p.name && t.includes(p.name.toLowerCase())) s += 3;
    for (const k of p.keywords || []) if (k && k.length > 1 && t.includes(k.toLowerCase())) s += 2;
    for (const e of emails) if ((p.people || []).map((x) => x.toLowerCase()).includes(e)) s += 1;
    if (s > bestScore) { best = p; bestScore = s; }
  }
  return bestScore >= 2 ? best.id : null;
}
export function linkProjects() {
  for (const m of Object.values(db.messages)) if (!m.projectManual) m.project = matchProject(m.subject + ' ' + m.body, [m.from.email, ...m.to.map((x) => x.email)]);
  for (const e of Object.values(db.events)) if (!e.projectManual) e.project = matchProject(e.title + ' ' + e.description, e.attendees.map((a) => a.email));
  for (const t of Object.values(db.tasks)) if (!t.projectManual && !(t.source === 'demo' && t.project)) t.project = matchProject(t.title + ' ' + (t.notes || '')) || t.project || null;
  for (const d of Object.values(db.documents)) if (!d.projectManual) d.project = matchProject(d.name);
  for (const c of Object.values(db.commitments)) if (!c.projectManual) { const m = db.messages[c.sourceId]; c.project = m?.project || matchProject(c.what, [c.person?.email]); }
}

// ---------- entity resolution: people ----------
export function resolvePeople() {
  const people = {};
  const touch = (p, when, dir) => {
    if (!p?.email || isMe(p.email) || !p.email.includes('@')) return;
    const x = (people[p.email] ||= { email: p.email, name: p.name || p.email, inbound: 0, outbound: 0, meetings: 0, last: null });
    if (p.name && p.name !== p.email) x.name = p.name;
    if (dir) x[dir]++;
    if (when && (!x.last || when > x.last)) x.last = when;
  };
  for (const m of Object.values(db.messages)) {
    if (m.bulk) continue;
    if (m.isSent) m.to.forEach((t) => touch(t, m.date, 'outbound')); else touch(m.from, m.date, 'inbound');
  }
  for (const e of Object.values(db.events)) e.attendees.forEach((a) => touch(a, e.start, 'meetings'));
  for (const p of Object.values(people)) p.important = isImportantPerson(p.email);
  db.people = people;
  return Object.keys(people).length;
}
export const personName = (email) => db.people[email]?.name || email;

// ---------- threads ----------
export function threads() {
  const map = {};
  for (const m of Object.values(db.messages)) (map[m.threadId] ||= []).push(m);
  for (const list of Object.values(map)) list.sort((a, b) => a.date.localeCompare(b.date));
  return map;
}
const REQUEST = /\?|\b(please|could you|can you|would you|let me know|need (you|your|a|an)|approve|review|confirm|thoughts|sign off|feedback)\b/i;
const NOISE_LABELS = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'];
export function deadlineIn(text, base) {
  const m = String(text || '').match(/\b(by|before|due|deadline:?|until|no later than)\s+([^.,;?!\n]{2,40})/i);
  if (!m) return null;
  const w = parseWhen(m[2], new Date(base), settings().morningMeans);
  return w.date ? { text: (m[1] + ' ' + m[2]).trim(), date: w.date.toISOString() } : null;
}

function rulesTriage(last, list) {
  const now = Date.now();
  const age = now - new Date(last.date);
  const ignore = (rules('ignore_promotions').length && (last.bulk || last.labels.some((l) => NOISE_LABELS.includes(l)))) || isIgnoredSender(last.from.email);
  if (last.isSent) {
    const to = last.to[0];
    if (age > 20 * 3600000 && age < 14 * DAY && to && !isMe(to.email) && REQUEST.test(last.body || last.snippet)) {
      return { category: 'waiting_on', importance: isImportantPerson(to.email) ? 'high' : 'normal', summary: (last.body || last.snippet).slice(0, 140), action: `Waiting for ${to.name || to.email} to reply`, basis: 'rules' };
    }
    return null;
  }
  if (ignore) return { category: 'noise', importance: 'low', summary: last.snippet.slice(0, 120), action: null, basis: 'rules' };
  if (last.bulk || last.labels.includes('CATEGORY_UPDATES')) return { category: 'fyi', importance: 'low', summary: last.snippet.slice(0, 140), action: null, basis: 'rules' };
  const direct = last.to.some((t) => isMe(t.email)) || list.some((m) => m.isSent);
  const text = (last.body || last.snippet);
  const imp = isImportantPerson(last.from.email) || last.labels.includes('IMPORTANT');
  if (direct && REQUEST.test(text)) { const ask = sentences(text).find((x) => REQUEST.test(x)) || text; return { category: 'needs_reply', importance: imp ? 'high' : 'normal', summary: text.slice(0, 160), action: ask.slice(0, 160), basis: 'rules' }; }
  if (imp) return { category: 'important', importance: 'normal', summary: text.slice(0, 160), action: null, basis: 'rules' };
  return { category: 'fyi', importance: 'low', summary: text.slice(0, 160), action: null, basis: 'rules' };
}

// Applies explicit user rules on top of AI or built-in triage.
function applyRules(t, last) {
  const text = last.subject + ' ' + (last.body || last.snippet);
  if (!last.isSent && (isIgnoredSender(last.from.email) || (rules('ignore_promotions').length && last.bulk && !isImportantPerson(last.from.email)))) return { ...t, category: 'noise', importance: 'low', ruleApplied: 'ignore' };
  const person = last.isSent ? last.to[0]?.email : last.from.email;
  let r = { ...t };
  if (isImportantPerson(person)) { r.importance = 'high'; if (r.category === 'fyi' || r.category === 'noise') r.category = 'important'; r.ruleApplied = 'important person'; }
  if (last.project && isImportantProject(last.project) && r.category !== 'noise') { r.importance = 'high'; if (r.category === 'fyi') r.category = 'important'; r.ruleApplied = 'important project'; }
  if (rules('keyword_important').some((k) => k.value && text.toLowerCase().includes(k.value.toLowerCase())) && r.category !== 'noise') { if (r.category === 'fyi') r.category = 'important'; r.ruleApplied = 'keyword'; }
  if (amountOver(text) && r.category !== 'noise') { if (r.category === 'fyi') r.category = 'important'; r.importance = 'high'; r.ruleApplied = 'amount'; }
  return r;
}

export async function triageEmail({ allowAi = true } = {}) {
  const th = threads();
  const reps = [];
  for (const [tid, list] of Object.entries(th)) {
    const last = list[list.length - 1];
    reps.push({ tid, list, last });
    for (const m of list) if (m !== last) delete m.triage;
  }
  let aiError = null; let aiCount = 0;
  if (allowAi && aiEnabled()) {
    const todo = reps.filter(({ last }) => !db.processed.classify[last.id] && !(last.isSent && Date.now() - new Date(last.date) < 20 * 3600000)).slice(0, 60);
    const projects = Object.values(db.projects).map((p) => p.name);
    for (let i = 0; i < todo.length; i += 30) {
      const batch = todo.slice(i, i + 30);
      try {
        const out = await askJson({
          maxTokens: 4000,
          system: `You triage email threads for a busy professional (${myEmail()}). ${HONESTY}`,
          prompt: `Today is ${new Date().toDateString()}. Known projects: ${JSON.stringify(projects)}.
For each thread (represented by its latest message), return:
{"items":[{"id":"...","category":"needs_reply|waiting_on|important|fyi|noise","importance":"high|normal|low","summary":"<=25 words, factual","action":"what is being asked of the user, or null","deadline":"deadline wording exactly as stated in the text, or null","project":"one of the known project names or null"}]}
- needs_reply: the latest message is from someone else and asks the user for something.
- waiting_on: the latest message is FROM the user and asks someone else for something.
- noise: promotions, newsletters, automated notifications with nothing to do.
- Never invent a deadline. If no deadline is written, use null.
Threads:\n${JSON.stringify(batch.map(({ last, list }) => ({ id: last.id, latest_is_from_user: last.isSent, from: last.from, to: last.to.slice(0, 3), subject: last.subject, date: last.date, labels: last.labels.filter((l) => /CATEGORY|IMPORTANT/.test(l)), bulk: last.bulk, text: (last.body || last.snippet).slice(0, 900), earlier_messages: list.length - 1 })))}`
        });
        for (const it of out.items || []) {
          if (!db.messages[it.id]) continue;
          const pid = Object.values(db.projects).find((p) => p.name === it.project)?.id || null;
          db.processed.classify[it.id] = { category: it.category, importance: it.importance, summary: it.summary, action: it.action || null, deadlineText: it.deadline || null, project: pid, basis: 'ai' };
          aiCount++;
        }
      } catch (e) { aiError = e.message; break; }
    }
  }
  const counts = {};
  for (const { list, last } of reps) {
    let t = db.processed.classify[last.id] || rulesTriage(last, list);
    if (!t) { delete last.triage; continue; }
    t = { ...t };
    // structural facts win over model judgement
    if (last.isSent && t.category !== 'waiting_on') { const r = rulesTriage(last, list); if (!r) { delete last.triage; continue; } t = r; }
    if (!last.isSent && t.category === 'waiting_on') t.category = 'needs_reply';
    if (!last.isSent && !last.inInbox && ['needs_reply', 'important'].includes(t.category)) { t.category = 'fyi'; t.action = null; t.archived = true; }
    if (t.project && !last.projectManual) last.project = t.project;
    const dl = deadlineIn(t.deadlineText ? 'by ' + t.deadlineText.replace(/^(by|before|due)\s+/i, '') : (last.body || last.snippet), last.date);
    t.deadline = dl || (t.deadlineText ? { text: t.deadlineText, date: null } : null);
    last.triage = applyRules(t, last);
    counts[last.triage.category] = (counts[last.triage.category] || 0) + 1;
  }
  return { counts, aiCount, aiError };
}

// ---------- commitments ----------
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const PROMISE = /\b(i'll|i will|i'm going to|i am going to|let me (get|send|share|check|follow|look|review|put)|we'll|we will|i can get you|i'll get you)\b/i;
const NOT_PROMISE = /\b(i'll be|we'll be|let me know|i will be|we will be|i'll see|i'll try)\b/i;
const sentences = (t) => String(t || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 8 && s.length < 300);
function whatOf(s) {
  let w = s.replace(/^(thanks[^.]*\.\s*|hi[^,]*,\s*|ok(ay)?[,.]\s*)/i, '').replace(/^.*?\b(i'll|i will|i'm going to|i am going to|we'll|we will|let me)\s+/i, '').replace(/[.!]+$/, '');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function ruleCommitments(m) {
  const out = [];
  const iOwe = m.isSent;
  for (const s of sentences(m.body || m.snippet)) {
    if (!PROMISE.test(s) || NOT_PROMISE.test(s)) continue;
    if (!iOwe && /^\s*(let me)/i.test(s)) continue;
    const person = iOwe ? m.to[0] : m.from;
    const w = parseWhen(s, new Date(m.date), settings().morningMeans);
    out.push({
      id: 'c_' + m.id + '_' + hash(s), direction: iOwe ? 'i_owe' : 'they_owe', person: { name: person?.name || person?.email, email: person?.email },
      what: whatOf(s), quote: s, promisedText: w.matched, promisedDate: w.date ? w.date.toISOString() : null,
      confidence: w.date && /\b(i'll|i will|we'll|we will|i'm going to)\b/i.test(s) ? 'clear' : 'possible',
      detectedAt: m.date, sourceType: 'email', sourceId: m.id, link: m.link, basis: 'rules', demo: m.source === 'demo' || undefined
    });
  }
  return out;
}
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[“”"’']/g, '').trim();

export async function extractCommitments({ allowAi = true } = {}) {
  const human = Object.values(db.messages).filter((m) => !m.bulk && (m.isSent || m.inInbox) && !(m.triage && m.triage.category === 'noise'));
  const todo = human.filter((m) => !db.processed.commit[m.id]);
  let aiError = null; let found = 0;
  const add = (c) => {
    const prev = db.commitments[c.id];
    db.commitments[c.id] = { ...c, status: prev?.status || 'open', statusChangedAt: prev?.statusChangedAt, project: prev?.projectManual ? prev.project : c.project, projectManual: prev?.projectManual };
    found++;
  };
  if (allowAi && aiEnabled() && todo.length) {
    for (let i = 0; i < Math.min(todo.length, 60); i += 20) {
      const batch = todo.slice(i, i + 20);
      try {
        const out = await askJson({
          maxTokens: 4000,
          system: `You extract commitments and decisions from email for ${myEmail()}. ${HONESTY}`,
          prompt: `Find promises to deliver something, made in these messages.
- direction "i_owe" when the message is FROM the user and the user promises something; "they_owe" when someone else promises something to the user.
- "quote" must be copied EXACTLY from the text (one sentence). If you cannot quote it, do not include it.
- "promised_date": YYYY-MM-DD only if the text states a time that can be resolved from the message date; else null. "promised_text": the time words as written, or null.
- confidence "clear" only for explicit promises with a time; otherwise "possible".
- Ignore pleasantries ("I'll be in touch", "let me know").
- Decisions: only explicit statements that something was decided/agreed.
Return {"commitments":[{"message_id","direction","person_email","person_name","what","quote","promised_text","promised_date","confidence"}],"decisions":[{"message_id","decision","quote"}]}
Messages:\n${JSON.stringify(batch.map((m) => ({ message_id: m.id, from_user: m.isSent, from: m.from, to: m.to.slice(0, 3), date: m.date, subject: m.subject, text: (m.body || m.snippet).slice(0, 1400) })))}`
        });
        for (const c of out.commitments || []) {
          const m = db.messages[c.message_id];
          if (!m || !c.quote || !norm(m.body || m.snippet).includes(norm(c.quote))) continue; // traceability check
          let pd = c.promised_date && /^\d{4}-\d{2}-\d{2}$/.test(c.promised_date) ? new Date(c.promised_date + 'T23:59:00') : null;
          if (pd && (isNaN(pd) || pd < new Date(m.date) - DAY)) pd = null; // a promise can't be due before it was made
          if (!pd && (c.promised_text || c.quote)) pd = parseWhen(c.promised_text || c.quote, new Date(m.date), settings().morningMeans).date;
          const person = c.direction === 'i_owe' ? (m.to.find((t) => t.email === c.person_email) || m.to[0]) : m.from;
          add({ id: 'c_' + m.id + '_' + hash(c.quote), direction: c.direction === 'they_owe' ? 'they_owe' : 'i_owe', person: { name: person?.name || c.person_name, email: person?.email || c.person_email }, what: String(c.what || whatOf(c.quote)).slice(0, 160), quote: c.quote, promisedText: c.promised_text || null, promisedDate: pd ? pd.toISOString() : null, confidence: c.confidence === 'clear' ? 'clear' : 'possible', detectedAt: m.date, sourceType: 'email', sourceId: m.id, link: m.link, basis: 'ai', demo: m.source === 'demo' || undefined });
        }
        for (const d of out.decisions || []) {
          const m = db.messages[d.message_id];
          if (!m || !d.quote || !norm(m.body || m.snippet).includes(norm(d.quote))) continue;
          db.decisions['d_' + m.id + '_' + hash(d.quote)] = { id: 'd_' + m.id + '_' + hash(d.quote), decision: d.decision, quote: d.quote, date: m.date, sourceId: m.id, link: m.link, subject: m.subject, demo: m.source === 'demo' || undefined };
        }
        for (const m of batch) db.processed.commit[m.id] = 'ai';
      } catch (e) { aiError = e.message; break; }
    }
  }
  for (const m of todo) {
    if (db.processed.commit[m.id]) continue;
    for (const c of ruleCommitments(m)) add(c);
    db.processed.commit[m.id] = 'rules';
  }
  // forget commitments whose source message aged out
  for (const [id, c] of Object.entries(db.commitments)) if (c.sourceType === 'email' && !db.messages[c.sourceId] && c.status !== 'open') delete db.commitments[id];
  return { found, aiError };
}

export function commitmentState(c, now = new Date()) {
  if (c.status === 'done') return { key: 'done', label: 'Done', level: 'ok' };
  if (c.status === 'dismissed') return { key: 'dismissed', label: 'Dismissed', level: 'mute' };
  if (!c.promisedDate) return { key: 'nodate', label: c.confidence === 'possible' ? 'Possible · no date' : 'Open · no date', level: c.confidence === 'possible' ? 'mute' : 'info' };
  const d = new Date(c.promisedDate);
  if (d < now) { const days = Math.max(1, Math.round((now - d) / DAY)); return { key: 'overdue', label: `Overdue · ${days}d`, level: 'crit' }; }
  if (d - now < DAY && d.getDate() === now.getDate()) return { key: 'today', label: 'Due today', level: 'warn' };
  return { key: 'open', label: 'On track', level: 'ok' };
}
