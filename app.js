// AI Operating System — presentation layer. Reads the view model from the local server; never calls providers directly.
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const realLink = (l) => l && l !== '#demo' && /^(https?:|mailto:)/.test(l);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

import { api as localApi, boot } from './js/api.js';
try { const t = localStorage.getItem('aios-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
const api = (path, opts = {}) => localApi(path, opts);
function toast(msg, err = false) {
  const el = document.createElement('div'); el.className = 'toast' + (err ? ' err' : ''); el.textContent = msg;
  $('#toast-root').appendChild(el); setTimeout(() => el.remove(), err ? 7000 : 3500);
}

let S = null;
const ui = { tab: 'inbox', box: 'needs_reply', why: new Set(), briefWhy: false, prep: null, preps: {}, prepBusy: null, capture: null, searchQ: '', searchRes: null, chatBusy: false, weekly: null, weeklyBusy: false, step: 1, busy: {}, chatDraft: '', newStep: '' };

// ---------- icons ----------
const I = {
  logo: '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="1" y="1" width="26" height="26" rx="7" stroke="var(--pri)" stroke-width="1.5"/><circle cx="14" cy="14" r="4.5" fill="var(--pri)"/><path d="M14 5v3M14 20v3M5 14h3M20 14h3" stroke="var(--pri)" stroke-width="1.5" stroke-linecap="round"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fa)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  focus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  gear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  refresh: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M20 11A8 8 0 0 0 6 6.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5l2-2.5M20 20v-5h-5"/></svg>',
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h0"/></svg>',
  ext: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
};
const LV = { Critical: 'crit', High: 'warn', Normal: 'info', Low: 'mute' };
const tag = (t) => `<span class="tag t-${esc(t)}">${esc(t)}</span>`;
const pill = (label, level) => `<span class="pill l-${esc(level)}">${esc(label)}</span>`;
const openLink = (link, label = 'Open') => (realLink(link) ? `<a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${esc(label)} ${I.ext}</a>` : '');
const initials = (n) => esc(String(n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
const fmtT = (iso) => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
const fmtWhen = (iso) => { if (!iso) return '—'; const d = new Date(iso); const today = new Date().toDateString() === d.toDateString(); return (today ? 'today ' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' ') + fmtT(iso); };

// ---------- routing ----------
const route = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || '') || 'today';
window.addEventListener('hashchange', () => { ui.searchRes = null; if (route() === 'weekly') loadWeekly(); render(); window.scrollTo(0, 0); });

async function load() {
  try { S = await api('/api/state'); } catch (e) { $('#app').innerHTML = `<div class="boot">Something went wrong loading your data: ${esc(e.message)}</div>`; return; }
  if (!S.app.hasSources && !S.app.onboarded && route() === 'today') { location.hash = '#/welcome'; return; }
  render();
}
let lastRunning = false;
let pollTimer = null;
addEventListener('aios-run', (e) => { if (!S) return; clearTimeout(pollTimer); if (e.detail === 'start') lastRunning = true; poll(); });
async function poll() {
  try {
    const next = await api('/api/state');
    const finished = lastRunning && !next.run.running;
    lastRunning = next.run.running; S = next;
    if (finished) { toast(S.run.last?.status === 'failed' ? 'Update finished with problems — see Settings → Last run.' : 'Dashboard updated.'); if (route() === 'weekly') loadWeekly(); }
    if (!isTyping()) render();
  } catch {}
  clearTimeout(pollTimer); pollTimer = setTimeout(poll, S?.run?.running ? 1500 : 45000);
}
const isTyping = () => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.value; };
// ---------- shell ----------
function topbar() {
  const r = route();
  const d = new Date();
  return `<header class="topbar"><div class="wrap topbar-in">
    <a class="brand" href="#/today">${I.logo}<span><span style="display:block;font-weight:600;font-size:15px">${r === 'today' ? 'Today' : r === 'focus' ? 'Focus' : r === 'weekly' ? 'Weekly review' : r === 'settings' ? 'Settings' : 'Welcome'}</span><span class="mono faint" style="font-size:11px">${esc(d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))}${S.app.demo ? ' · demo' : ''}</span></span></a>
    <div class="search">
      <label><span class="sr">Search or ask</span>${I.search}<input id="q" type="text" autocomplete="off" placeholder="Ask anything or find anything…" value="${esc(ui.searchQ)}" data-enter="search"><span class="mono faint small" style="border:1px solid var(--bd2);border-radius:4px;padding:1px 6px">Enter</span></label>
      ${ui.searchRes ? searchResults() : ''}
    </div>
    <nav class="nav" aria-label="Views">
      <button class="btn btn-p" data-act="capture-open">${I.plus} Capture</button>
      <a class="btn" href="#/focus" ${r === 'focus' ? 'aria-current="page"' : ''}>${I.focus} Focus</a>
      <a class="btn" href="#/weekly" ${r === 'weekly' ? 'aria-current="page"' : ''}>Weekly review</a>
      <a class="btn btn-g" href="#/settings" aria-label="Settings">${I.gear}</a>
      <button class="btn btn-g" data-act="theme" aria-label="Switch light or dark mode">${I.moon}</button>
    </nav>
  </div>${ui.capture ? captureBox() : ''}</header>`;
}
function statusStrip() {
  const run = S.run; const bad = S.sources.filter((s) => s.status && s.status !== 'ok');
  return `<div class="strip"><div class="wrap strip-in">
    ${S.app.demo ? `${pill('Demo data', 'warn')}<span class="muted">Sample records — not your real email or calendar. <a href="#/welcome">Connect Google</a> to replace them.</span>` : ''}
    ${!S.app.ai ? `<a href="#/settings" class="pill l-mute" style="text-decoration:none" title="Add an Anthropic API key for AI-written briefs, drafts and answers">AI off · rules mode</a>` : ''}
    <span class="grow"></span>
    ${run.running ? `<span class="row muted"><span class="spin"></span> Updating · ${esc(run.stage || '')}</span>` : `<span class="mono muted">${run.lastBriefAt ? 'Brief generated ' + esc(fmtWhen(run.lastBriefAt)) : 'No brief yet'}${run.last && run.last.type === 'live' ? ' · live ' + esc(fmtT(run.last.finishedAt)) : ''}</span>`}
    <button class="btn btn-sm" data-act="refresh" ${run.running || !S.app.hasSources ? 'disabled' : ''}>${I.refresh} Refresh now</button>
    ${S.app.google.connected && !S.app.google.tokenValid ? `<button class="row l-warn" style="padding:4px 10px;border-radius:999px;border:0;cursor:pointer;font:inherit" data-act="g-connect"><span class="dot"></span>Google session expired · tap to refresh</button>` : ''}
    ${bad.filter((x) => !(x.status === 'reconnect' && S.app.google.connected && !S.app.google.tokenValid)).map((s) => `<a href="#/settings" class="row l-${s.status === 'reconnect' ? 'warn' : 'crit'}" style="padding:4px 10px;border-radius:999px;text-decoration:none"><span class="dot"></span>${esc(s.label)} ${s.status === 'reconnect' ? 'needs reconnecting' : 'sync failed'} · insights may be incomplete</a>`).join('')}
  </div></div>`;
}
function render() {
  if (!S) return;
  const a = document.activeElement; const fid = a?.id; const sel = a && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  const r = route();
  const page = r === 'focus' ? focusPage() : r === 'weekly' ? weeklyPage() : r === 'settings' ? settingsPage() : r === 'welcome' ? welcomePage() : todayPage();
  $('#app').innerHTML = (r === 'welcome' ? '' : topbar() + (r === 'today' ? statusStrip() : '')) + page;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch {} } }
  const log = $('.chatlog'); if (log) log.scrollTop = log.scrollHeight;
}

// ---------- TODAY ----------
function todayPage() {
  return `<div class="wrap body"><main class="main">
    ${S.live.length ? liveBanner() : ''}
    ${briefCard()}
    ${prioritiesSection()}
    ${timelineSection()}
    ${attentionSection()}
    ${pulseSection()}
    <div class="grid2">${changesSection()}${upcomingSection()}</div>
  </main><aside class="aside">${chiefSection()}${waitingSection()}${sourcesSection()}</aside></div>`;
}
function liveBanner() {
  return `<section class="card pad" style="border-color:var(--pri-b)"><div class="sec-head" style="margin-bottom:8px"><span class="eyebrow c-info">New since this morning’s brief</span><span class="faint small">Live updates · the brief itself is regenerated tomorrow or when you refresh</span></div>
  <ul class="ul">${S.live.map((l) => `<li class="row s13" style="padding:4px 0"><span class="dot c-${esc(l.level)}"></span>${esc(l.text)}<span class="faint mono small">· ${esc(fmtT(l.at))}</span></li>`).join('')}</ul></section>`;
}
function briefCard() {
  const b = S.brief; const name = S.app.settings.name;
  const h = new Date().getHours(); const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  if (!b) {
    return `<section class="card brief"><span class="eyebrow c-info">Morning brief</span><h1 class="h1" style="margin:12px 0 8px">${greet}${name ? ', ' + esc(name) : ''}.</h1>
      <p class="muted" style="margin:0 0 16px">${S.app.hasSources ? (S.run.running ? 'Building your first brief…' : 'No brief yet today.') : 'Connect your tools to build your first Daily Brief.'}</p>
      ${S.app.hasSources ? `<button class="btn btn-p" data-act="refresh" ${S.run.running ? 'disabled' : ''}>Generate brief now</button>` : `<a class="btn btn-p" href="#/welcome">Connect accounts</a>`}</section>`;
  }
  return `<section class="card brief" aria-labelledby="brief-h">
    <div class="row" style="justify-content:space-between"><span class="eyebrow c-info">Morning brief · ${esc(fmtWhen(b.generatedAt))} · ${b.basis === 'ai' ? 'written by AI' : 'built-in rules'}</span><span class="row">${tag('FACT')}${tag('INFERENCE')}${tag('RECOMMENDATION')}</span></div>
    <h1 id="brief-h" class="h1" style="margin:12px 0 6px">${greet}${name ? ', ' + esc(name) : ''}. Here’s what matters today.</h1>
    <p class="muted" style="margin:0 0 16px;font-size:15px">${esc(b.headline)}</p>
    ${b.chips.length ? `<div class="row" style="margin-bottom:20px">${b.chips.map((c) => pill(c.label, c.level)).join('')}</div>` : ''}
    <ul class="ul" style="display:flex;flex-direction:column;gap:12px">${b.items.map((i) => `<li class="brief-li"><span>${tag(i.tag)}</span><span><strong style="font-weight:600">${esc(i.lead)}</strong> <span class="muted">${esc(i.text)}</span>${i.sources?.length ? ` <button class="btn-g btn btn-sm" style="min-height:24px;padding:0 6px" data-act="sources" data-ids="${esc(i.sources.join(','))}">${i.sources.length} source${i.sources.length > 1 ? 's' : ''}</button>` : ''}</span></li>`).join('')}</ul>
    ${b.aiError ? `<p class="small c-warn" style="margin:12px 0 0">AI was unavailable (${esc(b.aiError)}), so this brief uses built-in rules.</p>` : ''}
    <div class="row" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--bd)">
      <button class="btn btn-g" style="padding-left:0" data-act="brief-why">${I.info} ${ui.briefWhy ? 'Hide sources' : 'Why am I seeing this?'}</button><span class="grow"></span>
      <button class="btn" data-act="ask" data-q="What should I focus on today?">Ask a follow-up</button>
    </div>
    ${ui.briefWhy ? `<div class="why-box"><div class="eyebrow" style="margin-bottom:8px">What this brief was built from</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 24px" class="s13">${b.sourcesUsed.map((s) => `<span><span class="dot c-${s.status === 'ok' ? 'ok' : 'crit'}"></span> ${esc(s.label)} — ${s.status === 'ok' ? esc(s.records ?? 0) + ' records' : 'not synced since ' + esc(fmtWhen(s.lastSuccess))}</span>`).join('') || '<span class="faint">No sources</span>'}</div>
      <p class="small faint" style="margin:10px 0 0">Priorities come from deadlines, who is waiting, your rules and today’s meetings. Every item links back to its original email, event, task or file.</p></div>` : ''}
  </section>`;
}

function prioritiesSection() {
  const ps = S.priorities;
  return `<section aria-labelledby="prio-h"><div class="sec-head"><h2 id="prio-h" class="h2">Top priorities</h2><span class="small faint">Ranked by deadline, dependencies and who is waiting — shown as levels, not scores.</span></div>
  ${!ps.length ? `<div class="card empty">Nothing urgent detected. ${S.app.hasSources ? 'Enjoy the space — or add a task with Capture.' : ''}</div>` : `<ol class="card ul divide" style="overflow:hidden">${ps.map(prioRow).join('')}</ol>`}</section>`;
}
function prioRow(p) {
  const lv = LV[p.level] || 'info'; const open = ui.why.has(p.id);
  const act = p.action || {};
  return `<li class="prio"><span class="rank mono l-${lv}">${p.rank}</span><div style="min-width:0">
    <div class="row" style="gap:8px 12px"><h3 class="h3">${esc(p.title)}</h3>${pill(p.level, lv)}<span class="grow"></span><span class="mono small c-${lv}">${esc(p.dueLabel)}</span></div>
    <div class="row small faint" style="gap:4px 14px;margin-top:6px">${p.projectName ? `<span>Project · <span class="muted">${esc(p.projectName)}</span></span>` : ''}${p.people?.filter(Boolean).length ? `<span>People · <span class="muted">${esc(p.people.filter(Boolean).join(', '))}</span></span>` : ''}<span>From · <span class="muted">${esc(p.from)}</span></span></div>
    <div class="two"><div><div class="eyebrow" style="margin-bottom:4px">Why it matters</div>${p.why.map((w) => `<div style="margin-bottom:4px">${tag(w.tag)} ${esc(w.text)}</div>`).join('')}</div>
      <div><div class="eyebrow" style="margin-bottom:4px">Suggested next step</div>${tag('RECOMMENDATION')} ${esc(p.next)}</div></div>
    <div class="row" style="margin-top:14px">
      ${act.type ? `<button class="btn btn-p" data-act="prio-action" data-type="${esc(act.type)}" data-task="${esc(act.taskId || '')}" data-msg="${esc(act.messageId || '')}" data-event="${esc(act.eventId || '')}" data-commit="${esc(act.commitmentId || '')}">${esc(act.label)}</button>` : ''}
      ${openLink(p.link)}
      ${p.kind === 'task' ? `<button class="btn" data-act="focus-start" data-task="${esc(p.refId)}">${I.focus} Focus on this</button>` : ''}
      <button class="btn btn-g" data-act="why" data-id="${esc(p.id)}">${open ? 'Hide sources' : 'Why am I seeing this?'}</button>
    </div>
    ${open ? `<div class="why-box"><div class="eyebrow" style="margin-bottom:8px">Sources</div><ul class="ul" style="display:flex;flex-direction:column;gap:6px">${p.sources.map((s) => `<li class="row s13" style="align-items:baseline"><span class="tag t-FACT">${esc(s.kind)}</span><span>${esc(s.label)}</span><span class="mono faint small">${esc(s.when || '')}</span><span class="grow"></span>${realLink(s.link) ? `<a class="small" href="${esc(s.link)}" target="_blank" rel="noopener">Open source</a>` : ''}</li>`).join('')}</ul>${p.nextBasis === 'ai' ? '<p class="small faint" style="margin:8px 0 0">Next step suggested by AI from these sources.</p>' : ''}</div>` : ''}
  </div></li>`;
}

function timelineSection() {
  const t = S.timeline; const items = t.items || [];
  const h = (m) => `${Math.floor(m / 60)}h ${m % 60}m`;
  return `<section aria-labelledby="tl-h"><div class="sec-head"><h2 id="tl-h" class="h2">Today’s timeline</h2><span class="mono small faint">${h(t.meetingMinutes || 0)} in meetings · ${h(t.freeMinutes || 0)} free in working hours</span></div>
  <div class="card" style="padding:8px 0">
    ${(t.issues || []).filter((i) => i.level === 'crit').map((i) => `<div class="issue crit"><div class="grow" style="flex-basis:300px"><div style="font-weight:600" class="c-crit">${esc(i.title)}</div><div class="s13">${esc(i.text)}</div></div><button class="btn btn-sm" data-act="ask" data-q="${esc('How should I resolve this conflict: ' + i.text)}">Ask how to resolve</button></div>`).join('')}
    ${(t.issues || []).some((i) => i.level !== 'crit') ? `<div class="row" style="margin:4px 16px 8px">${t.issues.filter((i) => i.level !== 'crit').map((i) => `<span class="pill l-warn wrap" title="${esc(i.text)}">${esc(i.title)}</span>`).join('')}</div>` : ''}
    ${!items.length ? `<div class="empty">Nothing on your calendar or due today.</div>` : `<ol class="ul">${items.map(tlRow).join('')}</ol>`}
  </div></section>`;
}
function tlRow(i) {
  const dot = i.kind === 'Deadline' ? 'var(--crit)' : i.kind === 'Suggested' ? 'var(--fa)' : i.kind === 'Promise' ? 'var(--warn)' : i.kind === 'Block' ? 'var(--ok)' : 'var(--pri)';
  const open = ui.prep === i.eventId && i.eventId;
  return `<li class="tl hover ${i.past ? 'past' : ''}"><span class="mono small muted" style="padding-top:2px">${i.time ? esc(fmtT(i.time)) : i.allDay ? 'All day' : 'Today'}</span><span class="tl-dot" style="background:${dot}"></span><div style="min-width:0">
    <div class="row" style="gap:6px 10px"><span style="font-weight:500">${esc(i.title)}</span><span class="tag t-FACT">${esc(i.kind.toUpperCase())}</span>${(i.flags || []).map((f) => pill(f.label, f.level)).join('')}<span class="grow"></span>
    ${i.prep ? `<button class="btn btn-sm" style="border-color:var(--pri-b);color:var(--pri)" data-act="prep" data-event="${esc(i.eventId)}">${open ? 'Close brief' : 'Prep me'}</button>` : ''}
    ${i.taskId && !i.past ? `<button class="btn btn-sm btn-g" data-act="task-done" data-task="${esc(i.taskId)}">Mark done</button>` : ''}</div>
    <div class="small faint" style="margin-top:2px">${esc(i.meta)}</div>
    ${open ? prepBox(i.eventId) : ''}</div></li>`;
}
function prepBox(id) {
  const p = ui.preps[id];
  if (!p) return `<div class="prep row"><span class="spin"></span> Preparing your meeting brief…</div>`;
  if (p.error) return `<div class="prep c-crit">${esc(p.error)}</div>`;
  const sec = (label, s, cls = '') => `<div><div class="eyebrow ${cls}" style="margin-bottom:4px">${label}</div>${tag(s.tag)} ${esc(s.text)}${s.sources?.length ? ` <button class="btn btn-g btn-sm" style="min-height:22px;padding:0 4px" data-act="sources" data-ids="${esc(s.sources.join(','))}">sources</button>` : ''}</div>`;
  return `<div class="prep"><div class="row" style="justify-content:space-between;margin-bottom:12px"><span class="eyebrow c-info">Meeting brief · ${esc(p.title)} · ${esc(p.when)}</span><span class="small faint">${p.basis === 'ai' ? 'AI · ' : ''}built ${esc(fmtT(p.generatedAt))} <button class="btn btn-g btn-sm" data-act="prep-refresh" data-event="${esc(id)}">Rebuild</button></span></div>
    <div class="prep-grid">${sec('Purpose', p.sections.purpose)}<div><div class="eyebrow" style="margin-bottom:4px">Participants</div>${esc(p.people.join(', ') || 'Just you')}</div>${sec('Unresolved from before', p.sections.unresolved)}${sec('You owe', p.sections.youOwe, 'c-warn')}${sec('They owe', p.sections.theyOwe)}
    <div><div class="eyebrow" style="margin-bottom:4px">Documents</div>${p.documents.length ? p.documents.map((d) => `<div>${realLink(d.link) ? `<a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.name)}</a>` : esc(d.name)} <span class="faint small">· ${esc(d.when)} ago</span></div>`).join('') : '<span class="faint">None found</span>'}</div></div>
    ${p.messages.length ? `<div style="margin-top:12px"><div class="eyebrow" style="margin-bottom:4px">Related email</div>${p.messages.map((m) => `<div class="s13">${realLink(m.link) ? `<a href="${esc(m.link)}" target="_blank" rel="noopener">${esc(m.subject)}</a>` : esc(m.subject)} <span class="faint">— ${esc(m.from)} · ${esc(m.when)}</span></div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bd)">${tag('RECOMMENDATION')}<span class="s13 grow" style="flex-basis:260px">${esc(p.sections.prep.text)}</span></div>
    ${p.aiError ? `<p class="small c-warn">AI unavailable: ${esc(p.aiError)}</p>` : ''}</div>`;
}

function attentionSection() {
  const ib = S.inbox; const c = S.commitments;
  const tabs = [['inbox', 'Inbox', ib.needs_reply.length + ib.important.length], ['commit', 'Commitments', c.iOwe.length + c.theyOwe.length], ['tasks', 'Tasks', S.tasks.length], ['risks', 'Risks', S.risks.length]];
  return `<section aria-labelledby="att-h"><div class="sec-head"><h2 id="att-h" class="h2">Needs your attention</h2><span class="small faint">Nothing is sent, moved or deleted in your accounts — this app has read-only access.</span></div>
  <div class="card" style="overflow:hidden"><div class="tabs" role="tablist">${tabs.map(([id, l, n]) => `<button class="tab" role="tab" aria-selected="${ui.tab === id}" data-act="tab" data-tab="${id}">${l}<span class="count">${n}</span></button>`).join('')}</div>
  ${ui.tab === 'inbox' ? inboxTab() : ui.tab === 'commit' ? commitTab() : ui.tab === 'tasks' ? tasksTab() : risksTab()}</div></section>`;
}
const BOX = [['needs_reply', 'Needs reply'], ['waiting_on', 'Waiting on'], ['important', 'Important'], ['fyi', 'FYI'], ['noise', 'Noise']];
function inboxTab() {
  const list = S.inbox[ui.box] || [];
  return `<div class="row" style="padding:12px 16px;border-bottom:1px solid var(--bd)">${BOX.map(([id, l]) => `<button class="chipbtn" aria-pressed="${ui.box === id}" data-act="box" data-box="${id}">${l} · <span class="mono">${S.inbox[id].length}</span></button>`).join('')}</div>
  ${!list.length ? `<div class="empty">${ui.box === 'needs_reply' ? 'No emails waiting on you.' : 'Nothing here.'}</div>` : `<ul class="ul divide">${list.slice(0, 25).map(mailRow).join('')}</ul>`}
  <div class="small faint" style="padding:10px 16px;border-top:1px solid var(--bd)">${ui.box === 'noise' ? 'Noise is only hidden here — nothing is deleted.' : 'Hide and snooze only affect this dashboard, not Gmail.'}</div>`;
}
function mailRow(m) {
  const lv = m.importance === 'high' ? 'warn' : m.importance === 'low' ? 'mute' : 'info';
  const who = m.isSent ? `You → ${m.to[0]?.name || ''}` : m.from.name;
  return `<li class="mail hover"><span class="avatar">${initials(m.isSent ? m.to[0]?.name : m.from.name)}</span><div style="min-width:0">
    <div class="row" style="align-items:baseline;gap:4px 10px"><span style="font-weight:600">${esc(who)}</span><span class="muted">— ${esc(m.subject)}</span><span class="grow"></span><span class="mono small faint">${esc(m.age)}</span></div>
    <div class="s13 muted" style="margin-top:4px">${esc(m.summary)}</div>
    <div class="row" style="margin-top:8px;gap:6px">${pill(m.importance || 'normal', lv)}${m.project ? pill(m.project, 'mute') : ''}${m.action ? `<span class="small muted">Action: <span style="color:var(--tx)">${esc(m.action)}</span></span>` : ''}${m.deadline ? `<span class="small c-warn">· ${esc(m.deadline)}</span>` : ''}${m.rule ? `<span class="small faint">· rule: ${esc(m.rule)}</span>` : ''}${m.basis === 'ai' ? '<span class="small faint">· AI</span>' : ''}</div>
    <div class="row" style="margin-top:10px;gap:6px">
      ${m.category !== 'noise' && m.category !== 'fyi' ? `<button class="btn btn-p btn-sm" data-act="draft" data-msg="${esc(m.id)}">${m.isSent ? 'Draft nudge' : 'Draft reply'}</button>` : ''}
      <button class="btn btn-sm" data-act="thread" data-msg="${esc(m.id)}">Read thread</button>
      <button class="btn btn-sm" data-act="msg-task" data-msg="${esc(m.id)}" data-title="${esc((m.isSent ? 'Follow up: ' : 'Reply: ') + m.subject)}">Turn into task</button>
      ${openLink(m.link, 'Open in Gmail')}
      <button class="btn btn-g btn-sm" data-act="snooze" data-msg="${esc(m.id)}">Snooze 1 day</button>
      <button class="btn btn-g btn-sm" data-act="hide" data-msg="${esc(m.id)}">Hide</button>
      ${m.category !== 'noise' ? `<button class="btn btn-g btn-sm" data-act="recat" data-msg="${esc(m.id)}" data-cat="noise">Not important</button>` : `<button class="btn btn-g btn-sm" data-act="recat" data-msg="${esc(m.id)}" data-cat="important">Actually important</button>`}
    </div></div></li>`;
}
function commitCard(c) {
  return `<li class="box"><div class="row"><span style="font-weight:600">${esc(c.what)}</span><span class="grow"></span>${pill(c.state.label, c.state.level)}</div>
    <div class="s13 muted" style="margin-top:4px">${c.direction === 'i_owe' ? 'To' : 'From'} ${esc(c.person?.name || '—')}${c.project ? ' · ' + esc(c.project) : ''}${c.promised ? ' · promised ' + esc(c.promised) : ''}</div>
    <div class="s13" style="margin-top:6px;font-style:italic" title="Exact words from the source">“${esc(c.quote)}”</div>
    <div class="row small faint" style="margin-top:6px">${tag(c.confidence === 'clear' ? 'FACT' : 'INFERENCE')}<span>${c.confidence === 'clear' ? 'Clear commitment' : 'Possible commitment detected'} · ${esc(c.source?.type || 'Added by you')} · ${esc(c.detected)}${c.basis === 'ai' ? ' · AI' : ''}</span></div>
    <div class="row" style="margin-top:8px;gap:6px">
      <button class="btn btn-sm" data-act="commit" data-id="${esc(c.id)}" data-status="done">${c.direction === 'i_owe' ? 'Delivered' : 'Received'}</button>
      ${c.direction === 'they_owe' && c.source ? `<button class="btn btn-sm" data-act="nudge" data-id="${esc(c.id)}">Draft nudge</button>` : ''}
      ${c.direction === 'i_owe' ? `<button class="btn btn-sm" data-act="commit-task" data-id="${esc(c.id)}" data-title="${esc(c.what + ' → ' + (c.person?.name || ''))}">Turn into task</button>` : ''}
      ${openLink(c.link, 'Source')}
      <button class="btn btn-g btn-sm" data-act="commit" data-id="${esc(c.id)}" data-status="dismissed">Not a commitment</button>
    </div></li>`;
}
function commitTab() {
  const c = S.commitments;
  const col = (title, cls, list, empty) => `<div style="padding:16px"><div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="eyebrow ${cls}">${title}</span><span class="mono small faint">${list.length} open</span></div>${list.length ? `<ul class="ul" style="display:flex;flex-direction:column;gap:10px">${list.map(commitCard).join('')}</ul>` : `<div class="empty">${empty}</div>`}</div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${col('I owe', 'c-warn', c.iOwe, 'No promises detected in your sent email.')}${col('They owe', 'c-info', c.theyOwe, 'Nobody owes you anything right now.')}</div>
  <div class="row small faint" style="padding:10px 16px;border-top:1px solid var(--bd)">Detected from email${S.app.ai ? ' by AI, checked against the exact wording' : ' with built-in rules'}. <button class="btn btn-g btn-sm" data-act="add-commit">Add one manually</button></div>`;
}
function tasksTab() {
  const t = S.tasks;
  if (!t.length) return `<div class="empty">No open tasks. Use Capture to add one, or connect Google Tasks.</div>`;
  return `<div class="tbl-wrap"><table class="tbl" style="min-width:680px"><thead><tr><th class="eyebrow">Task</th><th class="eyebrow">Project</th><th class="eyebrow">Source</th><th class="eyebrow">Due</th><th class="eyebrow"></th></tr></thead><tbody>
  ${t.map((k) => `<tr class="hover"><td>${k.editable ? `<label class="row" style="flex-wrap:nowrap;cursor:pointer"><input type="checkbox" data-act="task-done" data-task="${esc(k.id)}" style="width:16px;height:16px;accent-color:var(--pri)"><span>${esc(k.title)}</span></label>` : esc(k.title)}${k.status === 'blocked' ? `<div class="small c-crit">Blocked${k.blockedBy ? ': ' + esc(k.blockedBy) : ''}</div>` : ''}${k.postponed >= 2 ? `<div class="small c-warn">Postponed ${k.postponed}×</div>` : ''}</td>
    <td class="muted">${esc(k.project || '—')}</td><td><span class="tag t-FACT">${esc(({ native: 'YOURS', gtasks: 'GOOGLE TASKS', demo: 'DEMO' })[k.source] || k.source)}</span>${k.alsoIn.length ? ` <span class="small faint">+ ${esc(k.alsoIn.join(', '))}</span>` : ''}</td>
    <td class="mono small ${k.overdue ? 'c-crit' : ''}">${esc(k.due || '—')}</td>
    <td style="text-align:right;white-space:nowrap">${k.editable ? `<button class="btn btn-g btn-sm" data-act="task-tomorrow" data-task="${esc(k.id)}">Move to tomorrow</button>` : openLink(k.link)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function risksTab() {
  if (!S.risks.length) return `<div class="empty">No risks detected.</div>`;
  return `<ul class="ul divide">${S.risks.map((r) => `<li style="padding:16px"><div class="row">${pill(r.label, r.level)}<span style="font-weight:600">${esc(r.title)}</span>${tag(r.tag)}</div><div class="s13 muted" style="margin-top:6px">${esc(r.text)}</div>${r.evidence ? `<div class="mono small faint" style="margin-top:6px">Evidence: ${esc(r.evidence)}</div>` : ''}</li>`).join('')}</ul>`;
}

function pulseSection() {
  const ps = S.pulse;
  return `<section aria-labelledby="pp-h"><div class="sec-head"><h2 id="pp-h" class="h2">Project pulse</h2><span class="small faint">A status only changes with evidence — hover it to see why. <a href="#/settings" data-scroll="projects">Manage projects</a></span></div>
  ${!ps.length ? `<div class="card empty">No projects yet. Projects connect related email, meetings, tasks and files. <a href="#/settings">Add your first project</a> with a few keywords.</div>` :
  `<div class="card tbl-wrap"><table class="tbl" style="min-width:860px"><thead><tr><th class="eyebrow">Project</th><th class="eyebrow">Pulse</th><th class="eyebrow">Next milestone</th><th class="eyebrow" style="width:120px">Progress</th><th class="eyebrow">Blocker / latest</th><th class="eyebrow">Next action</th></tr></thead><tbody>
  ${ps.map((p) => `<tr class="hover"><td><div style="font-weight:600">${esc(p.name)}${p.important ? ' <span class="c-warn" title="Important project">★</span>' : ''}</div><div class="small faint">Owner · ${esc(p.owner)}</div></td>
    <td><span class="pill l-${p.level}" title="${esc(p.evidence)}"><span class="dot"></span>${esc(p.statusLabel)}</span><div class="small faint" style="margin-top:4px;max-width:220px">${esc(p.evidence)}</div></td>
    <td>${p.milestone ? `<div>${esc(p.milestone.label)}</div><div class="mono small faint">${esc(p.milestone.when)}</div>` : '<span class="faint">—</span>'}</td>
    <td>${p.progress ? `<div class="bar"><div style="width:${p.progress.pct}%;background:var(--${p.level === 'mute' ? 'fa' : p.level === 'info' ? 'pri' : p.level})"></div></div><div class="mono small faint" style="margin-top:4px">${p.progress.done} of ${p.progress.total} tasks</div>` : '<span class="faint small">no tasks</span>'}</td>
    <td class="muted">${esc(p.blocker || p.activity?.text || '—')}${!p.blocker && p.activity ? ` <span class="faint small">· ${esc(p.activity.when)}</span>` : ''}</td><td>${esc(p.next)}</td></tr>`).join('')}
  </tbody></table></div>`}</section>`;
}
function changesSection() {
  const sym = { crit: 'var(--crit)', warn: 'var(--warn)', info: 'var(--pri)', ok: 'var(--ok)', mute: 'var(--mu)' };
  return `<section class="card pad" aria-labelledby="sy-h"><div class="sec-head"><h2 id="sy-h" class="h2">Since yesterday</h2><span class="mono small faint">vs. last daily snapshot</span></div>
  ${S.changes.length ? `<ul class="ul" style="display:flex;flex-direction:column;gap:10px">${S.changes.map((c) => `<li style="display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px" class="s13"><span class="mono" style="color:${sym[c.level]};font-weight:600">${esc(c.sym)}</span><span>${esc(c.text)} <span class="faint">${esc(c.ctx)}</span></span></li>`).join('')}</ul>` : '<div class="empty">No meaningful changes.</div>'}</section>`;
}
function upcomingSection() {
  return `<section class="card pad" aria-labelledby="up-h"><div class="sec-head"><h2 id="up-h" class="h2">Upcoming</h2><span class="mono small faint">next 10 days</span></div>
  ${S.upcoming.length ? `<ul class="ul">${S.upcoming.map((u) => `<li style="display:grid;grid-template-columns:72px minmax(0,1fr);gap:12px;padding:9px 0;border-top:1px solid var(--bd)" class="s13"><span class="mono small muted">${esc(u.date)}</span><span><span style="font-weight:500">${esc(u.title)}</span> <span class="${u.deadline ? 'c-warn' : 'faint'}">· ${esc(u.ctx)}</span></span></li>`).join('')}</ul>` : '<div class="empty">Nothing notable scheduled.</div>'}</section>`;
}

// ---------- Chief of Staff ----------
const ASKS = ['What should I focus on today?', 'What am I forgetting?', 'Who am I waiting on?', 'What commitments did I make this week?', 'What deadlines are coming?', 'Which emails actually need replies?', 'Prepare me for my next meeting.', 'Give me my week in 60 seconds.'];
function chiefSection() {
  return `<section class="card" aria-labelledby="cos-h" style="padding:18px;display:flex;flex-direction:column;gap:14px">
    <div class="row" style="flex-wrap:nowrap"><span style="width:32px;height:32px;border-radius:8px;background:var(--pri-t);display:inline-flex;align-items:center;justify-content:center">${I.spark}</span><div class="grow"><h2 id="cos-h" class="h2" style="font-size:16px">Chief of Staff</h2><div class="small faint">${S.app.ai ? 'Reasons across email, calendar, tasks and files' : 'Rules mode — add an AI key for free-form questions'}</div></div>${S.chat.length ? '<button class="btn btn-g btn-sm" data-act="chat-clear">Clear</button>' : ''}</div>
    <div class="row" style="gap:6px">${ASKS.slice(0, S.chat.length ? 4 : 8).map((q) => `<button class="chipbtn" data-act="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    ${S.chat.length || ui.chatBusy ? `<div class="chatlog">${S.chat.map(chatEntry).join('')}${ui.chatBusy ? `<div class="bubble-q">${esc(ui.chatBusy)}</div><div class="row faint small"><span class="spin"></span> Thinking across your sources…</div>` : ''}</div>` : ''}
    <label class="composer"><span class="sr">Ask your Chief of Staff</span><textarea id="chat-in" rows="2" placeholder="Ask, plan, or find… e.g. “Show everything related to Apex”" data-enter="chat">${esc(ui.chatDraft)}</textarea><button class="btn btn-p" data-act="chat-send" aria-label="Send" style="width:36px;padding:0">${I.send}</button></label>
    <div class="small faint">Drafts and suggestions only. Anything that changes your data asks you first.</div></section>`;
}
function chatEntry(c) {
  return `<div class="bubble-q">${esc(c.q)}</div><div style="display:flex;flex-direction:column;gap:8px">${c.answer.map((a) => `<div class="box s13"><div class="row" style="margin-bottom:4px">${tag(a.tag)}${a.sources.length ? `<button class="btn btn-g btn-sm" style="min-height:22px;padding:0 4px" data-act="sources" data-ids="${esc(a.sources.join(','))}">${a.sources.map((id) => esc(c.sourcesInfo?.[id]?.type || 'source')).filter((v, i, arr) => arr.indexOf(v) === i).join(' · ')}</button>` : ''}</div>${esc(a.text)}</div>`).join('')}
  ${c.note ? `<div class="small faint">${esc(c.note)}</div>` : ''}
  ${c.actions?.length ? `<div class="row" style="gap:6px">${c.actions.map((a, i) => `<button class="btn btn-sm" data-act="chat-action" data-chat="${esc(c.id)}" data-i="${i}">${esc(a.label)}…</button>`).join('')}</div>` : ''}</div>`;
}
function waitingSection() {
  const theirs = S.commitments.theyOwe; const threads = S.inbox.waiting_on;
  const n = theirs.length + threads.length;
  return `<section class="card" style="padding:18px" aria-labelledby="wo-h"><div class="sec-head" style="margin-bottom:6px"><h2 id="wo-h" class="h2" style="font-size:16px">Waiting on</h2><span class="mono small faint">${n}</span></div>
  ${!n ? '<div class="empty">Nobody owes you anything right now.</div>' : `<ul class="ul">${theirs.map((c) => `<li class="row" style="padding:10px 0;border-top:1px solid var(--bd);flex-wrap:nowrap;align-items:flex-start"><span class="dot c-${c.state.level}" style="margin-top:6px"></span><div class="grow"><div class="s13"><b>${esc(c.person?.name)}</b> <span class="muted">· ${esc(c.what)}</span></div><div class="mono small c-${c.state.level}">${esc(c.state.label)}</div></div>${c.source ? `<button class="btn btn-g btn-sm" data-act="nudge" data-id="${esc(c.id)}">Nudge</button>` : ''}</li>`).join('')}
  ${threads.map((m) => `<li class="row" style="padding:10px 0;border-top:1px solid var(--bd);flex-wrap:nowrap;align-items:flex-start"><span class="dot c-info" style="margin-top:6px"></span><div class="grow"><div class="s13"><b>${esc(m.to[0]?.name || '')}</b> <span class="muted">· reply to “${esc(m.subject)}”</span></div><div class="mono small faint">no reply · ${esc(m.age)}</div></div><button class="btn btn-g btn-sm" data-act="draft" data-msg="${esc(m.id)}">Nudge</button></li>`).join('')}</ul>`}</section>`;
}
function sourcesSection() {
  return `<section class="card" style="padding:18px" aria-labelledby="ih-h"><div class="sec-head" style="margin-bottom:6px"><h2 id="ih-h" class="h2" style="font-size:16px">Sources</h2><a class="small" href="#/settings">Manage</a></div>
  ${S.sources.length ? `<ul class="ul">${S.sources.map((s) => `<li class="row s13" style="padding:8px 0;border-top:1px solid var(--bd);flex-wrap:nowrap"><span class="dot c-${s.status === 'ok' ? 'ok' : s.status === 'reconnect' ? 'warn' : 'crit'}"></span><span class="grow">${esc(s.label)}</span><span class="mono small ${s.status === 'ok' ? 'faint' : 'c-crit'}">${s.status === 'ok' ? esc(fmtT(s.lastSuccess)) : s.status === 'reconnect' ? 'Reconnect' : 'Failed · last ok ' + esc(s.lastSuccess ? fmtWhen(s.lastSuccess) : 'never')}</span></li>`).join('')}</ul>` : '<div class="empty">No sources connected.</div>'}
  <div class="mono small faint" style="margin-top:10px">${S.run.nextMorning ? 'Next brief · ' + esc(fmtWhen(S.run.nextMorning)) : 'Morning brief is off'} · live updates every ${esc(S.app.settings.liveMinutes)} min</div></section>`;
}

// ---------- search & capture ----------
function searchResults() {
  const r = ui.searchRes;
  return `<div class="search-results" role="listbox"><button class="row hover" style="width:100%;padding:12px 14px;border:0;background:transparent;cursor:pointer;text-align:left;color:var(--tx)" data-act="ask" data-q="${esc(ui.searchQ)}">${I.spark}<span>Ask Chief of Staff: <b>${esc(ui.searchQ)}</b></span></button>
  ${r.loading ? '<div class="empty">Searching…</div>' : !r.items.length ? '<div class="empty">No matches in your synced data.</div>' : `<ul class="ul divide">${r.items.map((x) => `<li class="row hover" style="padding:10px 14px;flex-wrap:nowrap"><span class="tag t-FACT" style="min-width:80px;justify-content:center">${esc(x.type.toUpperCase())}</span><span class="grow"><span style="font-weight:500">${esc(x.title)}</span><span class="small faint"> · ${esc(x.sub)}</span></span><span class="mono small faint">${esc(x.when)}</span>${realLink(x.link) ? `<a class="btn btn-sm btn-g" href="${esc(x.link)}" target="_blank" rel="noopener">Open ${I.ext}</a>` : ''}</li>`).join('')}</ul>`}
  <div class="row" style="justify-content:flex-end;padding:6px 10px;border-top:1px solid var(--bd)"><button class="btn btn-g btn-sm" data-act="search-close">Close</button></div></div>`;
}
function captureBox() {
  const c = ui.capture; const p = c.parsed;
  return `<div class="wrap" style="padding-bottom:16px"><div class="card" style="padding:16px;border-color:var(--pri-b);background:var(--s2);display:flex;flex-wrap:wrap;gap:16px">
    <div style="flex:1 1 360px;min-width:0;display:flex;flex-direction:column;gap:8px"><label class="eyebrow" for="cap-in">Quick capture — task, reminder, note, follow-up</label>
      <div class="row" style="flex-wrap:nowrap"><input id="cap-in" class="input grow" type="text" value="${esc(c.text)}" placeholder="e.g. Remind me to ask Carlos about the contract Friday morning" data-enter="capture-parse"><button class="btn" data-act="capture-parse">${c.busy ? '<span class="spin"></span>' : 'Understand'}</button></div>
      <div class="small faint">Nothing is created until you confirm.</div></div>
    ${p ? `<div style="flex:1 1 360px;min-width:0"><div class="eyebrow" style="margin-bottom:8px">Parsed as ${p.basis === 'ai' ? '(AI)' : '(rules)'} — edit anything</div>
      <div style="display:grid;grid-template-columns:80px minmax(0,1fr);gap:8px 12px;align-items:center" class="s13">
        <label class="faint" for="cap-type">Type</label><select id="cap-type" class="input">${['task', 'reminder', 'follow_up', 'note', 'event'].map((t) => `<option value="${t}" ${p.type === t ? 'selected' : ''}>${t.replace('_', '-')}</option>`).join('')}</select>
        <label class="faint" for="cap-title">Title</label><input id="cap-title" class="input" value="${esc(p.title)}">
        <span class="faint">When</span><span class="row" style="flex-wrap:nowrap"><input id="cap-date" class="input" type="date" value="${esc(p.date || '')}" aria-label="Date"><input id="cap-time" class="input" type="time" value="${esc(p.time || '')}" aria-label="Time"></span>
        <span class="faint">Person</span><span>${esc(p.person || '—')}${p.person ? ` ${tag('INFERENCE')}` : ''}</span>
        ${p.assumptions?.length ? `<span class="faint">Assumed</span><span class="small c-warn">${p.assumptions.map(esc).join(' · ')}</span>` : ''}
      </div>${p.type === 'event' ? '<p class="small c-warn" style="margin:8px 0 0">Calendar access is read-only, so this is saved as a task to schedule.</p>' : ''}
      <div class="row" style="margin-top:12px"><button class="btn btn-p" data-act="capture-create">Create ${esc(p.type.replace('_', '-'))}</button><button class="btn btn-g" data-act="capture-close">Cancel</button></div></div>` : `<div class="row" style="align-self:flex-start"><button class="btn btn-g" data-act="capture-close">Close</button></div>`}
  </div></div>`;
}

// ---------- FOCUS ----------
function focusPage() {
  const f = S.focus;
  if (!f) {
    const cand = S.priorities.filter((p) => p.kind === 'task');
    const others = S.tasks.filter((t) => !cand.some((c) => c.refId === t.id)).slice(0, 8);
    return `<main class="wrap" style="max-width:860px;padding-top:40px;padding-bottom:56px"><span class="eyebrow c-info">Focus mode</span><h1 class="h1" style="margin:10px 0 8px">What do you want to focus on?</h1><p class="muted" style="margin:0 0 24px">Focus shows only the current priority, the time you have, and the documents and messages that matter. Everything else waits.</p>
    <div class="card" style="overflow:hidden">${[...cand.map((p) => ({ id: p.refId, title: p.title, sub: p.dueLabel, level: p.level })), ...others.map((t) => ({ id: t.id, title: t.title, sub: t.due ? 'Due ' + t.due : 'No date', level: '' }))].map((t) => `<button class="row hover" style="width:100%;padding:14px 18px;border:0;border-top:1px solid var(--bd);background:transparent;cursor:pointer;text-align:left;color:var(--tx);min-height:52px" data-act="focus-start" data-task="${esc(t.id)}"><span class="grow" style="font-weight:500">${esc(t.title)}</span>${t.level ? pill(t.level, LV[t.level]) : ''}<span class="mono small faint">${esc(t.sub)}</span></button>`).join('') || '<div class="empty">No open tasks yet.</div>'}</div>
    <div class="row" style="margin-top:16px;flex-wrap:nowrap"><input id="focus-title" class="input grow" placeholder="…or type something else to focus on" data-enter="focus-new"><button class="btn btn-p" data-act="focus-new">Start focus</button></div></main>`;
  }
  const steps = f.steps || []; const done = steps.filter((s) => s.done).length;
  const mins = f.minutesAvailable;
  return `<div class="strip"><div class="wrap strip-in" style="max-width:1040px">${pill('Focus on', 'ok')}<span class="muted">Since ${esc(fmtT(f.startedAt))} · ${f.held.length} update${f.held.length === 1 ? '' : 's'} held · high-importance items still break through</span><span class="grow"></span>${S.app.demo ? pill('Demo data', 'warn') : ''}<button class="btn" data-act="focus-stop">Exit focus</button></div></div>
  <main class="wrap" style="max-width:1040px;padding-top:36px;padding-bottom:56px;display:flex;flex-direction:column;gap:24px">
    ${f.breakthrough.length ? `<div class="issue crit" style="margin:0"><b class="c-crit">Breaking through:</b>${f.breakthrough.map((b) => `<span class="s13">${esc(b.text)} · ${esc(b.when)}</span>`).join('')}</div>` : ''}
    <section><div class="eyebrow c-info">Current priority</div><h1 style="margin:10px 0 8px;font-size:38px;line-height:44px;font-weight:600;letter-spacing:-.03em">${esc(f.task?.title || 'Focus')}</h1><div class="row muted s13">${f.task?.due ? `<span class="mono">Due ${esc(f.task.due)}</span>` : ''}${f.task?.project ? `<span>· ${esc(f.task.project)}</span>` : ''}${openLink(f.task?.link)}</div></section>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
      <div class="card pad" style="background-image:var(--glow);border-color:var(--pri-b)"><div class="eyebrow">Time available</div><div class="mono" style="font-size:34px;line-height:42px;margin-top:6px">${mins == null ? '—' : mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + ' min'}</div><div class="s13 muted">${f.untilLabel ? 'until ' + esc(f.untilLabel) : 'No deadline or meeting ahead'}</div></div>
      <div class="card pad"><div class="eyebrow">Next meeting</div>${f.nextMeeting ? `<div style="font-size:17px;font-weight:600;margin-top:8px">${esc(f.nextMeeting.title)}</div><div class="mono s13 muted">${esc(f.nextMeeting.when)} · ${f.nextMeeting.people} other${f.nextMeeting.people === 1 ? '' : 's'}</div>` : '<div class="muted" style="margin-top:8px">None scheduled</div>'}</div>
      <div class="card pad"><div class="eyebrow">Progress</div><div class="mono" style="font-size:34px;line-height:42px;margin-top:6px">${done}<span style="font-size:16px" class="faint"> / ${steps.length} steps</span></div><div class="bar" style="margin-top:8px"><div style="width:${steps.length ? (done / steps.length) * 100 : 0}%;background:var(--pri)"></div></div></div>
    </div>
    <section class="card" style="padding:22px"><div class="sec-head"><h2 class="h2">Steps</h2><span class="small faint">Break it down — saved with the task</span></div>
      <ol class="ul">${steps.map((s, i) => `<li><label class="row hover" style="padding:10px 12px;border-radius:6px;cursor:pointer;min-height:44px;flex-wrap:nowrap"><input type="checkbox" ${s.done ? 'checked' : ''} data-act="step-toggle" data-i="${i}" style="width:18px;height:18px;accent-color:var(--pri)"><span class="grow" style="font-size:15px;${s.done ? 'text-decoration:line-through;color:var(--fa)' : ''}">${esc(s.text)}</span><button class="btn btn-g btn-sm" data-act="step-del" data-i="${i}" aria-label="Remove step">×</button></label></li>`).join('')}</ol>
      <div class="row" style="margin-top:10px;flex-wrap:nowrap"><input id="step-in" class="input grow" placeholder="Add a step…" data-enter="step-add"><button class="btn" data-act="step-add">Add</button></div>
      ${steps.length && done < steps.length ? `<div class="row" style="margin-top:16px;padding:14px 16px;border-radius:6px;background:var(--pri-t)">${tag('RECOMMENDATION')}<span class="grow">Next: ${esc(steps.find((s) => !s.done).text)}</span></div>` : ''}
    </section>
    <div class="grid2"><section class="card pad"><h2 class="eyebrow" style="margin:0 0 10px">Relevant documents</h2>${f.documents.length ? `<ul class="ul">${f.documents.map((d) => `<li class="row" style="padding:10px 0;border-top:1px solid var(--bd);flex-wrap:nowrap"><span class="grow">${esc(d.name)}<br><span class="small faint">${esc(d.meta)}</span></span>${openLink(d.link)}</li>`).join('')}</ul>` : '<div class="empty">None linked to this project.</div>'}</section>
      <section class="card pad"><h2 class="eyebrow" style="margin:0 0 10px">Related messages</h2>${f.messages.length ? `<ul class="ul">${f.messages.map((m) => `<li style="padding:10px 0;border-top:1px solid var(--bd)"><b>${esc(m.from)}</b> <span class="mono small faint">· ${esc(m.when)}</span><div class="s13 muted">${esc(m.text)}</div></li>`).join('')}</ul>` : '<div class="empty">None linked to this project.</div>'}</section></div>
    <div class="row">${f.task ? `<button class="btn btn-p" data-act="focus-done">Done — mark complete</button>` : ''}<button class="btn" data-act="focus-stop">Exit focus</button><a class="btn btn-g" href="#/today">Back to Today</a></div>
    <section class="card pad"><div class="row"><span class="dot c-mute"></span><b class="grow">Held until you exit — ${f.held.length} update${f.held.length === 1 ? '' : 's'}</b></div>${f.held.length ? `<ul class="ul" style="margin-top:8px">${f.held.slice(0, 8).map((h) => `<li class="row s13" style="padding:8px 0;border-top:1px solid var(--bd)"><span class="grow">${esc(h.text)}</span><span class="mono small faint">${esc(h.when)}</span></li>`).join('')}</ul>` : ''}</section>
  </main>`;
}

// ---------- WEEKLY ----------
async function loadWeekly() { ui.weeklyBusy = true; try { ui.weekly = await api('/api/weekly'); } catch (e) { toast(e.message, true); } ui.weeklyBusy = false; if (route() === 'weekly') render(); }
function weeklyPage() {
  const w = ui.weekly;
  if (!w) { if (!ui.weeklyBusy) loadWeekly(); return '<div class="empty" style="padding:60px">Loading your week…</div>'; }
  const stat = (l, v, cls = '') => `<div style="padding:14px;border-radius:6px;background:var(--s2)"><div class="eyebrow">${l}</div><div class="mono ${cls}" style="font-size:26px;margin-top:4px">${v}</div></div>`;
  const li = (html) => `<li style="padding:10px 0;border-top:1px solid var(--bd)" class="s13">${html}</li>`;
  return `<main class="wrap" style="max-width:1240px;padding-top:28px;padding-bottom:56px;display:flex;flex-direction:column;gap:24px">
    <section class="card brief"><div class="row" style="justify-content:space-between"><span class="eyebrow c-info">Weekly review · ${esc(w.range)} · ${w.snapshots} daily snapshot${w.snapshots === 1 ? '' : 's'}</span>${S.app.ai ? `<button class="btn btn-sm" data-act="week-summary">${ui.busy.week ? '<span class="spin"></span>' : 'Week in 60 seconds'}</button>` : ''}</div>
      ${w.summary ? `<p style="margin:12px 0 0;font-size:18px;line-height:28px;max-width:920px">${esc(w.summary.text)}</p>` : `<p class="muted" style="margin:12px 0 0">${w.snapshots < 2 ? 'Your weekly review fills in as daily snapshots accumulate — each morning run saves one.' : 'Here’s how the week went.'}</p>`}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:20px">${stat('Completed', w.stats.done)}${stat('Still open priorities', w.stats.unfinished)}${stat('Overdue — you owe', w.stats.overdueMine, w.stats.overdueMine ? 'c-crit' : '')}${stat('Overdue — owed to you', w.stats.overdueTheirs, w.stats.overdueTheirs ? 'c-warn' : '')}${stat('Meetings', w.stats.meetings + ' · ' + w.stats.meetingHours + 'h')}</div></section>
    <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">Completed</h2>${w.done.length ? `<ul class="ul">${w.done.slice(0, 12).map((d) => li(`<span class="c-ok">✓</span> ${esc(d.title)} <span class="faint">· ${esc(d.when)}</span>`)).join('')}</ul>` : '<div class="empty">Nothing marked done this week.</div>'}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">Unfinished — and what keeps moving</h2>${w.unfinished.length ? `<ul class="ul">${w.unfinished.slice(0, 10).map((u) => li(`<span class="row"><span class="grow">${esc(u.title)}</span>${u.postponed >= 2 ? pill('Postponed ' + u.postponed + '×', 'warn') : u.days > 1 ? pill('On list ' + u.days + ' days', 'mute') : ''}</span>`)).join('')}</ul>` : '<div class="empty">Nothing carried over.</div>'}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">Overdue commitments</h2>${w.overdue.length ? `<ul class="ul">${w.overdue.map((o) => li(`<span class="tag ${o.direction === 'i_owe' ? 't-INFERENCE' : 't-RECOMMENDATION'}">${o.direction === 'i_owe' ? 'I OWE' : 'THEY OWE'}</span> ${esc(o.what)} ${o.direction === 'i_owe' ? '→' : '←'} ${esc(o.person)} <span class="mono small c-crit">· promised ${esc(o.promised)}</span>`)).join('')}</ul>` : '<div class="empty">None overdue.</div>'}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">Project progress</h2>${w.projects.length ? w.projects.map((p) => `<div style="margin-bottom:14px" class="s13"><div class="row"><span class="grow">${esc(p.name)}</span>${pill(p.status, p.level)}</div><div class="bar" style="margin-top:6px"><div style="width:${p.to ?? 0}%;background:var(--pri)"></div></div><div class="small faint" style="margin-top:4px">${p.from != null && p.to != null ? `${p.from}% → ${p.to}% of tasks done · ` : ''}${p.wasStatus && p.wasStatus !== p.status ? `was ${esc(p.wasStatus)} · ` : ''}${esc(p.note)}</div></div>`).join('') : '<div class="empty">No projects defined.</div>'}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">Major decisions</h2>${w.decisions.length ? `<ul class="ul">${w.decisions.map((d) => li(`${esc(d.decision)} <span class="faint">· ${esc(d.subject)} · ${esc(d.when)}</span>`)).join('')}</ul>` : `<div class="empty">${S.app.ai ? 'No explicit decisions found in email this week.' : 'Decision tracking needs the AI key.'}</div>`}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">Relationships to follow up</h2>${w.people.length ? `<ul class="ul">${w.people.map((p) => li(`<b>${esc(p.name)}</b> <span class="faint">· ${esc(p.why)}</span>`)).join('')}</ul>` : '<div class="empty">No one is waiting on you.</div>'}</section>
    </div>
    <section class="card pad"><h2 class="h3" style="margin-bottom:12px">Next week</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">${w.next.map((d) => `<div class="box" style="${d.deadlines > 1 ? 'border-color:var(--warn)' : ''}"><div class="mono small faint">${esc(d.day)}</div><div style="font-weight:600;margin-top:4px">${esc(d.title)}</div><div class="small muted">${esc(d.ctx)}</div><div class="mono small faint" style="margin-top:8px">${d.meetings} meeting${d.meetings === 1 ? '' : 's'}${d.deadlines ? ' · ' + d.deadlines + ' deadline' + (d.deadlines > 1 ? 's' : '') : ''}</div></div>`).join('')}</div></section>
  </main>`;
}

// ---------- SETTINGS ----------
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function googleSetup() {
  const g = S.app.google;
  const consoleLink = (path, label) => `<a href="https://console.cloud.google.com/${path}" target="_blank" rel="noopener">${label} ${I.ext}</a>`;
  if (g.connected) return `<div class="row"><span class="dot c-${g.tokenValid ? 'ok' : 'warn'}"></span><b>Connected as ${esc(g.email || 'your account')}</b><span class="faint small">· ${g.tokenValid ? 'session active until ' + esc(fmtT(new Date(g.tokenExpires).toISOString())) : 'session expired'}</span><span class="grow"></span><button class="btn btn-sm ${g.tokenValid ? '' : 'btn-p'}" data-act="g-connect">${g.tokenValid ? 'Refresh session' : 'Refresh Google'}</button><button class="btn btn-g btn-sm" data-act="g-disconnect">Disconnect</button></div>
    ${g.missingScopes.length ? `<p class="small c-warn" style="margin:8px 0 0">Some permissions were not granted (${g.missingScopes.length}). <button class="btn btn-sm" data-act="g-connect" data-consent="1">Reconnect and tick every box</button></p>` : ''}
    <p class="small faint" style="margin:8px 0 0">Read-only access to Gmail, Calendar, Drive file names and Google Tasks. Google sessions last about an hour, so the app refreshes it when you open it (one quick redirect). Revoke anytime at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</p>`;
  return `<div><p class="muted" style="margin:0 0 8px">Google requires every app to have its own “key” (a Client ID). It takes about 10 minutes, once. Easiest on a computer — then use the app on your phone. (<a href="GUIA.html#google" target="_blank" rel="noopener">guía paso a paso en español</a>)</p>
  <ol class="howto">
    <li>Open ${consoleLink('projectcreate', 'Google Cloud → New project')}. Name it <code>AI OS</code> → <b>Create</b>.</li>
    <li>Enable the four APIs (check the top bar says <b>AI OS</b>, click <b>Enable</b>): ${consoleLink('apis/library/gmail.googleapis.com', 'Gmail')} · ${consoleLink('apis/library/calendar-json.googleapis.com', 'Calendar')} · ${consoleLink('apis/library/drive.googleapis.com', 'Drive')} · ${consoleLink('apis/library/tasks.googleapis.com', 'Tasks')}</li>
    <li>${consoleLink('auth/overview', 'Google Auth Platform')} → <b>Get started</b>: app name <code>AI OS</code>, your email → Audience <b>External</b> → your email → agree → <b>Create</b>.</li>
    <li>${consoleLink('auth/audience', 'Audience')} → <b>Test users</b> → <b>Add users</b> → your Gmail → <b>Save</b>.</li>
    <li>${consoleLink('auth/clients', 'Clients')} → <b>Create client</b> → type <b>Web application</b>.<br>Under <b>Authorized JavaScript origins</b> add:<div class="row" style="margin:6px 0;flex-wrap:nowrap"><code>${esc(g.origin)}</code><button class="btn btn-sm" data-act="copy" data-text="${esc(g.origin)}">Copy</button></div>Under <b>Authorized redirect URIs</b> add:<div class="row" style="margin:6px 0;flex-wrap:nowrap"><code>${esc(g.redirectUri)}</code><button class="btn btn-sm" data-act="copy" data-text="${esc(g.redirectUri)}">Copy</button></div><b>Create</b>, then copy the <b>Client ID</b> (you don’t need the secret).</li>
    <li>Paste it here → <b>Save</b>:<div class="row" style="margin-top:8px;flex-wrap:nowrap;max-width:620px"><label class="sr" for="g-id">Client ID</label><input id="g-id" class="input grow" placeholder="1234567890-abc….apps.googleusercontent.com" value="${esc(g.clientId)}"><button class="btn" data-act="g-save">Save</button></div></li>
    <li>Tap <b>Connect Google</b> → choose your account → <i>“Google hasn’t verified this app”</i> → <b>Continue</b> → tick <b>every</b> box → <b>Continue</b>.
      <div style="margin-top:8px"><button class="btn btn-p" data-act="g-connect" ${g.configured ? '' : 'disabled title="Save your Client ID first"'}>Connect Google</button></div></li>
  </ol></div>`;
}
function aiSetup() {
  return S.app.ai ? `<div class="row"><span class="dot c-ok"></span><b>AI on</b><span class="faint">· model ${esc(S.app.model || 'auto')}</span><span class="grow"></span><button class="btn btn-g btn-sm" data-act="ai-remove">Remove key</button></div><p class="small faint" style="margin:8px 0 0">Used this session: ${S.app.usage.calls} calls · ${Math.round((S.app.usage.inputTokens + S.app.usage.outputTokens) / 1000)}k tokens${S.app.usage.lastError ? ' · last error: ' + esc(S.app.usage.lastError) : ''}. Your data is sent to Anthropic only to generate answers.</p>`
    : `<p class="muted" style="margin:0 0 8px">Optional. Without a key the app uses built-in rules. With one, it writes the brief, triages email, finds commitments, drafts replies and answers free-form questions.</p>
    <ol class="howto"><li>Open <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com → API keys ${I.ext}</a>, sign up, and add a few dollars of credit under <b>Billing</b>.</li><li>Click <b>Create key</b>, copy it, paste it here:
    <div class="row" style="margin-top:8px;flex-wrap:nowrap;max-width:620px"><input id="ai-key" class="input grow" type="password" placeholder="sk-ant-…"><button class="btn btn-p" data-act="ai-save">${ui.busy.ai ? '<span class="spin"></span>' : 'Save &amp; test'}</button></div></li></ol>`;
}
function settingsPage() {
  const s = S.app.settings; const last = S.run.last;
  const ruleText = (r) => { const t = S.app.ruleTypes[r.type]; return t ? t.label.replace('…', r.value ? `“${r.value}”` : '…') : r.type; };
  const sec = (id, title, body, sub = '') => `<section id="${id}" class="card" style="padding:22px"><div class="sec-head" style="margin-bottom:4px"><h2 class="h2">${title}</h2>${sub}</div>${body}</section>`;
  return `<div class="wrap body" style="max-width:1100px"><main class="main" style="flex-basis:100%">
  ${sec('connections', 'Google account', googleSetup(), S.app.demo ? pill('Demo data on', 'warn') : '')}
  ${!S.app.google.connected ? sec('demo', 'Try it first', `<p class="muted" style="margin:0 0 12px">Explore the dashboard with clearly labeled sample data. It’s removed automatically when you connect Google.</p><button class="btn" data-act="demo" data-on="${S.app.demo ? '' : '1'}">${S.app.demo ? 'Turn off demo data' : 'Load demo data'}</button>`) : ''}
  ${sec('ai', 'AI (Anthropic)', aiSetup())}
  ${sec('brief', 'Morning brief', `
    <div class="field"><label for="s-name">Your first name</label><input id="s-name" class="input" style="max-width:260px" value="${esc(s.name)}" placeholder="for the greeting"></div>
    <div class="field"><label for="s-time">Brief ready at</label><span class="row"><input id="s-time" class="input mono" type="time" value="${esc(s.briefTime)}" style="width:130px"><span class="small faint">Time zone: ${esc(S.app.tz)}. Your new brief is built the first time you open the app after this time (phones don’t let web apps run in the background).</span></span></div>
    <div class="field"><span>Days</span><span class="row" style="gap:6px">${DAYS.map((d, i) => `<button class="chipbtn mono" style="min-width:48px;min-height:38px" aria-pressed="${!!s.days[i]}" data-act="day" data-i="${i}">${d}</button>`).join('')}</span></div>
    <div class="field"><span>Briefing length</span><span class="row" style="gap:6px">${['compact', 'standard', 'detailed'].map((l) => `<button class="chipbtn" aria-pressed="${s.length === l}" data-act="set" data-k="length" data-v="${l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}</span></div>
    <div class="field"><span>Refresh Google automatically when I open the app</span><span class="row"><button class="switch" role="switch" aria-checked="${!!s.autoGoogle}" aria-label="Refresh Google automatically" data-act="set-bool" data-k="autoGoogle"></button><span class="small faint">One quick redirect to Google, then back</span></span></div>
    <div class="field"><label for="s-live">Live updates every</label><span class="row"><select id="s-live" class="input" style="width:120px">${[5, 10, 15, 30, 60].map((m) => `<option ${+s.liveMinutes === m ? 'selected' : ''}>${m}</option>`).join('')}</select><span class="small faint">minutes while the app is open — updates affected sections without rewriting the brief</span></span></div>
    <div class="field"><span>Working hours</span><span class="row"><input id="s-ws" class="input mono" type="time" value="${esc(s.workStart)}" style="width:120px" aria-label="Start"> – <input id="s-we" class="input mono" type="time" value="${esc(s.workEnd)}" style="width:120px" aria-label="End"><label class="small faint" for="s-mm">“morning” means</label><input id="s-mm" class="input mono" type="time" value="${esc(s.morningMeans)}" style="width:120px"></span></div>
    <div class="row" style="margin-top:14px"><button class="btn btn-p" data-act="save-brief">Save</button></div>`)}
  ${sec('rules', 'Priority rules', `<p class="small faint" style="margin:0 0 8px">Your rules always override AI judgement.</p><ul class="ul">${(s.rules || []).map((r) => `<li class="row" style="padding:12px 0;border-top:1px solid var(--bd);flex-wrap:nowrap"><span class="grow">${esc(ruleText(r))}</span><button class="switch" role="switch" aria-checked="${r.on}" aria-label="Enable rule" data-act="rule-toggle" data-id="${esc(r.id)}"></button><button class="btn btn-g btn-sm" data-act="rule-del" data-id="${esc(r.id)}" aria-label="Delete rule">×</button></li>`).join('') || '<li class="empty">No rules yet.</li>'}</ul>
    <div class="row" style="margin-top:12px"><select id="r-type" class="input" style="flex:1 1 280px">${Object.entries(S.app.ruleTypes).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select><input id="r-val" class="input" style="flex:1 1 200px" placeholder="value (email, @domain, project, hours, amount…)"><button class="btn btn-p" data-act="rule-add">Add rule</button></div>
    <div class="field" style="margin-top:14px"><label for="s-people">Important people</label><span class="row"><input id="s-people" class="input grow" value="${esc((s.importantPeople || []).join(', '))}" placeholder="boss@company.com, @bigclient.com"><button class="btn" data-act="save-people">Save</button></span></div>`)}
  ${sec('projects', 'Projects', `<p class="small faint" style="margin:0 0 8px">Projects connect email, meetings, tasks and files. Anything mentioning a keyword — or involving a listed person — is linked automatically.</p>
    <ul class="ul">${S.projects.map((p) => `<li style="padding:12px 0;border-top:1px solid var(--bd)"><div class="row"><b class="grow">${esc(p.name)}${p.important ? ' <span class="c-warn">★ important</span>' : ''}${p.demo ? ' ' + pill('demo', 'warn') : ''}</b><button class="btn btn-sm" data-act="proj-edit" data-id="${esc(p.id)}">Edit</button><button class="btn btn-g btn-sm" data-act="proj-del" data-id="${esc(p.id)}">Delete</button></div><div class="small faint">Keywords: ${esc(p.keywords.join(', ') || '—')} · People: ${esc(p.people.join(', ') || '—')}</div></li>`).join('') || '<li class="empty">No projects yet.</li>'}</ul>
    <div class="row" style="margin-top:12px"><button class="btn btn-p" data-act="proj-edit">Add project</button></div>`)}
  ${sec('health', 'Integration health', `<div class="tbl-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th class="eyebrow">Source</th><th class="eyebrow">Status</th><th class="eyebrow">Last successful sync</th><th class="eyebrow">Records</th><th class="eyebrow">Access</th></tr></thead><tbody>
    ${S.sources.map((x) => `<tr><td><b>${esc(x.label)}</b>${x.error ? `<div class="small c-crit">${esc(x.error)}</div>` : ''}</td><td>${pill(x.status === 'ok' ? 'Connected' : x.status === 'reconnect' ? 'Reconnect' : 'Sync failed', x.status === 'ok' ? 'ok' : x.status === 'reconnect' ? 'warn' : 'crit')}</td><td class="mono small muted">${esc(fmtWhen(x.lastSuccess))}</td><td class="mono small muted">${esc(x.records ?? '—')}</td><td><span class="tag l-info">READ</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing connected yet.</td></tr>'}
    </tbody></table></div><p class="small faint" style="margin:10px 0 0">If a source fails, its last good data is kept and marked — never erased. Next morning run: ${esc(S.run.nextMorning ? fmtWhen(S.run.nextMorning) : 'off')}.</p>`, `<button class="btn btn-sm" data-act="refresh" ${S.run.running || !S.app.hasSources ? 'disabled' : ''}>${I.refresh} Refresh now</button>`)}
  ${sec('pipeline', 'Last run', last ? `<div class="mono small muted" style="margin-bottom:12px">${esc(last.type)} · ${esc(fmtWhen(last.startedAt))} → ${esc(fmtT(last.finishedAt))} · ${esc(last.status)}${last.error ? ' · ' + esc(last.error) : ''}</div><ol class="ul" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">${last.stages.map((st, i) => `<li class="stage" style="${st.status !== 'ok' ? 'border-color:var(--warn)' : ''}"><div class="row" style="justify-content:space-between"><span class="mono small faint">${String(i + 1).padStart(2, '0')}</span><span class="mono small c-${st.status === 'ok' ? 'ok' : st.status === 'skipped' ? 'mute' : st.status === 'partial' ? 'warn' : 'crit'}">${esc(st.status)}</span></div><div class="s13" style="font-weight:500">${esc(st.name)}</div><div class="small faint">${esc(st.detail)}</div></li>`).join('')}</ol>` : '<div class="empty">No runs yet.</div>')}
  ${sec('perms', 'Permissions & safety', `<div class="tbl-wrap"><table class="tbl" style="min-width:560px"><thead><tr><th class="eyebrow">Action</th><th class="eyebrow">Risk</th><th class="eyebrow">This app</th></tr></thead><tbody>
    ${[['Read email, calendar, file names, tasks', 'Low', 'ok', 'Allowed (read-only access)'], ['Draft replies', 'Low', 'ok', 'Allowed — you copy and send them yourself'], ['Create tasks & reminders', 'Low', 'ok', 'Allowed — stored in this app only'], ['Send email', 'Medium', 'warn', 'Not possible — no send permission'], ['Create, move or cancel meetings', 'High', 'crit', 'Not possible — calendar is read-only'], ['Delete email, files or tasks', 'High', 'crit', 'Not possible — no delete permission']].map((r) => `<tr><td>${r[0]}</td><td>${pill(r[1], r[2])}</td><td class="muted">${r[3]}</td></tr>`).join('')}</tbody></table></div>
    <p class="small faint" style="margin:10px 0 0">Your data is stored only in this browser on this device (${S.app.storageKB} KB used) — not on GitHub or any server. Using another phone or computer means connecting there too. The AI key, if you add one, is also stored only here; data goes directly from this device to Google and to Anthropic.</p>`)}
  ${sec('danger', 'Reset', `<p class="small faint" style="margin:0 0 10px">Deletes synced data, snapshots and history on this device (keeps your settings, projects and connections).</p><button class="btn btn-d" data-act="reset">Delete synced data</button>`)}
  </main></div>`;
}

// ---------- WELCOME / ONBOARDING ----------
function welcomePage() {
  const st = ui.step; const g = S.app.google;
  const steps = ['Connect accounts', 'Choose brief time', 'Priority preferences', 'Generate first brief'];
  const canNext = st !== 1 || S.app.hasSources;
  const s = S.app.settings;
  let body = '';
  if (st === 1) body = `<h2 class="h2" style="font-size:20px;margin-bottom:12px">Connect your Google account</h2>${googleSetup()}
    ${!g.connected ? `<div class="box" style="margin-top:18px"><b>Just want to look around first?</b> <span class="muted">Load clearly-labeled demo data — it’s removed when you connect.</span><div style="margin-top:8px"><button class="btn" data-act="demo" data-on="${S.app.demo ? '' : '1'}">${S.app.demo ? 'Demo data is on — turn off' : 'Load demo data'}</button></div></div>` : ''}
    <div class="box" style="margin-top:12px"><b>Optional: AI</b><div style="margin-top:8px">${aiSetup()}</div></div>`;
  if (st === 2) body = `<h2 class="h2" style="font-size:20px">When should your brief be ready?</h2><p class="muted">Each day, the first time you open the app after this time, it syncs and builds your new brief. During the day it updates every few minutes while open.</p>
    <div class="row" style="gap:16px;align-items:flex-end"><label style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow">Your first name</span><input id="s-name" class="input" value="${esc(s.name)}"></label><label style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow">Time</span><input id="s-time" class="input mono" type="time" value="${esc(s.briefTime)}" style="width:140px"></label><span class="small faint" style="padding-bottom:10px">Time zone: ${esc(S.app.tz)}</span></div>
    <div class="row" style="gap:6px;margin-top:16px">${DAYS.map((d, i) => `<button class="chipbtn mono" style="min-width:48px;min-height:38px" aria-pressed="${!!s.days[i]}" data-act="day" data-i="${i}">${d}</button>`).join('')}</div>`;
  if (st === 3) body = `<h2 class="h2" style="font-size:20px">What should always rise to the top?</h2><p class="muted">Start with a few rules — your rules always override the AI. You can change these anytime in Settings.</p>
    <ul class="ul">${(s.rules || []).map((r) => `<li class="row" style="padding:10px 0;border-top:1px solid var(--bd);flex-wrap:nowrap"><span class="grow">${esc(S.app.ruleTypes[r.type]?.label.replace('…', r.value ? '“' + r.value + '”' : '…'))}</span><button class="switch" role="switch" aria-checked="${r.on}" data-act="rule-toggle" data-id="${esc(r.id)}" aria-label="Enable rule"></button></li>`).join('')}</ul>
    <label style="display:flex;flex-direction:column;gap:6px;margin-top:16px"><span class="eyebrow">Important people (emails or @domains, comma-separated)</span><span class="row" style="flex-wrap:nowrap"><input id="s-people" class="input grow" value="${esc((s.importantPeople || []).join(', '))}" placeholder="boss@company.com, @bigclient.com"><button class="btn" data-act="save-people">Save</button></span></label>`;
  if (st === 4) body = `<h2 class="h2" style="font-size:20px">Building your first brief</h2><p class="muted">This first run looks back a few days so you start with useful context.</p>
    ${S.run.running ? `<div class="row"><span class="spin"></span> ${esc(S.run.stage)}…</div>` : S.brief ? `<p class="c-ok"><b>Your brief is ready.</b></p><a class="btn btn-p" href="#/today" data-act="finish">Open Today</a>` : `<button class="btn btn-p" data-act="refresh">Generate now</button>`}
    ${S.run.last ? `<ol class="ul" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:16px">${S.run.last.stages.map((x) => `<li class="stage s13"><span class="c-${x.status === 'ok' ? 'ok' : 'warn'}">${x.status === 'ok' ? '✓' : '!'}</span> ${esc(x.name)}<div class="small faint">${esc(x.detail)}</div></li>`).join('')}</ol>` : ''}`;
  return `<main class="wrap" style="max-width:1000px;padding-top:48px;padding-bottom:56px;display:flex;flex-direction:column;gap:24px">
    <div>${I.logo}<h1 class="h1" style="margin:12px 0 6px;font-size:32px">Welcome to your AI Operating System.</h1><p class="muted" style="margin:0;font-size:16px">Connect your tools to build your first Daily Brief. Nothing appears until real data arrives — no fake activity. <a href="GUIA.html" target="_blank" rel="noopener">Guía paso a paso (español)</a></p></div>
    <ol class="ul steps-nav">${steps.map((l, i) => `<li><button class="step-btn" aria-current="${st === i + 1 ? 'step' : 'false'}" data-act="step" data-i="${i + 1}"><span class="mono small ${i + 1 < st ? 'c-ok' : st === i + 1 ? 'c-info' : 'faint'}">STEP ${i + 1} · ${i + 1 < st ? 'DONE' : st === i + 1 ? 'NOW' : 'NEXT'}</span><span style="display:block;font-weight:600;margin-top:2px">${l}</span></button></li>`).join('')}</ol>
    <section class="card brief">${body}
      <div class="row" style="margin-top:24px;padding-top:18px;border-top:1px solid var(--bd)"><button class="btn" data-act="step" data-i="${Math.max(1, st - 1)}">Back</button><span class="grow small faint">${st === 1 && !canNext ? 'Connect Google (or load demo data) to continue.' : ''}</span>
      ${st < 4 ? `<button class="btn btn-p" data-act="step-next" ${canNext ? '' : 'disabled'}>${st === 3 ? 'Generate my first brief' : 'Continue'}</button>` : `<a class="btn" href="#/today" data-act="finish">Skip to dashboard</a>`}</div></section></main>`;
}

// ---------- modals ----------
function modal(html) { $('#modal-root').innerHTML = `<div class="modal-bg" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; const f = $('#modal-root [autofocus]') || $('#modal-root button'); f && f.focus(); }
const closeModal = () => { $('#modal-root').innerHTML = ''; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); if (ui.searchRes) { ui.searchRes = null; render(); } } });

async function showSources(ids) {
  modal('<div class="row"><span class="spin"></span> Loading sources…</div>');
  try {
    const list = await api('/api/describe?ids=' + encodeURIComponent(ids));
    modal(`<div class="sec-head"><h2 class="h2">Sources</h2><button class="btn btn-g" data-act="close">Close</button></div><ul class="ul divide">${list.map((s) => `<li class="row" style="padding:10px 0"><span class="tag t-FACT">${esc(s.type.toUpperCase())}</span><span class="grow">${esc(s.label)}</span><span class="mono small faint">${esc(s.when || '')}</span>${realLink(s.link) ? `<a class="btn btn-sm" href="${esc(s.link)}" target="_blank" rel="noopener">Open ${I.ext}</a>` : ''}</li>`).join('')}</ul>`);
  } catch (e) { modal(`<p class="c-crit">${esc(e.message)}</p><button class="btn" data-act="close">Close</button>`); }
}
async function showDraft(msgId) {
  modal('<div class="row"><span class="spin"></span> Drafting a reply from the thread…</div>');
  try {
    const d = await api(`/api/messages/${encodeURIComponent(msgId)}/draft`, { body: {} });
    modal(`<div class="sec-head"><h2 class="h2">Draft reply</h2>${tag('RECOMMENDATION')}</div>
      <div class="s13 muted">To: ${esc(d.to?.name || '')} &lt;${esc(d.to?.email || '')}&gt;</div><div class="s13 muted" style="margin-bottom:10px">Subject: ${esc(d.subject)}</div>
      <textarea id="draft-body" class="input" rows="12" style="width:100%" autofocus>${esc(d.body)}</textarea>
      ${d.placeholders?.length ? `<p class="small c-warn">Fill in before sending: ${d.placeholders.map(esc).join(' · ')}</p>` : ''}
      <p class="small faint">This app can’t send email. Copy the draft and send it from Gmail.</p>
      <div class="row"><button class="btn btn-p" data-act="copy-draft">Copy draft</button>${openLink(d.link, 'Open thread in Gmail')}<span class="grow"></span><button class="btn btn-g" data-act="close">Close</button></div>`);
  } catch (e) { modal(`<h2 class="h2">Draft reply</h2><p class="c-warn">${esc(e.message)}</p><div class="row"><a class="btn" href="#/settings" data-act="close">Open Settings</a><button class="btn btn-g" data-act="close">Close</button></div>`); }
}
async function showThread(msgId) {
  modal('<div class="row"><span class="spin"></span> Loading…</div>');
  try {
    const t = await api(`/api/messages/${encodeURIComponent(msgId)}/thread`);
    modal(`<div class="sec-head"><h2 class="h2">${esc(t[0]?.subject || 'Thread')}</h2><button class="btn btn-g" data-act="close">Close</button></div>${t.map((m) => `<div class="box" style="margin-bottom:10px"><div class="row"><b>${esc(m.from)}</b><span class="grow"></span><span class="mono small faint">${esc(m.date)}</span></div><div class="s13" style="white-space:pre-wrap;margin-top:6px">${esc(m.text)}</div></div>`).join('')}<p class="small faint">Showing the messages synced in the last few days.</p>`);
  } catch (e) { modal(`<p class="c-crit">${esc(e.message)}</p><button class="btn" data-act="close">Close</button>`); }
}
function projectModal(id) {
  const p = S.projects.find((x) => x.id === id) || { name: '', keywords: [], people: [], important: false };
  modal(`<h2 class="h2" style="margin-bottom:12px">${id ? 'Edit project' : 'New project'}</h2>
    <div style="display:grid;gap:10px"><label class="small faint" for="p-name">Name</label><input id="p-name" class="input" value="${esc(p.name)}" autofocus>
    <label class="small faint" for="p-kw">Keywords (comma-separated) — words that appear in related email subjects, events, tasks or file names</label><input id="p-kw" class="input" value="${esc(p.keywords.join(', '))}" placeholder="apex, msa, implementation">
    <label class="small faint" for="p-people">People (emails, comma-separated)</label><input id="p-people" class="input" value="${esc(p.people.join(', '))}" placeholder="john@apexcorp.com">
    <label class="row"><input id="p-imp" type="checkbox" ${p.important ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--pri)"> Important project (raises priority of everything linked to it)</label></div>
    <div class="row" style="margin-top:16px"><button class="btn btn-p" data-act="proj-save" data-id="${esc(id || '')}">Save</button><button class="btn btn-g" data-act="close">Cancel</button></div>`);
}
function addCommitModal() {
  modal(`<h2 class="h2" style="margin-bottom:12px">Add a commitment</h2><div style="display:grid;gap:10px">
    <label class="small faint" for="c-dir">Direction</label><select id="c-dir" class="input"><option value="i_owe">I owe someone</option><option value="they_owe">Someone owes me</option></select>
    <label class="small faint" for="c-person">Person</label><input id="c-person" class="input" autofocus>
    <label class="small faint" for="c-what">What</label><input id="c-what" class="input">
    <label class="small faint" for="c-date">Promised by (optional)</label><input id="c-date" class="input" type="date"></div>
    <div class="row" style="margin-top:16px"><button class="btn btn-p" data-act="commit-save">Save</button><button class="btn btn-g" data-act="close">Cancel</button></div>`);
}
function confirmModal(text, onYes) {
  ui.confirm = onYes;
  modal(`<h2 class="h2" style="margin-bottom:8px">Please confirm</h2><p>${esc(text)}</p><div class="row"><button class="btn btn-p" data-act="confirm-yes" autofocus>Confirm</button><button class="btn btn-g" data-act="close">Cancel</button></div>`);
}

// ---------- actions ----------
const val = (id) => document.getElementById(id)?.value ?? '';
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
async function refreshState() { S = await api('/api/state'); render(); }
async function saveSettings(patch, msg = 'Saved') { await api('/api/settings', { body: patch }); await refreshState(); toast(msg); }
async function doChat(q) {
  q = String(q || '').trim(); if (!q) return;
  if (route() !== 'today') location.hash = '#/today';
  ui.chatBusy = q; ui.chatDraft = ''; ui.searchRes = null; render();
  try { const e = await api('/api/chat', { body: { q } }); S.chat = [...S.chat, e].slice(-8); } catch (err) { toast(err.message, true); }
  ui.chatBusy = false; render();
}
async function openPrep(eventId, force = false) {
  if (ui.prep === eventId && !force) { ui.prep = null; render(); return; }
  ui.prep = eventId; if (force || !ui.preps[eventId]) { delete ui.preps[eventId]; render(); try { ui.preps[eventId] = await api(`/api/events/${encodeURIComponent(eventId)}/prep`, { body: { force } }); } catch (e) { ui.preps[eventId] = { error: e.message }; } }
  render();
}

const ACT = {
  theme: () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); const next = cur === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = next; store.set('aios-theme', next); },
  refresh: async () => { try { await api('/api/refresh', { body: { type: 'manual' } }); render(); } catch (e) { toast(e.message, true); } },
  'brief-why': () => { ui.briefWhy = !ui.briefWhy; render(); },
  why: (d) => { ui.why.has(d.id) ? ui.why.delete(d.id) : ui.why.add(d.id); render(); },
  sources: (d) => showSources(d.ids),
  tab: (d) => { ui.tab = d.tab; render(); },
  box: (d) => { ui.box = d.box; render(); },
  prep: (d) => openPrep(d.event),
  'prep-refresh': (d) => openPrep(d.event, true),
  'prio-action': async (d) => {
    if (d.type === 'draft') return showDraft(d.msg);
    if (d.type === 'prep') { await openPrep(d.event); document.querySelector(`[data-act="prep"][data-event="${CSS.escape(d.event)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (d.type === 'complete') return ACT['task-done'](d);
    if (d.type === 'commit_done') return ACT.commit({ id: d.commit, status: 'done' });
  },
  'task-done': async (d) => { try { await api(`/api/tasks/${encodeURIComponent(d.task)}`, { method: 'PATCH', body: { status: 'done' } }); toast('Marked done'); await refreshState(); } catch (e) { toast(e.message, true); await refreshState(); } },
  'task-tomorrow': async (d) => { await api(`/api/tasks/${encodeURIComponent(d.task)}`, { method: 'PATCH', body: { date: tomorrow() } }); toast('Moved to tomorrow'); await refreshState(); },
  draft: (d) => showDraft(d.msg),
  thread: (d) => showThread(d.msg),
  nudge: (d) => { const c = [...S.commitments.theyOwe, ...S.commitments.iOwe].find((x) => x.id === d.id); const id = c?.link && Object.values(S.inbox).flat().find((m) => m.link === c.link)?.id; if (id) showDraft(id); else toast('Open the original email to send a nudge.'); },
  snooze: async (d) => { await api(`/api/messages/${encodeURIComponent(d.msg)}/hide`, { body: { hours: 24 } }); toast('Snoozed until tomorrow'); await refreshState(); },
  hide: async (d) => { await api(`/api/messages/${encodeURIComponent(d.msg)}/hide`, { body: { archive: true } }); toast('Hidden from the dashboard (still in Gmail)'); await refreshState(); },
  recat: async (d) => { await api(`/api/messages/${encodeURIComponent(d.msg)}/category`, { body: { category: d.cat } }); toast('Updated'); await refreshState(); },
  'msg-task': async (d) => { await api('/api/tasks', { body: { title: d.title, sourceMessageId: d.msg } }); toast('Task created'); await refreshState(); },
  commit: async (d) => { await api(`/api/commitments/${encodeURIComponent(d.id)}`, { body: { status: d.status } }); toast(d.status === 'done' ? 'Marked as delivered' : 'Dismissed'); await refreshState(); },
  'commit-task': async (d) => { await api('/api/tasks', { body: { title: d.title, fromCommitment: d.id } }); toast('Task created'); await refreshState(); },
  'add-commit': () => addCommitModal(),
  'commit-save': async () => { try { await api('/api/commitments', { body: { direction: val('c-dir'), person: val('c-person'), what: val('c-what'), date: val('c-date') } }); closeModal(); toast('Commitment added'); await refreshState(); } catch (e) { toast(e.message, true); } },
  ask: (d) => doChat(d.q),
  'chat-send': () => doChat(val('chat-in')),
  'chat-clear': async () => { await api('/api/chat/clear', { body: {} }); S.chat = []; render(); },
  'chat-action': (d) => {
    const c = S.chat.find((x) => x.id === d.chat); const a = c?.actions?.[+d.i]; if (!a) return;
    if (a.type === 'draft_reply') return showDraft(a.message_id);
    confirmModal(a.label + '?', async () => {
      if (a.type === 'create_task') await api('/api/tasks', { body: { title: a.title, date: a.due || null } });
      if (a.type === 'reschedule_task') await api(`/api/tasks/${encodeURIComponent(a.task_id)}`, { method: 'PATCH', body: { date: a.due } });
      toast('Done'); await refreshState();
    });
  },
  'confirm-yes': async () => { const f = ui.confirm; closeModal(); ui.confirm = null; try { await f?.(); } catch (e) { toast(e.message, true); } },
  search: async () => { ui.searchQ = val('q').trim(); if (!ui.searchQ) { ui.searchRes = null; return render(); } ui.searchRes = { loading: true, items: [] }; render(); try { ui.searchRes = { items: await api('/api/search?q=' + encodeURIComponent(ui.searchQ)) }; } catch (e) { ui.searchRes = { items: [] }; toast(e.message, true); } render(); },
  'search-close': () => { ui.searchRes = null; render(); },
  'capture-open': () => { ui.capture = ui.capture ? null : { text: '', parsed: null }; render(); setTimeout(() => $('#cap-in')?.focus(), 0); },
  'capture-close': () => { ui.capture = null; render(); },
  'capture-parse': async () => { const text = val('cap-in').trim(); if (!text) return; ui.capture = { text, parsed: ui.capture?.parsed || null, busy: true }; render(); try { ui.capture.parsed = await api('/api/capture/parse', { body: { text } }); } catch (e) { toast(e.message, true); } ui.capture.busy = false; render(); },
  'capture-create': async () => {
    const type = val('cap-type'); const title = val('cap-title').trim(); if (!title) return toast('Add a title', true);
    try { await api('/api/tasks', { body: { title: (type === 'event' ? 'Schedule: ' : type === 'follow_up' ? 'Follow up: ' : '') + title.replace(/^(Schedule|Follow up): /, ''), date: val('cap-date') || null, time: val('cap-time') || null, kind: type, person: ui.capture.parsed?.person || null } }); ui.capture = null; toast(`${type.replace('_', '-')} created`); await refreshState(); } catch (e) { toast(e.message, true); }
  },
  'focus-start': async (d) => { await api('/api/focus', { body: { action: 'start', taskId: d.task } }); location.hash = '#/focus'; await refreshState(); },
  'focus-new': async () => { const t = val('focus-title').trim(); if (!t) return; await api('/api/focus', { body: { action: 'start', title: t } }); await refreshState(); },
  'focus-stop': async () => { await api('/api/focus', { body: { action: 'stop' } }); await refreshState(); toast('Focus ended — held updates are back on Today'); },
  'focus-done': async () => { const id = S.focus?.task?.id; try { if (id) await api(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'done' } }); } catch (e) { toast(e.message, true); } await api('/api/focus', { body: { action: 'stop' } }); location.hash = '#/today'; await refreshState(); toast('Nice — done.'); },
  'step-add': async () => { const t = val('step-in').trim(); if (!t) return; const steps = [...(S.focus.steps || []), { text: t, done: false }]; await api('/api/focus', { body: { action: 'steps', steps } }); await refreshState(); setTimeout(() => $('#step-in')?.focus(), 0); },
  'step-toggle': async (d) => { const steps = S.focus.steps.map((s, i) => (i === +d.i ? { ...s, done: !s.done } : s)); await api('/api/focus', { body: { action: 'steps', steps } }); await refreshState(); },
  'step-del': async (d) => { const steps = S.focus.steps.filter((_, i) => i !== +d.i); await api('/api/focus', { body: { action: 'steps', steps } }); await refreshState(); },
  'week-summary': async () => { ui.busy.week = true; render(); try { const s = await api('/api/weekly/summary', { body: {} }); ui.weekly.summary = s; } catch (e) { toast(e.message, true); } ui.busy.week = false; render(); },
  copy: async (d) => { try { await navigator.clipboard.writeText(d.text); toast('Copied'); } catch { toast('Select the text and copy it manually.'); } },
  'copy-draft': async () => { try { await navigator.clipboard.writeText(val('draft-body')); toast('Draft copied — paste it into Gmail'); } catch { toast('Select the text and copy it manually.'); } },
  'g-save': async () => { try { await api('/api/config/google', { body: { clientId: val('g-id') } }); toast('Saved — now tap Connect Google'); await refreshState(); } catch (e) { toast(e.message, true); } },
  'g-connect': async (d) => { try { toast('Opening Google…'); await api('/api/google/connect', { body: { consent: !!d.consent, returnTo: location.hash || '#/today' } }); } catch (e) { toast(e.message, true); } },
  'g-disconnect': () => confirmModal('Disconnect Google? Synced data stays on this device until you reset it.', async () => { await api('/api/google/disconnect', { body: {} }); await refreshState(); }),
  'ai-save': async () => { ui.busy.ai = true; render(); try { const r = await api('/api/config/anthropic', { body: { apiKey: val('ai-key') } }); toast('AI is on · ' + r.model); } catch (e) { toast(e.message, true); } ui.busy.ai = false; await refreshState(); },
  'ai-remove': () => confirmModal('Remove the AI key? The app will switch to built-in rules.', async () => { await api('/api/config/anthropic', { body: { apiKey: '' } }); await refreshState(); }),
  demo: async (d) => { toast(d.on ? 'Loading demo data…' : 'Removing demo data…'); try { await api('/api/demo', { body: { on: !!d.on } }); await refreshState(); } catch (e) { toast(e.message, true); } },
  day: async (d) => { const days = [...S.app.settings.days]; days[+d.i] = !days[+d.i]; await saveSettings({ days }); },
  set: async (d) => saveSettings({ [d.k]: d.v }),
  'set-bool': async (d) => saveSettings({ [d.k]: !S.app.settings[d.k] }),
  'save-brief': () => saveSettings({ name: val('s-name').trim(), briefTime: val('s-time') || '06:00', liveMinutes: +val('s-live') || 15, workStart: val('s-ws'), workEnd: val('s-we'), morningMeans: val('s-mm') }),
  'save-people': () => saveSettings({ importantPeople: val('s-people').split(',').map((x) => x.trim()).filter(Boolean) }),
  'rule-toggle': (d) => saveSettings({ rules: S.app.settings.rules.map((r) => (r.id === d.id ? { ...r, on: !r.on } : r)) }),
  'rule-del': (d) => saveSettings({ rules: S.app.settings.rules.filter((r) => r.id !== d.id) }, 'Rule removed'),
  'rule-add': () => { const type = val('r-type'); const value = val('r-val').trim(); if (S.app.ruleTypes[type].needs && !value) return toast('This rule needs a value', true); saveSettings({ rules: [...S.app.settings.rules, { id: 'r' + Date.now(), type, value, on: true }] }, 'Rule added — applied to your inbox'); },
  'proj-edit': (d) => projectModal(d.id),
  'proj-save': async (d) => { try { await api('/api/projects', { body: { id: d.id || undefined, name: val('p-name'), keywords: val('p-kw').split(','), people: val('p-people').split(','), important: document.getElementById('p-imp').checked } }); closeModal(); toast('Project saved — linking happens on the next refresh'); await refreshState(); ACT.refresh(); } catch (e) { toast(e.message, true); } },
  'proj-del': (d) => confirmModal('Delete this project? Linked items are just unlinked.', async () => { await api('/api/projects', { body: { id: d.id, delete: true } }); await refreshState(); }),
  reset: () => confirmModal('Delete all synced data, snapshots and history on this device?', async () => { await api('/api/reset', { body: {} }); await refreshState(); toast('Data deleted'); }),
  step: async (d) => { await persistWelcome(); ui.step = +d.i; render(); },
  'step-next': async () => { await persistWelcome(); if (ui.step === 3) { await api('/api/settings', { body: { onboarded: true } }); ui.step = 4; await ACT.refresh(); } else ui.step++; await refreshState(); },
  finish: async () => { await api('/api/settings', { body: { onboarded: true } }); },
  close: () => closeModal(),
  'modal-bg': (d, e) => { if (e.target.classList.contains('modal-bg')) closeModal(); }
};
async function persistWelcome() { if (ui.step === 2 && $('#s-time')) await api('/api/settings', { body: { name: val('s-name').trim(), briefTime: val('s-time') || '06:00' } }); }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) { if (ui.searchRes && !e.target.closest('.search')) { ui.searchRes = null; render(); } return; }
  const act = el.dataset.act; if (!ACT[act]) return;
  if (el.tagName === 'A' && act !== 'finish' && act !== 'close') e.preventDefault();
  if (el.tagName === 'INPUT' && el.type === 'checkbox') e.preventDefault();
  Promise.resolve(ACT[act]({ ...el.dataset }, e)).catch((err) => toast(err.message, true));
});
document.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('[data-enter]'); if (!el || e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault(); ACT[el.dataset.enter]?.({ ...el.dataset });
});
document.addEventListener('input', (e) => { if (e.target.id === 'chat-in') ui.chatDraft = e.target.value; if (e.target.id === 'q') ui.searchQ = e.target.value; if (e.target.id === 'cap-in' && ui.capture) ui.capture.text = e.target.value; });

boot().then((r) => {
  if (r?.redirecting) { $('#app').innerHTML = '<div class="boot">Refreshing your Google session…</div>'; return; }
  if (r?.error) setTimeout(() => toast(r.error, true), 300);
  if (r?.ok) { setTimeout(() => toast(r.missing?.length ? 'Connected, but some permissions were not granted — see Settings.' : 'Google connected — syncing your data'), 300); if (route() === 'welcome' && ui.step === 1) ui.step = 2; }
  return load().then(() => { lastRunning = !!S?.run?.running; pollTimer = setTimeout(poll, lastRunning ? 1500 : 45000); });
}).catch((e) => { $('#app').innerHTML = `<div class="boot">Could not start: ${esc(e.message)}</div>`; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
