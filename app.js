// AI Operating System — presentation layer. Reads the view model from the local server; never calls providers directly.
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const realLink = (l) => l && l !== '#demo' && /^(https?:|mailto:)/.test(l);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

import { api as localApi, boot } from './js/api.js';
import { BRAND, apply as applyBrand, logoHtml } from './js/brand.js';
import { L, LANG, LOCALE } from './js/i18n.js';
import { fmtTime } from './js/dates.js';
document.documentElement.lang = LANG;
applyBrand(BRAND);
const THEME_KEY = BRAND.id + '-theme';
try { const t = localStorage.getItem(THEME_KEY) || (BRAND.temaInicial !== 'auto' ? BRAND.temaInicial : null); if (t) document.documentElement.dataset.theme = t; } catch {}
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
const LVL = { Critical: L('Critical', 'Crítica'), High: L('High', 'Alta'), Normal: 'Normal', Low: L('Low', 'Baja') };
const TAGL = { FACT: L('FACT', 'HECHO'), INFERENCE: L('INFERENCE', 'INFERENCIA'), RECOMMENDATION: L('RECOMMENDATION', 'RECOMENDACIÓN') };
const KIND = { Meeting: L('MEETING', 'REUNIÓN'), Block: L('BLOCK', 'BLOQUE'), Deadline: L('DEADLINE', 'PLAZO'), Suggested: L('SUGGESTED', 'SUGERIDO'), Promise: L('PROMISE', 'PROMESA') };
const SRCK = { DOCUMENT: L('DOCUMENT', 'DOCUMENTO'), EMAIL: L('EMAIL', 'CORREO'), CALENDAR: L('CALENDAR', 'CALENDARIO'), TASK: L('TASK', 'TAREA') };
const IMP = { high: L('high', 'alta'), normal: 'normal', low: L('low', 'baja') };
const STATUS = { ok: 'ok', partial: L('partial', 'parcial'), failed: L('failed', 'falló'), skipped: L('skipped', 'omitido') };
const RUNTYPE = { manual: 'manual', morning: L('morning', 'matutina'), live: L('live', 'en vivo') };
const CAPT = { task: L('task', 'tarea'), reminder: L('reminder', 'recordatorio'), follow_up: L('follow-up', 'seguimiento'), note: L('note', 'nota'), event: L('event', 'evento') };
const tag = (t) => `<span class="tag t-${esc(t)}">${esc(TAGL[t] || t)}</span>`;
const pill = (label, level) => `<span class="pill l-${esc(level)}">${esc(label)}</span>`;
const openLink = (link, label = L('Open', 'Abrir')) => (realLink(link) ? `<a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${esc(label)} ${I.ext}</a>` : '');
const initials = (n) => esc(String(n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
const fmtT = (iso) => (iso ? fmtTime(iso) : '');
const fmtWhen = (iso) => { if (!iso) return '—'; const d = new Date(iso); const today = new Date().toDateString() === d.toDateString(); return (today ? L('today ', 'hoy ') : d.toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' }) + ' ') + fmtT(iso); };

// ---------- routing ----------
const route = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || '') || 'today';
window.addEventListener('hashchange', () => { ui.searchRes = null; if (route() === 'weekly') loadWeekly(); render(); window.scrollTo(0, 0); });

async function load() {
  try { S = await api('/api/state'); } catch (e) { $('#app').innerHTML = `<div class="boot">${L('Something went wrong loading your data: ', 'Algo salió mal al cargar tus datos: ')}${esc(e.message)}</div>`; return; }
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
    if (finished) { toast(S.run.last?.status === 'failed' ? L('Update finished with problems — see Settings → Last run.', 'La actualización terminó con problemas — mira Ajustes → Última ejecución.') : L('Dashboard updated.', 'Panel actualizado.')); if (route() === 'weekly') loadWeekly(); }
    if (!isTyping()) render();
  } catch {}
  clearTimeout(pollTimer); pollTimer = setTimeout(poll, S?.run?.running ? 1500 : 45000);
}
const isTyping = () => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.value; };
// ---------- shell ----------
const PAGE = { today: L('Today', 'Hoy'), focus: L('Focus', 'Enfoque'), weekly: L('Weekly review', 'Revisión semanal'), settings: L('Settings', 'Ajustes'), welcome: L('Welcome', 'Bienvenida') };
function topbar() {
  const r = route();
  const d = new Date();
  return `<header class="topbar"><div class="wrap topbar-in">
    <a class="brand" href="#/today" aria-label="${esc(BRAND.nombre)}">${logoHtml(BRAND, 28)}<span><span style="display:block;font-weight:600;font-size:15px">${PAGE[r] || PAGE.today}</span><span class="mono faint" style="font-size:11px">${esc(d.toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' }))}${S.app.demo ? ' · demo' : ''}</span></span></a>
    <div class="search">
      <label><span class="sr">${L('Search or ask', 'Buscar o preguntar')}</span>${I.search}<input id="q" type="text" autocomplete="off" placeholder="${L('Ask anything or find anything…', 'Pregunta o busca lo que sea…')}" value="${esc(ui.searchQ)}" data-enter="search"><span class="mono faint small" style="border:1px solid var(--bd2);border-radius:4px;padding:1px 6px">${L('Enter', 'Intro')}</span></label>
      ${ui.searchRes ? searchResults() : ''}
    </div>
    <nav class="nav" aria-label="${L('Views', 'Vistas')}">
      <button class="btn btn-p" data-act="capture-open">${I.plus} ${L('Capture', 'Capturar')}</button>
      <a class="btn" href="#/focus" ${r === 'focus' ? 'aria-current="page"' : ''}>${I.focus} ${L('Focus', 'Enfoque')}</a>
      <a class="btn" href="#/weekly" ${r === 'weekly' ? 'aria-current="page"' : ''}>${L('Weekly review', 'Revisión semanal')}</a>
      <a class="btn btn-g" href="#/settings" aria-label="${L('Settings', 'Ajustes')}">${I.gear}</a>
      <button class="btn btn-g" data-act="theme" aria-label="${L('Switch light or dark mode', 'Cambiar modo claro u oscuro')}">${I.moon}</button>
    </nav>
  </div>${ui.capture ? captureBox() : ''}</header>`;
}
function statusStrip() {
  const run = S.run; const bad = S.sources.filter((s) => s.status && s.status !== 'ok');
  return `<div class="strip"><div class="wrap strip-in">
    ${S.app.demo ? `${pill(L('Demo data', 'Datos de demo'), 'warn')}<span class="muted">${L('Sample records — not your real email or calendar.', 'Datos de ejemplo — no son tu correo ni tu agenda reales.')} <a href="#/welcome">${L('Connect Google', 'Conecta Google')}</a> ${L('to replace them.', 'para reemplazarlos.')}</span>` : ''}
    ${!S.app.ai ? `<a href="#/settings" class="pill l-mute" style="text-decoration:none" title="${L('Add an Anthropic API key for AI-written briefs, drafts and answers', 'Agrega una clave de Anthropic para resúmenes, borradores y respuestas escritos por IA')}">${L('AI off · rules mode', 'IA apagada · modo reglas')}</a>` : ''}
    <span class="grow"></span>
    ${run.running ? `<span class="row muted"><span class="spin"></span> ${L('Updating', 'Actualizando')} · ${esc(run.stage || '')}</span>` : `<span class="mono muted">${run.lastBriefAt ? L('Brief generated ', 'Resumen generado ') + esc(fmtWhen(run.lastBriefAt)) : L('No brief yet', 'Aún no hay resumen')}${run.last && run.last.type === 'live' ? L(' · live ', ' · en vivo ') + esc(fmtT(run.last.finishedAt)) : ''}</span>`}
    <button class="btn btn-sm" data-act="refresh" ${run.running || !S.app.hasSources ? 'disabled' : ''}>${I.refresh} ${L('Refresh now', 'Actualizar ahora')}</button>
    ${S.app.google.connected && !S.app.google.tokenValid ? `<button class="row l-warn" style="padding:4px 10px;border-radius:999px;border:0;cursor:pointer;font:inherit" data-act="g-connect"><span class="dot"></span>${L('Google session expired · tap to refresh', 'Sesión de Google vencida · toca para renovar')}</button>` : ''}
    ${bad.filter((x) => !(x.status === 'reconnect' && S.app.google.connected && !S.app.google.tokenValid)).map((s) => `<a href="#/settings" class="row l-${s.status === 'reconnect' ? 'warn' : 'crit'}" style="padding:4px 10px;border-radius:999px;text-decoration:none"><span class="dot"></span>${esc(s.label)} ${s.status === 'reconnect' ? L('needs reconnecting', 'necesita reconectarse') : L('sync failed', 'no se sincronizó')} · ${L('insights may be incomplete', 'la información puede estar incompleta')}</a>`).join('')}
  </div></div>`;
}
function render() {
  if (!S) return;
  const a = document.activeElement; const fid = a?.id; const sel = a && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  const r = route();
  document.title = `${PAGE[r] || PAGE.today} — ${BRAND.nombre}`;
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
  return `<section class="card pad" style="border-color:var(--pri-b)"><div class="sec-head" style="margin-bottom:8px"><span class="eyebrow c-info">${L('New since this morning’s brief', 'Nuevo desde el resumen de esta mañana')}</span><span class="faint small">${L('Live updates · the brief itself is regenerated tomorrow or when you refresh', 'Actualizaciones en vivo · el resumen se vuelve a generar mañana o cuando actualices')}</span></div>
  <ul class="ul">${S.live.map((l) => `<li class="row s13" style="padding:4px 0"><span class="dot c-${esc(l.level)}"></span>${esc(l.text)}<span class="faint mono small">· ${esc(fmtT(l.at))}</span></li>`).join('')}</ul></section>`;
}
function briefCard() {
  const b = S.brief; const name = S.app.settings.name;
  const h = new Date().getHours(); const greet = h < 12 ? L('Good morning', 'Buenos días') : h < 18 ? L('Good afternoon', 'Buenas tardes') : L('Good evening', 'Buenas noches');
  if (!b) {
    return `<section class="card brief"><span class="eyebrow c-info">${L('Morning brief', 'Resumen matutino')}</span><h1 class="h1" style="margin:12px 0 8px">${greet}${name ? ', ' + esc(name) : ''}.</h1>
      <p class="muted" style="margin:0 0 16px">${S.app.hasSources ? (S.run.running ? L('Building your first brief…', 'Preparando tu primer resumen…') : L('No brief yet today.', 'Aún no hay resumen hoy.')) : L('Connect your tools to build your first Daily Brief.', 'Conecta tus herramientas para crear tu primer resumen diario.')}</p>
      ${S.app.hasSources ? `<button class="btn btn-p" data-act="refresh" ${S.run.running ? 'disabled' : ''}>${L('Generate brief now', 'Generar resumen ahora')}</button>` : `<a class="btn btn-p" href="#/welcome">${L('Connect accounts', 'Conectar cuentas')}</a>`}</section>`;
  }
  return `<section class="card brief" aria-labelledby="brief-h">
    <div class="row" style="justify-content:space-between"><span class="eyebrow c-info">${L('Morning brief', 'Resumen matutino')} · ${esc(fmtWhen(b.generatedAt))} · ${b.basis === 'ai' ? L('written by AI', 'escrito por IA') : L('built-in rules', 'reglas integradas')}</span><span class="row">${tag('FACT')}${tag('INFERENCE')}${tag('RECOMMENDATION')}</span></div>
    <h1 id="brief-h" class="h1" style="margin:12px 0 6px">${greet}${name ? ', ' + esc(name) : ''}. ${L('Here’s what matters today.', 'Esto es lo importante hoy.')}</h1>
    <p class="muted" style="margin:0 0 16px;font-size:15px">${esc(b.headline)}</p>
    ${b.chips.length ? `<div class="row" style="margin-bottom:20px">${b.chips.map((c) => pill(c.label, c.level)).join('')}</div>` : ''}
    <ul class="ul" style="display:flex;flex-direction:column;gap:12px">${b.items.map((i) => `<li class="brief-li"><span>${tag(i.tag)}</span><span><strong style="font-weight:600">${esc(i.lead)}</strong> <span class="muted">${esc(i.text)}</span>${i.sources?.length ? ` <button class="btn-g btn btn-sm" style="min-height:24px;padding:0 6px" data-act="sources" data-ids="${esc(i.sources.join(','))}">${i.sources.length} ${i.sources.length > 1 ? L('sources', 'fuentes') : L('source', 'fuente')}</button>` : ''}</span></li>`).join('')}</ul>
    ${b.aiError ? `<p class="small c-warn" style="margin:12px 0 0">${L('AI was unavailable', 'La IA no estuvo disponible')} (${esc(b.aiError)}), ${L('so this brief uses built-in rules.', 'así que este resumen usa reglas integradas.')}</p>` : ''}
    <div class="row" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--bd)">
      <button class="btn btn-g" style="padding-left:0" data-act="brief-why">${I.info} ${ui.briefWhy ? L('Hide sources', 'Ocultar fuentes') : L('Why am I seeing this?', '¿Por qué veo esto?')}</button><span class="grow"></span>
      <button class="btn" data-act="ask" data-q="${L('What should I focus on today?', '¿En qué debo enfocarme hoy?')}">${L('Ask a follow-up', 'Hacer una pregunta')}</button>
    </div>
    ${ui.briefWhy ? `<div class="why-box"><div class="eyebrow" style="margin-bottom:8px">${L('What this brief was built from', 'Con qué se armó este resumen')}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 24px" class="s13">${b.sourcesUsed.map((s) => `<span><span class="dot c-${s.status === 'ok' ? 'ok' : 'crit'}"></span> ${esc(s.label)} — ${s.status === 'ok' ? esc(s.records ?? 0) + L(' records', ' registros') : L('not synced since ', 'sin sincronizar desde ') + esc(fmtWhen(s.lastSuccess))}</span>`).join('') || `<span class="faint">${L('No sources', 'Sin fuentes')}</span>`}</div>
      <p class="small faint" style="margin:10px 0 0">${L('Priorities come from deadlines, who is waiting, your rules and today’s meetings. Every item links back to its original email, event, task or file.', 'Las prioridades salen de los plazos, quién espera, tus reglas y las reuniones de hoy. Cada punto enlaza a su correo, evento, tarea o archivo original.')}</p></div>` : ''}
  </section>`;
}

function prioritiesSection() {
  const ps = S.priorities;
  return `<section aria-labelledby="prio-h"><div class="sec-head"><h2 id="prio-h" class="h2">${L('Top priorities', 'Prioridades principales')}</h2><span class="small faint">${L('Ranked by deadline, dependencies and who is waiting — shown as levels, not scores.', 'Ordenadas por plazo, dependencias y quién espera — se muestran como niveles, no puntajes.')}</span></div>
  ${!ps.length ? `<div class="card empty">${L('Nothing urgent detected.', 'No se detectó nada urgente.')} ${S.app.hasSources ? L('Enjoy the space — or add a task with Capture.', 'Aprovecha el espacio — o agrega una tarea con Capturar.') : ''}</div>` : `<ol class="card ul divide" style="overflow:hidden">${ps.map(prioRow).join('')}</ol>`}</section>`;
}
function prioRow(p) {
  const lv = LV[p.level] || 'info'; const open = ui.why.has(p.id);
  const act = p.action || {};
  return `<li class="prio"><span class="rank mono l-${lv}">${p.rank}</span><div style="min-width:0">
    <div class="row" style="gap:8px 12px"><h3 class="h3">${esc(p.title)}</h3>${pill(p.levelLabel || LVL[p.level] || p.level, lv)}<span class="grow"></span><span class="mono small c-${lv}">${esc(p.dueLabel)}</span></div>
    <div class="row small faint" style="gap:4px 14px;margin-top:6px">${p.projectName ? `<span>${L('Project', 'Proyecto')} · <span class="muted">${esc(p.projectName)}</span></span>` : ''}${p.people?.filter(Boolean).length ? `<span>${L('People', 'Personas')} · <span class="muted">${esc(p.people.filter(Boolean).join(', '))}</span></span>` : ''}<span>${L('From', 'Origen')} · <span class="muted">${esc(p.from.split(' · ').map((k) => SRCK[k] || k).join(' · '))}</span></span></div>
    <div class="two"><div><div class="eyebrow" style="margin-bottom:4px">${L('Why it matters', 'Por qué importa')}</div>${p.why.map((w) => `<div style="margin-bottom:4px">${tag(w.tag)} ${esc(w.text)}</div>`).join('')}</div>
      <div><div class="eyebrow" style="margin-bottom:4px">${L('Suggested next step', 'Siguiente paso sugerido')}</div>${tag('RECOMMENDATION')} ${esc(p.next)}</div></div>
    <div class="row" style="margin-top:14px">
      ${act.type ? `<button class="btn btn-p" data-act="prio-action" data-type="${esc(act.type)}" data-task="${esc(act.taskId || '')}" data-msg="${esc(act.messageId || '')}" data-event="${esc(act.eventId || '')}" data-commit="${esc(act.commitmentId || '')}">${esc(act.label)}</button>` : ''}
      ${openLink(p.link)}
      ${p.kind === 'task' ? `<button class="btn" data-act="focus-start" data-task="${esc(p.refId)}">${I.focus} ${L('Focus on this', 'Enfocarme en esto')}</button>` : ''}
      <button class="btn btn-g" data-act="why" data-id="${esc(p.id)}">${open ? L('Hide sources', 'Ocultar fuentes') : L('Why am I seeing this?', '¿Por qué veo esto?')}</button>
    </div>
    ${open ? `<div class="why-box"><div class="eyebrow" style="margin-bottom:8px">${L('Sources', 'Fuentes')}</div><ul class="ul" style="display:flex;flex-direction:column;gap:6px">${p.sources.map((s) => `<li class="row s13" style="align-items:baseline"><span class="tag t-FACT">${esc(SRCK[s.kind] || s.kind)}</span><span>${esc(s.label)}</span><span class="mono faint small">${esc(s.when || '')}</span><span class="grow"></span>${realLink(s.link) ? `<a class="small" href="${esc(s.link)}" target="_blank" rel="noopener">${L('Open source', 'Abrir original')}</a>` : ''}</li>`).join('')}</ul>${p.nextBasis === 'ai' ? `<p class="small faint" style="margin:8px 0 0">${L('Next step suggested by AI from these sources.', 'Siguiente paso sugerido por IA a partir de estas fuentes.')}</p>` : ''}</div>` : ''}
  </div></li>`;
}

function timelineSection() {
  const t = S.timeline; const items = t.items || [];
  const h = (m) => `${Math.floor(m / 60)} h ${m % 60} min`;
  return `<section aria-labelledby="tl-h"><div class="sec-head"><h2 id="tl-h" class="h2">${L('Today’s timeline', 'Agenda de hoy')}</h2><span class="mono small faint">${h(t.meetingMinutes || 0)} ${L('in meetings', 'en reuniones')} · ${h(t.freeMinutes || 0)} ${L('free in working hours', 'libres en horario laboral')}</span></div>
  <div class="card" style="padding:8px 0">
    ${(t.issues || []).filter((i) => i.level === 'crit').map((i) => `<div class="issue crit"><div class="grow" style="flex-basis:300px"><div style="font-weight:600" class="c-crit">${esc(i.title)}</div><div class="s13">${esc(i.text)}</div></div><button class="btn btn-sm" data-act="ask" data-q="${esc(L('How should I resolve this conflict: ', '¿Cómo resuelvo este choque de horario?: ') + i.text)}">${L('Ask how to resolve', 'Preguntar cómo resolverlo')}</button></div>`).join('')}
    ${(t.issues || []).some((i) => i.level !== 'crit') ? `<div class="row" style="margin:4px 16px 8px">${t.issues.filter((i) => i.level !== 'crit').map((i) => `<span class="pill l-warn wrap" title="${esc(i.text)}">${esc(i.title)}</span>`).join('')}</div>` : ''}
    ${!items.length ? `<div class="empty">${L('Nothing on your calendar or due today.', 'Nada en tu agenda ni con plazo hoy.')}</div>` : `<ol class="ul">${items.map(tlRow).join('')}</ol>`}
  </div></section>`;
}
function tlRow(i) {
  const dot = i.kind === 'Deadline' ? 'var(--crit)' : i.kind === 'Suggested' ? 'var(--fa)' : i.kind === 'Promise' ? 'var(--warn)' : i.kind === 'Block' ? 'var(--ok)' : 'var(--pri)';
  const open = ui.prep === i.eventId && i.eventId;
  return `<li class="tl hover ${i.past ? 'past' : ''}"><span class="mono small muted" style="padding-top:2px">${i.time ? esc(fmtT(i.time)) : i.allDay ? L('All day', 'Todo el día') : L('Today', 'Hoy')}</span><span class="tl-dot" style="background:${dot}"></span><div style="min-width:0">
    <div class="row" style="gap:6px 10px"><span style="font-weight:500">${esc(i.title)}</span><span class="tag t-FACT">${esc(KIND[i.kind] || i.kind.toUpperCase())}</span>${(i.flags || []).map((f) => pill(f.label, f.level)).join('')}<span class="grow"></span>
    ${i.prep ? `<button class="btn btn-sm" style="border-color:var(--pri-b);color:var(--pri)" data-act="prep" data-event="${esc(i.eventId)}">${open ? L('Close brief', 'Cerrar resumen') : L('Prep me', 'Prepárame')}</button>` : ''}
    ${i.taskId && !i.past ? `<button class="btn btn-sm btn-g" data-act="task-done" data-task="${esc(i.taskId)}">${L('Mark done', 'Marcar hecha')}</button>` : ''}</div>
    <div class="small faint" style="margin-top:2px">${esc(i.meta)}</div>
    ${open ? prepBox(i.eventId) : ''}</div></li>`;
}
function prepBox(id) {
  const p = ui.preps[id];
  if (!p) return `<div class="prep row"><span class="spin"></span> ${L('Preparing your meeting brief…', 'Preparando el resumen de la reunión…')}</div>`;
  if (p.error) return `<div class="prep c-crit">${esc(p.error)}</div>`;
  const sec = (label, s, cls = '') => `<div><div class="eyebrow ${cls}" style="margin-bottom:4px">${label}</div>${tag(s.tag)} ${esc(s.text)}${s.sources?.length ? ` <button class="btn btn-g btn-sm" style="min-height:22px;padding:0 4px" data-act="sources" data-ids="${esc(s.sources.join(','))}">${L('sources', 'fuentes')}</button>` : ''}</div>`;
  return `<div class="prep"><div class="row" style="justify-content:space-between;margin-bottom:12px"><span class="eyebrow c-info">${L('Meeting brief', 'Resumen de reunión')} · ${esc(p.title)} · ${esc(p.when)}</span><span class="small faint">${p.basis === 'ai' ? L('AI · ', 'IA · ') : ''}${L('built', 'preparado')} ${esc(fmtT(p.generatedAt))} <button class="btn btn-g btn-sm" data-act="prep-refresh" data-event="${esc(id)}">${L('Rebuild', 'Rehacer')}</button></span></div>
    <div class="prep-grid">${sec(L('Purpose', 'Propósito'), p.sections.purpose)}<div><div class="eyebrow" style="margin-bottom:4px">${L('Participants', 'Participantes')}</div>${esc(p.people.join(', ') || L('Just you', 'Solo tú'))}</div>${sec(L('Unresolved from before', 'Pendiente de antes'), p.sections.unresolved)}${sec(L('You owe', 'Tú debes'), p.sections.youOwe, 'c-warn')}${sec(L('They owe', 'Te deben'), p.sections.theyOwe)}
    <div><div class="eyebrow" style="margin-bottom:4px">${L('Documents', 'Documentos')}</div>${p.documents.length ? p.documents.map((d) => `<div>${realLink(d.link) ? `<a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.name)}</a>` : esc(d.name)} <span class="faint small">· ${L('', 'hace ')}${esc(d.when)}${L(' ago', '')}</span></div>`).join('') : `<span class="faint">${L('None found', 'Ninguno')}</span>`}</div></div>
    ${p.messages.length ? `<div style="margin-top:12px"><div class="eyebrow" style="margin-bottom:4px">${L('Related email', 'Correos relacionados')}</div>${p.messages.map((m) => `<div class="s13">${realLink(m.link) ? `<a href="${esc(m.link)}" target="_blank" rel="noopener">${esc(m.subject)}</a>` : esc(m.subject)} <span class="faint">— ${esc(m.from)} · ${esc(m.when)}</span></div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bd)">${tag('RECOMMENDATION')}<span class="s13 grow" style="flex-basis:260px">${esc(p.sections.prep.text)}</span></div>
    ${p.aiError ? `<p class="small c-warn">${L('AI unavailable', 'IA no disponible')}: ${esc(p.aiError)}</p>` : ''}</div>`;
}

function attentionSection() {
  const ib = S.inbox; const c = S.commitments;
  const tabs = [['inbox', L('Inbox', 'Correo'), ib.needs_reply.length + ib.important.length], ['commit', L('Commitments', 'Compromisos'), c.iOwe.length + c.theyOwe.length], ['tasks', L('Tasks', 'Tareas'), S.tasks.length], ['risks', L('Risks', 'Riesgos'), S.risks.length]];
  return `<section aria-labelledby="att-h"><div class="sec-head"><h2 id="att-h" class="h2">${L('Needs your attention', 'Requiere tu atención')}</h2><span class="small faint">${L('Nothing is sent, moved or deleted in your accounts — this app has read-only access.', 'No se envía, mueve ni borra nada en tus cuentas — esta app solo puede leer.')}</span></div>
  <div class="card" style="overflow:hidden"><div class="tabs" role="tablist">${tabs.map(([id, l, n]) => `<button class="tab" role="tab" aria-selected="${ui.tab === id}" data-act="tab" data-tab="${id}">${l}<span class="count">${n}</span></button>`).join('')}</div>
  ${ui.tab === 'inbox' ? inboxTab() : ui.tab === 'commit' ? commitTab() : ui.tab === 'tasks' ? tasksTab() : risksTab()}</div></section>`;
}
const BOX = [['needs_reply', L('Needs reply', 'Por responder')], ['waiting_on', L('Waiting on', 'En espera')], ['important', L('Important', 'Importantes')], ['fyi', L('FYI', 'Informativos')], ['noise', L('Noise', 'Ruido')]];
function inboxTab() {
  const list = S.inbox[ui.box] || [];
  return `<div class="row" style="padding:12px 16px;border-bottom:1px solid var(--bd)">${BOX.map(([id, l]) => `<button class="chipbtn" aria-pressed="${ui.box === id}" data-act="box" data-box="${id}">${l} · <span class="mono">${S.inbox[id].length}</span></button>`).join('')}</div>
  ${!list.length ? `<div class="empty">${ui.box === 'needs_reply' ? L('No emails waiting on you.', 'No hay correos esperando tu respuesta.') : L('Nothing here.', 'Nada por aquí.')}</div>` : `<ul class="ul divide">${list.slice(0, 25).map(mailRow).join('')}</ul>`}
  <div class="small faint" style="padding:10px 16px;border-top:1px solid var(--bd)">${ui.box === 'noise' ? L('Noise is only hidden here — nothing is deleted.', 'El ruido solo se oculta aquí — no se borra nada.') : L('Hide and snooze only affect this dashboard, not Gmail.', 'Ocultar y posponer solo afectan este panel, no Gmail.')}</div>`;
}
function mailRow(m) {
  const lv = m.importance === 'high' ? 'warn' : m.importance === 'low' ? 'mute' : 'info';
  const who = m.isSent ? L('You → ', 'Tú → ') + (m.to[0]?.name || '') : m.from.name;
  return `<li class="mail hover"><span class="avatar">${initials(m.isSent ? m.to[0]?.name : m.from.name)}</span><div style="min-width:0">
    <div class="row" style="align-items:baseline;gap:4px 10px"><span style="font-weight:600">${esc(who)}</span><span class="muted">— ${esc(m.subject)}</span><span class="grow"></span><span class="mono small faint">${esc(m.age)}</span></div>
    <div class="s13 muted" style="margin-top:4px">${esc(m.summary)}</div>
    <div class="row" style="margin-top:8px;gap:6px">${pill(IMP[m.importance] || m.importance || 'normal', lv)}${m.project ? pill(m.project, 'mute') : ''}${m.action ? `<span class="small muted">${L('Action', 'Acción')}: <span style="color:var(--tx)">${esc(m.action)}</span></span>` : ''}${m.deadline ? `<span class="small c-warn">· ${esc(m.deadline)}</span>` : ''}${m.rule ? `<span class="small faint">· ${L('rule', 'regla')}: ${esc(m.rule)}</span>` : ''}${m.basis === 'ai' ? `<span class="small faint">· ${L('AI', 'IA')}</span>` : ''}</div>
    <div class="row" style="margin-top:10px;gap:6px">
      ${m.category !== 'noise' && m.category !== 'fyi' ? `<button class="btn btn-p btn-sm" data-act="draft" data-msg="${esc(m.id)}">${m.isSent ? L('Draft nudge', 'Redactar recordatorio') : L('Draft reply', 'Redactar respuesta')}</button>` : ''}
      <button class="btn btn-sm" data-act="thread" data-msg="${esc(m.id)}">${L('Read thread', 'Leer conversación')}</button>
      <button class="btn btn-sm" data-act="msg-task" data-msg="${esc(m.id)}" data-title="${esc((m.isSent ? L('Follow up: ', 'Seguimiento: ') : L('Reply: ', 'Responder: ')) + m.subject)}">${L('Turn into task', 'Convertir en tarea')}</button>
      ${openLink(m.link, L('Open in Gmail', 'Abrir en Gmail'))}
      <button class="btn btn-g btn-sm" data-act="snooze" data-msg="${esc(m.id)}">${L('Snooze 1 day', 'Posponer 1 día')}</button>
      <button class="btn btn-g btn-sm" data-act="hide" data-msg="${esc(m.id)}">${L('Hide', 'Ocultar')}</button>
      ${m.category !== 'noise' ? `<button class="btn btn-g btn-sm" data-act="recat" data-msg="${esc(m.id)}" data-cat="noise">${L('Not important', 'No es importante')}</button>` : `<button class="btn btn-g btn-sm" data-act="recat" data-msg="${esc(m.id)}" data-cat="important">${L('Actually important', 'Sí es importante')}</button>`}
    </div></div></li>`;
}
function commitCard(c) {
  return `<li class="box"><div class="row"><span style="font-weight:600">${esc(c.what)}</span><span class="grow"></span>${pill(c.state.label, c.state.level)}</div>
    <div class="s13 muted" style="margin-top:4px">${c.direction === 'i_owe' ? L('To', 'Para') : L('From', 'De')} ${esc(c.person?.name || '—')}${c.project ? ' · ' + esc(c.project) : ''}${c.promised ? L(' · promised ', ' · prometido para ') + esc(c.promised) : ''}</div>
    <div class="s13" style="margin-top:6px;font-style:italic" title="${L('Exact words from the source', 'Palabras exactas del original')}">“${esc(c.quote)}”</div>
    <div class="row small faint" style="margin-top:6px">${tag(c.confidence === 'clear' ? 'FACT' : 'INFERENCE')}<span>${c.confidence === 'clear' ? L('Clear commitment', 'Compromiso claro') : L('Possible commitment detected', 'Posible compromiso detectado')} · ${esc(c.source?.type || L('Added by you', 'Agregado por ti'))} · ${esc(c.detected)}${c.basis === 'ai' ? L(' · AI', ' · IA') : ''}</span></div>
    <div class="row" style="margin-top:8px;gap:6px">
      <button class="btn btn-sm" data-act="commit" data-id="${esc(c.id)}" data-status="done">${c.direction === 'i_owe' ? L('Delivered', 'Entregado') : L('Received', 'Recibido')}</button>
      ${c.direction === 'they_owe' && c.source ? `<button class="btn btn-sm" data-act="nudge" data-id="${esc(c.id)}">${L('Draft nudge', 'Redactar recordatorio')}</button>` : ''}
      ${c.direction === 'i_owe' ? `<button class="btn btn-sm" data-act="commit-task" data-id="${esc(c.id)}" data-title="${esc(c.what + ' → ' + (c.person?.name || ''))}">${L('Turn into task', 'Convertir en tarea')}</button>` : ''}
      ${openLink(c.link, L('Source', 'Original'))}
      <button class="btn btn-g btn-sm" data-act="commit" data-id="${esc(c.id)}" data-status="dismissed">${L('Not a commitment', 'No es un compromiso')}</button>
    </div></li>`;
}
function commitTab() {
  const c = S.commitments;
  const col = (title, cls, list, empty) => `<div style="padding:16px"><div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="eyebrow ${cls}">${title}</span><span class="mono small faint">${list.length} ${L('open', 'abiertos')}</span></div>${list.length ? `<ul class="ul" style="display:flex;flex-direction:column;gap:10px">${list.map(commitCard).join('')}</ul>` : `<div class="empty">${empty}</div>`}</div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${col(L('I owe', 'Yo debo'), 'c-warn', c.iOwe, L('No promises detected in your sent email.', 'No se detectaron promesas en tus correos enviados.'))}${col(L('They owe', 'Me deben'), 'c-info', c.theyOwe, L('Nobody owes you anything right now.', 'Nadie te debe nada por ahora.'))}</div>
  <div class="row small faint" style="padding:10px 16px;border-top:1px solid var(--bd)">${L('Detected from email', 'Detectados en el correo')}${S.app.ai ? L(' by AI, checked against the exact wording', ' por IA, verificados con las palabras exactas') : L(' with built-in rules', ' con reglas integradas')}. <button class="btn btn-g btn-sm" data-act="add-commit">${L('Add one manually', 'Agregar uno a mano')}</button></div>`;
}
function tasksTab() {
  const t = S.tasks;
  if (!t.length) return `<div class="empty">${L('No open tasks. Use Capture to add one, or connect Google Tasks.', 'No hay tareas abiertas. Usa Capturar para agregar una, o conecta Google Tasks.')}</div>`;
  return `<div class="tbl-wrap"><table class="tbl" style="min-width:680px"><thead><tr><th class="eyebrow">${L('Task', 'Tarea')}</th><th class="eyebrow">${L('Project', 'Proyecto')}</th><th class="eyebrow">${L('Source', 'Origen')}</th><th class="eyebrow">${L('Due', 'Vence')}</th><th class="eyebrow"></th></tr></thead><tbody>
  ${t.map((k) => `<tr class="hover"><td>${k.editable ? `<label class="row" style="flex-wrap:nowrap;cursor:pointer"><input type="checkbox" data-act="task-done" data-task="${esc(k.id)}" style="width:16px;height:16px;accent-color:var(--pri)"><span>${esc(k.title)}</span></label>` : esc(k.title)}${k.status === 'blocked' ? `<div class="small c-crit">${L('Blocked', 'Bloqueada')}${k.blockedBy ? ': ' + esc(k.blockedBy) : ''}</div>` : ''}${k.postponed >= 2 ? `<div class="small c-warn">${L('Postponed', 'Pospuesta')} ${k.postponed}×</div>` : ''}</td>
    <td class="muted">${esc(k.project || '—')}</td><td><span class="tag t-FACT">${esc(({ native: L('YOURS', 'TUYA'), gtasks: 'GOOGLE TASKS', demo: 'DEMO' })[k.source] || k.source)}</span>${k.alsoIn.length ? ` <span class="small faint">+ ${esc(k.alsoIn.join(', '))}</span>` : ''}</td>
    <td class="mono small ${k.overdue ? 'c-crit' : ''}">${esc(k.due || '—')}</td>
    <td style="text-align:right;white-space:nowrap">${k.editable ? `<button class="btn btn-g btn-sm" data-act="task-tomorrow" data-task="${esc(k.id)}">${L('Move to tomorrow', 'Pasar a mañana')}</button>` : openLink(k.link)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function risksTab() {
  if (!S.risks.length) return `<div class="empty">${L('No risks detected.', 'No se detectaron riesgos.')}</div>`;
  return `<ul class="ul divide">${S.risks.map((r) => `<li style="padding:16px"><div class="row">${pill(r.label, r.level)}<span style="font-weight:600">${esc(r.title)}</span>${tag(r.tag)}</div><div class="s13 muted" style="margin-top:6px">${esc(r.text)}</div>${r.evidence ? `<div class="mono small faint" style="margin-top:6px">${L('Evidence', 'Evidencia')}: ${esc(r.evidence)}</div>` : ''}</li>`).join('')}</ul>`;
}

function pulseSection() {
  const ps = S.pulse;
  return `<section aria-labelledby="pp-h"><div class="sec-head"><h2 id="pp-h" class="h2">${L('Project pulse', 'Pulso de proyectos')}</h2><span class="small faint">${L('A status only changes with evidence — hover it to see why.', 'Un estado solo cambia con evidencia — pasa el cursor para ver por qué.')} <a href="#/settings" data-scroll="projects">${L('Manage projects', 'Gestionar proyectos')}</a></span></div>
  ${!ps.length ? `<div class="card empty">${L('No projects yet. Projects connect related email, meetings, tasks and files.', 'Aún no hay proyectos. Los proyectos unen correos, reuniones, tareas y archivos relacionados.')} <a href="#/settings">${L('Add your first project', 'Agrega tu primer proyecto')}</a> ${L('with a few keywords.', 'con algunas palabras clave.')}</div>` :
  `<div class="card tbl-wrap"><table class="tbl" style="min-width:860px"><thead><tr><th class="eyebrow">${L('Project', 'Proyecto')}</th><th class="eyebrow">${L('Pulse', 'Estado')}</th><th class="eyebrow">${L('Next milestone', 'Próximo hito')}</th><th class="eyebrow" style="width:120px">${L('Progress', 'Avance')}</th><th class="eyebrow">${L('Blocker / latest', 'Bloqueo / último')}</th><th class="eyebrow">${L('Next action', 'Siguiente acción')}</th></tr></thead><tbody>
  ${ps.map((p) => `<tr class="hover"><td><div style="font-weight:600">${esc(p.name)}${p.important ? ` <span class="c-warn" title="${L('Important project', 'Proyecto importante')}">★</span>` : ''}</div><div class="small faint">${L('Owner', 'Responsable')} · ${esc(p.owner)}</div></td>
    <td><span class="pill l-${p.level}" title="${esc(p.evidence)}"><span class="dot"></span>${esc(p.statusLabel)}</span><div class="small faint" style="margin-top:4px;max-width:220px">${esc(p.evidence)}</div></td>
    <td>${p.milestone ? `<div>${esc(p.milestone.label)}</div><div class="mono small faint">${esc(p.milestone.when)}</div>` : '<span class="faint">—</span>'}</td>
    <td>${p.progress ? `<div class="bar"><div style="width:${p.progress.pct}%;background:var(--${p.level === 'mute' ? 'fa' : p.level === 'info' ? 'pri' : p.level})"></div></div><div class="mono small faint" style="margin-top:4px">${p.progress.done} ${L('of', 'de')} ${p.progress.total} ${L('tasks', 'tareas')}</div>` : `<span class="faint small">${L('no tasks', 'sin tareas')}</span>`}</td>
    <td class="muted">${esc(p.blocker || p.activity?.text || '—')}${!p.blocker && p.activity ? ` <span class="faint small">· ${esc(p.activity.when)}</span>` : ''}</td><td>${esc(p.next)}</td></tr>`).join('')}
  </tbody></table></div>`}</section>`;
}
function changesSection() {
  const sym = { crit: 'var(--crit)', warn: 'var(--warn)', info: 'var(--pri)', ok: 'var(--ok)', mute: 'var(--mu)' };
  return `<section class="card pad" aria-labelledby="sy-h"><div class="sec-head"><h2 id="sy-h" class="h2">${L('Since yesterday', 'Desde ayer')}</h2><span class="mono small faint">${L('vs. last daily snapshot', 'vs. la última foto del día')}</span></div>
  ${S.changes.length ? `<ul class="ul" style="display:flex;flex-direction:column;gap:10px">${S.changes.map((c) => `<li style="display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px" class="s13"><span class="mono" style="color:${sym[c.level]};font-weight:600">${esc(c.sym)}</span><span>${esc(c.text)} <span class="faint">${esc(c.ctx)}</span></span></li>`).join('')}</ul>` : `<div class="empty">${L('No meaningful changes.', 'Sin cambios importantes.')}</div>`}</section>`;
}
function upcomingSection() {
  return `<section class="card pad" aria-labelledby="up-h"><div class="sec-head"><h2 id="up-h" class="h2">${L('Upcoming', 'Próximos días')}</h2><span class="mono small faint">${L('next 10 days', 'próximos 10 días')}</span></div>
  ${S.upcoming.length ? `<ul class="ul">${S.upcoming.map((u) => `<li style="display:grid;grid-template-columns:72px minmax(0,1fr);gap:12px;padding:9px 0;border-top:1px solid var(--bd)" class="s13"><span class="mono small muted">${esc(u.date)}</span><span><span style="font-weight:500">${esc(u.title)}</span> <span class="${u.deadline ? 'c-warn' : 'faint'}">· ${esc(u.ctx)}</span></span></li>`).join('')}</ul>` : `<div class="empty">${L('Nothing notable scheduled.', 'Nada destacado en la agenda.')}</div>`}</section>`;
}

// ---------- Chief of Staff ----------
const ASKS = L(['What should I focus on today?', 'What am I forgetting?', 'Who am I waiting on?', 'What commitments did I make this week?', 'What deadlines are coming?', 'Which emails actually need replies?', 'Prepare me for my next meeting.', 'Give me my week in 60 seconds.'], ['¿En qué debo enfocarme hoy?', '¿Qué se me está olvidando?', '¿A quién estoy esperando?', '¿Qué compromisos hice esta semana?', '¿Qué plazos se vienen?', '¿Qué correos de verdad necesitan respuesta?', 'Prepárame para mi próxima reunión.', 'Dame mi semana en 60 segundos.']);
function chiefSection() {
  return `<section class="card" aria-labelledby="cos-h" style="padding:18px;display:flex;flex-direction:column;gap:14px">
    <div class="row" style="flex-wrap:nowrap"><span style="width:32px;height:32px;border-radius:8px;background:var(--pri-t);display:inline-flex;align-items:center;justify-content:center">${I.spark}</span><div class="grow"><h2 id="cos-h" class="h2" style="font-size:16px">${L('Chief of Staff', 'Jefe de Gabinete')}</h2><div class="small faint">${S.app.ai ? L('Reasons across email, calendar, tasks and files', 'Razona con tu correo, agenda, tareas y archivos') : L('Rules mode — add an AI key for free-form questions', 'Modo reglas — agrega una clave de IA para preguntas libres')}</div></div>${S.chat.length ? `<button class="btn btn-g btn-sm" data-act="chat-clear">${L('Clear', 'Borrar')}</button>` : ''}</div>
    <div class="row" style="gap:6px">${ASKS.slice(0, S.chat.length ? 4 : 8).map((q) => `<button class="chipbtn" data-act="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    ${S.chat.length || ui.chatBusy ? `<div class="chatlog">${S.chat.map(chatEntry).join('')}${ui.chatBusy ? `<div class="bubble-q">${esc(ui.chatBusy)}</div><div class="row faint small"><span class="spin"></span> ${L('Thinking across your sources…', 'Pensando con tus fuentes…')}</div>` : ''}</div>` : ''}
    <label class="composer"><span class="sr">${L('Ask your Chief of Staff', 'Pregunta a tu Jefe de Gabinete')}</span><textarea id="chat-in" rows="2" placeholder="${L('Ask, plan, or find… e.g. “Show everything related to Apex”', 'Pregunta, planifica o busca… ej. “Muéstrame todo lo de Apex”')}" data-enter="chat">${esc(ui.chatDraft)}</textarea><button class="btn btn-p" data-act="chat-send" aria-label="${L('Send', 'Enviar')}" style="width:36px;padding:0">${I.send}</button></label>
    <div class="small faint">${L('Drafts and suggestions only. Anything that changes your data asks you first.', 'Solo borradores y sugerencias. Todo lo que cambie tus datos te pregunta primero.')}</div></section>`;
}
function chatEntry(c) {
  return `<div class="bubble-q">${esc(c.q)}</div><div style="display:flex;flex-direction:column;gap:8px">${c.answer.map((a) => `<div class="box s13"><div class="row" style="margin-bottom:4px">${tag(a.tag)}${a.sources.length ? `<button class="btn btn-g btn-sm" style="min-height:22px;padding:0 4px" data-act="sources" data-ids="${esc(a.sources.join(','))}">${a.sources.map((id) => esc(c.sourcesInfo?.[id]?.type || L('source', 'fuente'))).filter((v, i, arr) => arr.indexOf(v) === i).join(' · ')}</button>` : ''}</div>${esc(a.text)}</div>`).join('')}
  ${c.note ? `<div class="small faint">${esc(c.note)}</div>` : ''}
  ${c.actions?.length ? `<div class="row" style="gap:6px">${c.actions.map((a, i) => `<button class="btn btn-sm" data-act="chat-action" data-chat="${esc(c.id)}" data-i="${i}">${esc(a.label)}…</button>`).join('')}</div>` : ''}</div>`;
}
function waitingSection() {
  const theirs = S.commitments.theyOwe; const threads = S.inbox.waiting_on;
  const n = theirs.length + threads.length;
  return `<section class="card" style="padding:18px" aria-labelledby="wo-h"><div class="sec-head" style="margin-bottom:6px"><h2 id="wo-h" class="h2" style="font-size:16px">${L('Waiting on', 'En espera')}</h2><span class="mono small faint">${n}</span></div>
  ${!n ? `<div class="empty">${L('Nobody owes you anything right now.', 'Nadie te debe nada por ahora.')}</div>` : `<ul class="ul">${theirs.map((c) => `<li class="row" style="padding:10px 0;border-top:1px solid var(--bd);flex-wrap:nowrap;align-items:flex-start"><span class="dot c-${c.state.level}" style="margin-top:6px"></span><div class="grow"><div class="s13"><b>${esc(c.person?.name)}</b> <span class="muted">· ${esc(c.what)}</span></div><div class="mono small c-${c.state.level}">${esc(c.state.label)}</div></div>${c.source ? `<button class="btn btn-g btn-sm" data-act="nudge" data-id="${esc(c.id)}">${L('Nudge', 'Recordar')}</button>` : ''}</li>`).join('')}
  ${threads.map((m) => `<li class="row" style="padding:10px 0;border-top:1px solid var(--bd);flex-wrap:nowrap;align-items:flex-start"><span class="dot c-info" style="margin-top:6px"></span><div class="grow"><div class="s13"><b>${esc(m.to[0]?.name || '')}</b> <span class="muted">· ${L('reply to', 'respuesta a')} “${esc(m.subject)}”</span></div><div class="mono small faint">${L('no reply', 'sin respuesta')} · ${esc(m.age)}</div></div><button class="btn btn-g btn-sm" data-act="draft" data-msg="${esc(m.id)}">${L('Nudge', 'Recordar')}</button></li>`).join('')}</ul>`}</section>`;
}
function sourcesSection() {
  return `<section class="card" style="padding:18px" aria-labelledby="ih-h"><div class="sec-head" style="margin-bottom:6px"><h2 id="ih-h" class="h2" style="font-size:16px">${L('Sources', 'Fuentes')}</h2><a class="small" href="#/settings">${L('Manage', 'Gestionar')}</a></div>
  ${S.sources.length ? `<ul class="ul">${S.sources.map((s) => `<li class="row s13" style="padding:8px 0;border-top:1px solid var(--bd);flex-wrap:nowrap"><span class="dot c-${s.status === 'ok' ? 'ok' : s.status === 'reconnect' ? 'warn' : 'crit'}"></span><span class="grow">${esc(s.label)}</span><span class="mono small ${s.status === 'ok' ? 'faint' : 'c-crit'}">${s.status === 'ok' ? esc(fmtT(s.lastSuccess)) : s.status === 'reconnect' ? L('Reconnect', 'Reconectar') : L('Failed · last ok ', 'Falló · último ok ') + esc(s.lastSuccess ? fmtWhen(s.lastSuccess) : L('never', 'nunca'))}</span></li>`).join('')}</ul>` : `<div class="empty">${L('No sources connected.', 'No hay fuentes conectadas.')}</div>`}
  <div class="mono small faint" style="margin-top:10px">${S.run.nextMorning ? L('Next brief · ', 'Próximo resumen · ') + esc(fmtWhen(S.run.nextMorning)) : L('Morning brief is off', 'Resumen matutino apagado')} · ${L('live updates every', 'actualiza cada')} ${esc(S.app.settings.liveMinutes)} min</div></section>`;
}

// ---------- search & capture ----------
function searchResults() {
  const r = ui.searchRes;
  return `<div class="search-results" role="listbox"><button class="row hover" style="width:100%;padding:12px 14px;border:0;background:transparent;cursor:pointer;text-align:left;color:var(--tx)" data-act="ask" data-q="${esc(ui.searchQ)}">${I.spark}<span>${L('Ask Chief of Staff', 'Preguntar al Jefe de Gabinete')}: <b>${esc(ui.searchQ)}</b></span></button>
  ${r.loading ? `<div class="empty">${L('Searching…', 'Buscando…')}</div>` : !r.items.length ? `<div class="empty">${L('No matches in your synced data.', 'Sin resultados en tus datos sincronizados.')}</div>` : `<ul class="ul divide">${r.items.map((x) => `<li class="row hover" style="padding:10px 14px;flex-wrap:nowrap"><span class="tag t-FACT" style="min-width:80px;justify-content:center">${esc((x.typeLabel || x.type).toUpperCase())}</span><span class="grow"><span style="font-weight:500">${esc(x.title)}</span><span class="small faint"> · ${esc(x.sub)}</span></span><span class="mono small faint">${esc(x.when)}</span>${realLink(x.link) ? `<a class="btn btn-sm btn-g" href="${esc(x.link)}" target="_blank" rel="noopener">${L('Open', 'Abrir')} ${I.ext}</a>` : ''}</li>`).join('')}</ul>`}
  <div class="row" style="justify-content:flex-end;padding:6px 10px;border-top:1px solid var(--bd)"><button class="btn btn-g btn-sm" data-act="search-close">${L('Close', 'Cerrar')}</button></div></div>`;
}
function captureBox() {
  const c = ui.capture; const p = c.parsed;
  return `<div class="wrap" style="padding-bottom:16px"><div class="card" style="padding:16px;border-color:var(--pri-b);background:var(--s2);display:flex;flex-wrap:wrap;gap:16px">
    <div style="flex:1 1 360px;min-width:0;display:flex;flex-direction:column;gap:8px"><label class="eyebrow" for="cap-in">${L('Quick capture — task, reminder, note, follow-up', 'Captura rápida — tarea, recordatorio, nota, seguimiento')}</label>
      <div class="row" style="flex-wrap:nowrap"><input id="cap-in" class="input grow" type="text" value="${esc(c.text)}" placeholder="${L('e.g. Remind me to ask Carlos about the contract Friday morning', 'ej. Recuérdame preguntarle a Carlos por el contrato el viernes por la mañana')}" data-enter="capture-parse"><button class="btn" data-act="capture-parse">${c.busy ? '<span class="spin"></span>' : L('Understand', 'Entender')}</button></div>
      <div class="small faint">${L('Nothing is created until you confirm.', 'No se crea nada hasta que confirmes.')}</div></div>
    ${p ? `<div style="flex:1 1 360px;min-width:0"><div class="eyebrow" style="margin-bottom:8px">${L('Parsed as', 'Entendido como')} ${p.basis === 'ai' ? L('(AI)', '(IA)') : L('(rules)', '(reglas)')} — ${L('edit anything', 'puedes editar todo')}</div>
      <div style="display:grid;grid-template-columns:80px minmax(0,1fr);gap:8px 12px;align-items:center" class="s13">
        <label class="faint" for="cap-type">${L('Type', 'Tipo')}</label><select id="cap-type" class="input">${['task', 'reminder', 'follow_up', 'note', 'event'].map((t) => `<option value="${t}" ${p.type === t ? 'selected' : ''}>${CAPT[t]}</option>`).join('')}</select>
        <label class="faint" for="cap-title">${L('Title', 'Título')}</label><input id="cap-title" class="input" value="${esc(p.title)}">
        <span class="faint">${L('When', 'Cuándo')}</span><span class="row" style="flex-wrap:nowrap"><input id="cap-date" class="input" type="date" value="${esc(p.date || '')}" aria-label="${L('Date', 'Fecha')}"><input id="cap-time" class="input" type="time" value="${esc(p.time || '')}" aria-label="${L('Time', 'Hora')}"></span>
        <span class="faint">${L('Person', 'Persona')}</span><span>${esc(p.person || '—')}${p.person ? ` ${tag('INFERENCE')}` : ''}</span>
        ${p.assumptions?.length ? `<span class="faint">${L('Assumed', 'Supuesto')}</span><span class="small c-warn">${p.assumptions.map(esc).join(' · ')}</span>` : ''}
      </div>${p.type === 'event' ? `<p class="small c-warn" style="margin:8px 0 0">${L('Calendar access is read-only, so this is saved as a task to schedule.', 'El calendario es de solo lectura, así que se guarda como tarea por agendar.')}</p>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn btn-p" data-act="capture-create">${L('Create', 'Crear')} ${esc(CAPT[p.type] || p.type)}</button><button class="btn btn-g" data-act="capture-close">${L('Cancel', 'Cancelar')}</button></div></div>` : `<div class="row" style="align-self:flex-start"><button class="btn btn-g" data-act="capture-close">${L('Close', 'Cerrar')}</button></div>`}
  </div></div>`;
}

// ---------- FOCUS ----------
function focusPage() {
  const f = S.focus;
  if (!f) {
    const cand = S.priorities.filter((p) => p.kind === 'task');
    const others = S.tasks.filter((t) => !cand.some((c) => c.refId === t.id)).slice(0, 8);
    return `<main class="wrap" style="max-width:860px;padding-top:40px;padding-bottom:56px"><span class="eyebrow c-info">${L('Focus mode', 'Modo enfoque')}</span><h1 class="h1" style="margin:10px 0 8px">${L('What do you want to focus on?', '¿En qué quieres enfocarte?')}</h1><p class="muted" style="margin:0 0 24px">${L('Focus shows only the current priority, the time you have, and the documents and messages that matter. Everything else waits.', 'El modo enfoque muestra solo la prioridad actual, el tiempo que tienes y los documentos y mensajes que importan. Todo lo demás espera.')}</p>
    <div class="card" style="overflow:hidden">${[...cand.map((p) => ({ id: p.refId, title: p.title, sub: p.dueLabel, level: p.level })), ...others.map((t) => ({ id: t.id, title: t.title, sub: t.due ? L('Due ', 'Vence ') + t.due : L('No date', 'Sin fecha'), level: '' }))].map((t) => `<button class="row hover" style="width:100%;padding:14px 18px;border:0;border-top:1px solid var(--bd);background:transparent;cursor:pointer;text-align:left;color:var(--tx);min-height:52px" data-act="focus-start" data-task="${esc(t.id)}"><span class="grow" style="font-weight:500">${esc(t.title)}</span>${t.level ? pill(LVL[t.level] || t.level, LV[t.level]) : ''}<span class="mono small faint">${esc(t.sub)}</span></button>`).join('') || `<div class="empty">${L('No open tasks yet.', 'Aún no hay tareas abiertas.')}</div>`}</div>
    <div class="row" style="margin-top:16px;flex-wrap:nowrap"><input id="focus-title" class="input grow" placeholder="${L('…or type something else to focus on', '…o escribe otra cosa en qué enfocarte')}" data-enter="focus-new"><button class="btn btn-p" data-act="focus-new">${L('Start focus', 'Empezar')}</button></div></main>`;
  }
  const steps = f.steps || []; const done = steps.filter((s) => s.done).length;
  const mins = f.minutesAvailable;
  return `<div class="strip"><div class="wrap strip-in" style="max-width:1040px">${pill(L('Focus on', 'Enfoque activo'), 'ok')}<span class="muted">${L('Since', 'Desde')} ${esc(fmtT(f.startedAt))} · ${f.held.length} ${f.held.length === 1 ? L('update held', 'novedad en espera') : L('updates held', 'novedades en espera')} · ${L('high-importance items still break through', 'lo muy importante igual te llega')}</span><span class="grow"></span>${S.app.demo ? pill(L('Demo data', 'Datos de demo'), 'warn') : ''}<button class="btn" data-act="focus-stop">${L('Exit focus', 'Salir del enfoque')}</button></div></div>
  <main class="wrap" style="max-width:1040px;padding-top:36px;padding-bottom:56px;display:flex;flex-direction:column;gap:24px">
    ${f.breakthrough.length ? `<div class="issue crit" style="margin:0"><b class="c-crit">${L('Breaking through:', 'Llegó algo importante:')}</b>${f.breakthrough.map((b) => `<span class="s13">${esc(b.text)} · ${esc(b.when)}</span>`).join('')}</div>` : ''}
    <section><div class="eyebrow c-info">${L('Current priority', 'Prioridad actual')}</div><h1 style="margin:10px 0 8px;font-size:38px;line-height:44px;font-weight:600;letter-spacing:-.03em">${esc(f.task?.title || L('Focus', 'Enfoque'))}</h1><div class="row muted s13">${f.task?.due ? `<span class="mono">${L('Due', 'Vence')} ${esc(f.task.due)}</span>` : ''}${f.task?.project ? `<span>· ${esc(f.task.project)}</span>` : ''}${openLink(f.task?.link)}</div></section>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
      <div class="card pad" style="background-image:var(--glow);border-color:var(--pri-b)"><div class="eyebrow">${L('Time available', 'Tiempo disponible')}</div><div class="mono" style="font-size:34px;line-height:42px;margin-top:6px">${mins == null ? '—' : mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min'}</div><div class="s13 muted">${f.untilLabel ? L('until ', 'hasta las ') + esc(f.untilLabel) : L('No deadline or meeting ahead', 'Sin plazos ni reuniones por delante')}</div></div>
      <div class="card pad"><div class="eyebrow">${L('Next meeting', 'Próxima reunión')}</div>${f.nextMeeting ? `<div style="font-size:17px;font-weight:600;margin-top:8px">${esc(f.nextMeeting.title)}</div><div class="mono s13 muted">${esc(f.nextMeeting.when)} · ${f.nextMeeting.people} ${f.nextMeeting.people === 1 ? L('other', 'persona más') : L('others', 'personas más')}</div>` : `<div class="muted" style="margin-top:8px">${L('None scheduled', 'Ninguna programada')}</div>`}</div>
      <div class="card pad"><div class="eyebrow">${L('Progress', 'Avance')}</div><div class="mono" style="font-size:34px;line-height:42px;margin-top:6px">${done}<span style="font-size:16px" class="faint"> / ${steps.length} ${L('steps', 'pasos')}</span></div><div class="bar" style="margin-top:8px"><div style="width:${steps.length ? (done / steps.length) * 100 : 0}%;background:var(--pri)"></div></div></div>
    </div>
    <section class="card" style="padding:22px"><div class="sec-head"><h2 class="h2">${L('Steps', 'Pasos')}</h2><span class="small faint">${L('Break it down — saved with the task', 'Divídela en pasos — se guardan con la tarea')}</span></div>
      <ol class="ul">${steps.map((s, i) => `<li><label class="row hover" style="padding:10px 12px;border-radius:6px;cursor:pointer;min-height:44px;flex-wrap:nowrap"><input type="checkbox" ${s.done ? 'checked' : ''} data-act="step-toggle" data-i="${i}" style="width:18px;height:18px;accent-color:var(--pri)"><span class="grow" style="font-size:15px;${s.done ? 'text-decoration:line-through;color:var(--fa)' : ''}">${esc(s.text)}</span><button class="btn btn-g btn-sm" data-act="step-del" data-i="${i}" aria-label="${L('Remove step', 'Quitar paso')}">×</button></label></li>`).join('')}</ol>
      <div class="row" style="margin-top:10px;flex-wrap:nowrap"><input id="step-in" class="input grow" placeholder="${L('Add a step…', 'Agregar un paso…')}" data-enter="step-add"><button class="btn" data-act="step-add">${L('Add', 'Agregar')}</button></div>
      ${steps.length && done < steps.length ? `<div class="row" style="margin-top:16px;padding:14px 16px;border-radius:6px;background:var(--pri-t)">${tag('RECOMMENDATION')}<span class="grow">${L('Next', 'Siguiente')}: ${esc(steps.find((s) => !s.done).text)}</span></div>` : ''}
    </section>
    <div class="grid2"><section class="card pad"><h2 class="eyebrow" style="margin:0 0 10px">${L('Relevant documents', 'Documentos relevantes')}</h2>${f.documents.length ? `<ul class="ul">${f.documents.map((d) => `<li class="row" style="padding:10px 0;border-top:1px solid var(--bd);flex-wrap:nowrap"><span class="grow">${esc(d.name)}<br><span class="small faint">${esc(d.meta)}</span></span>${openLink(d.link)}</li>`).join('')}</ul>` : `<div class="empty">${L('None linked to this project.', 'Nada vinculado a este proyecto.')}</div>`}</section>
      <section class="card pad"><h2 class="eyebrow" style="margin:0 0 10px">${L('Related messages', 'Mensajes relacionados')}</h2>${f.messages.length ? `<ul class="ul">${f.messages.map((m) => `<li style="padding:10px 0;border-top:1px solid var(--bd)"><b>${esc(m.from)}</b> <span class="mono small faint">· ${esc(m.when)}</span><div class="s13 muted">${esc(m.text)}</div></li>`).join('')}</ul>` : `<div class="empty">${L('None linked to this project.', 'Nada vinculado a este proyecto.')}</div>`}</section></div>
    <div class="row">${f.task ? `<button class="btn btn-p" data-act="focus-done">${L('Done — mark complete', 'Listo — marcar hecha')}</button>` : ''}<button class="btn" data-act="focus-stop">${L('Exit focus', 'Salir del enfoque')}</button><a class="btn btn-g" href="#/today">${L('Back to Today', 'Volver a Hoy')}</a></div>
    <section class="card pad"><div class="row"><span class="dot c-mute"></span><b class="grow">${L('Held until you exit', 'En espera hasta que salgas')} — ${f.held.length} ${f.held.length === 1 ? L('update', 'novedad') : L('updates', 'novedades')}</b></div>${f.held.length ? `<ul class="ul" style="margin-top:8px">${f.held.slice(0, 8).map((h) => `<li class="row s13" style="padding:8px 0;border-top:1px solid var(--bd)"><span class="grow">${esc(h.text)}</span><span class="mono small faint">${esc(h.when)}</span></li>`).join('')}</ul>` : ''}</section>
  </main>`;
}

// ---------- WEEKLY ----------
async function loadWeekly() { ui.weeklyBusy = true; try { ui.weekly = await api('/api/weekly'); } catch (e) { toast(e.message, true); } ui.weeklyBusy = false; if (route() === 'weekly') render(); }
function weeklyPage() {
  const w = ui.weekly;
  if (!w) { if (!ui.weeklyBusy) loadWeekly(); return `<div class="empty" style="padding:60px">${L('Loading your week…', 'Cargando tu semana…')}</div>`; }
  const stat = (l, v, cls = '') => `<div style="padding:14px;border-radius:6px;background:var(--s2)"><div class="eyebrow">${l}</div><div class="mono ${cls}" style="font-size:26px;margin-top:4px">${v}</div></div>`;
  const li = (html) => `<li style="padding:10px 0;border-top:1px solid var(--bd)" class="s13">${html}</li>`;
  return `<main class="wrap" style="max-width:1240px;padding-top:28px;padding-bottom:56px;display:flex;flex-direction:column;gap:24px">
    <section class="card brief"><div class="row" style="justify-content:space-between"><span class="eyebrow c-info">${L('Weekly review', 'Revisión semanal')} · ${esc(w.range)} · ${w.snapshots} ${w.snapshots === 1 ? L('daily snapshot', 'foto diaria') : L('daily snapshots', 'fotos diarias')}</span>${S.app.ai ? `<button class="btn btn-sm" data-act="week-summary">${ui.busy.week ? '<span class="spin"></span>' : L('Week in 60 seconds', 'La semana en 60 segundos')}</button>` : ''}</div>
      ${w.summary ? `<p style="margin:12px 0 0;font-size:18px;line-height:28px;max-width:920px">${esc(w.summary.text)}</p>` : `<p class="muted" style="margin:12px 0 0">${w.snapshots < 2 ? L('Your weekly review fills in as daily snapshots accumulate — each morning run saves one.', 'Tu revisión semanal se completa a medida que se juntan fotos diarias — cada resumen matutino guarda una.') : L('Here’s how the week went.', 'Así te fue esta semana.')}</p>`}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:20px">${stat(L('Completed', 'Completado'), w.stats.done)}${stat(L('Still open priorities', 'Prioridades abiertas'), w.stats.unfinished)}${stat(L('Overdue — you owe', 'Vencido — tú debes'), w.stats.overdueMine, w.stats.overdueMine ? 'c-crit' : '')}${stat(L('Overdue — owed to you', 'Vencido — te deben'), w.stats.overdueTheirs, w.stats.overdueTheirs ? 'c-warn' : '')}${stat(L('Meetings', 'Reuniones'), w.stats.meetings + ' · ' + w.stats.meetingHours + ' h')}</div></section>
    <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">${L('Completed', 'Completado')}</h2>${w.done.length ? `<ul class="ul">${w.done.slice(0, 12).map((d) => li(`<span class="c-ok">✓</span> ${esc(d.title)} <span class="faint">· ${esc(d.when)}</span>`)).join('')}</ul>` : `<div class="empty">${L('Nothing marked done this week.', 'Nada marcado como hecho esta semana.')}</div>`}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">${L('Unfinished — and what keeps moving', 'Sin terminar — y lo que se sigue moviendo')}</h2>${w.unfinished.length ? `<ul class="ul">${w.unfinished.slice(0, 10).map((u) => li(`<span class="row"><span class="grow">${esc(u.title)}</span>${u.postponed >= 2 ? pill(L('Postponed ', 'Pospuesta ') + u.postponed + '×', 'warn') : u.days > 1 ? pill(L('On list ', 'En lista ') + u.days + L(' days', ' días'), 'mute') : ''}</span>`)).join('')}</ul>` : `<div class="empty">${L('Nothing carried over.', 'Nada quedó pendiente.')}</div>`}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">${L('Overdue commitments', 'Compromisos vencidos')}</h2>${w.overdue.length ? `<ul class="ul">${w.overdue.map((o) => li(`<span class="tag ${o.direction === 'i_owe' ? 't-INFERENCE' : 't-RECOMMENDATION'}">${o.direction === 'i_owe' ? L('I OWE', 'YO DEBO') : L('THEY OWE', 'ME DEBEN')}</span> ${esc(o.what)} ${o.direction === 'i_owe' ? '→' : '←'} ${esc(o.person)} <span class="mono small c-crit">· ${L('promised', 'prometido')} ${esc(o.promised)}</span>`)).join('')}</ul>` : `<div class="empty">${L('None overdue.', 'Nada vencido.')}</div>`}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">${L('Project progress', 'Avance de proyectos')}</h2>${w.projects.length ? w.projects.map((p) => `<div style="margin-bottom:14px" class="s13"><div class="row"><span class="grow">${esc(p.name)}</span>${pill(p.status, p.level)}</div><div class="bar" style="margin-top:6px"><div style="width:${p.to ?? 0}%;background:var(--pri)"></div></div><div class="small faint" style="margin-top:4px">${p.from != null && p.to != null ? `${p.from}% → ${p.to}% ${L('of tasks done', 'de tareas hechas')} · ` : ''}${p.wasStatus && p.wasStatus !== p.status ? `${L('was', 'antes')} ${esc(p.wasStatus)} · ` : ''}${esc(p.note)}</div></div>`).join('') : `<div class="empty">${L('No projects defined.', 'No hay proyectos definidos.')}</div>`}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">${L('Major decisions', 'Decisiones importantes')}</h2>${w.decisions.length ? `<ul class="ul">${w.decisions.map((d) => li(`${esc(d.decision)} <span class="faint">· ${esc(d.subject)} · ${esc(d.when)}</span>`)).join('')}</ul>` : `<div class="empty">${S.app.ai ? L('No explicit decisions found in email this week.', 'No se encontraron decisiones explícitas en el correo esta semana.') : L('Decision tracking needs the AI key.', 'Para detectar decisiones se necesita la clave de IA.')}</div>`}</section>
      <section class="card pad"><h2 class="h3" style="margin-bottom:10px">${L('Relationships to follow up', 'Personas a las que dar seguimiento')}</h2>${w.people.length ? `<ul class="ul">${w.people.map((p) => li(`<b>${esc(p.name)}</b> <span class="faint">· ${esc(p.why)}</span>`)).join('')}</ul>` : `<div class="empty">${L('No one is waiting on you.', 'Nadie te está esperando.')}</div>`}</section>
    </div>
    <section class="card pad"><h2 class="h3" style="margin-bottom:12px">${L('Next week', 'Próxima semana')}</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">${w.next.map((d) => `<div class="box" style="${d.deadlines > 1 ? 'border-color:var(--warn)' : ''}"><div class="mono small faint">${esc(d.day)}</div><div style="font-weight:600;margin-top:4px">${esc(d.title)}</div><div class="small muted">${esc(d.ctx)}</div><div class="mono small faint" style="margin-top:8px">${d.meetings} ${d.meetings === 1 ? L('meeting', 'reunión') : L('meetings', 'reuniones')}${d.deadlines ? ' · ' + d.deadlines + ' ' + (d.deadlines > 1 ? L('deadlines', 'plazos') : L('deadline', 'plazo')) : ''}</div></div>`).join('')}</div></section>
  </main>`;
}

// ---------- SETTINGS ----------
const DAYS = L(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']);
const GB = (en, es) => L(`<b>${en}</b>`, `<b>${es}</b> <span class="faint">(${en})</span>`);
function googleSetup() {
  const g = S.app.google;
  const consoleLink = (path, label) => `<a href="https://console.cloud.google.com/${path}" target="_blank" rel="noopener">${label} ${I.ext}</a>`;
  if (g.connected) return `<div class="row"><span class="dot c-${g.tokenValid ? 'ok' : 'warn'}"></span><b>${L('Connected as', 'Conectado como')} ${esc(g.email || L('your account', 'tu cuenta'))}</b><span class="faint small">· ${g.tokenValid ? L('session active until ', 'sesión activa hasta las ') + esc(fmtT(new Date(g.tokenExpires).toISOString())) : L('session expired', 'sesión vencida')}</span><span class="grow"></span><button class="btn btn-sm ${g.tokenValid ? '' : 'btn-p'}" data-act="g-connect">${g.tokenValid ? L('Refresh session', 'Renovar sesión') : L('Refresh Google', 'Renovar Google')}</button><button class="btn btn-g btn-sm" data-act="g-disconnect">${L('Disconnect', 'Desconectar')}</button></div>
    ${g.missingScopes.length ? `<p class="small c-warn" style="margin:8px 0 0">${L('Some permissions were not granted', 'Faltan algunos permisos')} (${g.missingScopes.length}). <button class="btn btn-sm" data-act="g-connect" data-consent="1">${L('Reconnect and tick every box', 'Reconectar y marcar todas las casillas')}</button></p>` : ''}
    <p class="small faint" style="margin:8px 0 0">${L('Read-only access to Gmail, Calendar, Drive file names and Google Tasks. Google sessions last about an hour, so the app refreshes it when you open it (one quick redirect). Revoke anytime at', 'Acceso de solo lectura a Gmail, Calendar, nombres de archivos de Drive y Google Tasks. La sesión de Google dura cerca de una hora, así que la app la renueva al abrirla (un salto rápido). Puedes quitar el acceso cuando quieras en')} <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</p>`;
  return `<div><p class="muted" style="margin:0 0 8px">${L('Google requires every app to have its own “key” (a Client ID). It takes about 10 minutes, once. Easiest on a computer — then use the app on your phone.', 'Google exige que cada app tenga su propia “llave” (un Client ID). Toma unos 10 minutos, una sola vez. Es más fácil en una computadora — después usas la app en el celular.')} (<a href="GUIA.html#google" target="_blank" rel="noopener">${L('step-by-step guide', 'guía paso a paso')}</a>)</p>
  <ol class="howto">
    <li>${L('Open', 'Abre')} ${consoleLink('projectcreate', L('Google Cloud → New project', 'Google Cloud → Nuevo proyecto'))}. ${L('Name it', 'Ponle de nombre')} <code>${esc(BRAND.nombreCorto)}</code> → ${GB('Create', 'Crear')}.</li>
    <li>${L('Enable the four APIs (check the top bar says', 'Activa las cuatro APIs (verifica que arriba diga')} <b>${esc(BRAND.nombreCorto)}</b>, ${L('click', 'toca')} ${GB('Enable', 'Habilitar')}): ${consoleLink('apis/library/gmail.googleapis.com', 'Gmail')} · ${consoleLink('apis/library/calendar-json.googleapis.com', 'Calendar')} · ${consoleLink('apis/library/drive.googleapis.com', 'Drive')} · ${consoleLink('apis/library/tasks.googleapis.com', 'Tasks')}</li>
    <li>${consoleLink('auth/overview', 'Google Auth Platform')} → ${GB('Get started', 'Comenzar')}: ${L('app name', 'nombre de la app')} <code>${esc(BRAND.nombreCorto)}</code>, ${L('your email', 'tu correo')} → Audience ${GB('External', 'Externo')} → ${L('your email', 'tu correo')} → ${L('agree', 'aceptar')} → ${GB('Create', 'Crear')}.</li>
    <li>${consoleLink('auth/audience', 'Audience')} → ${GB('Test users', 'Usuarios de prueba')} → ${GB('Add users', 'Agregar usuarios')} → ${L('your Gmail', 'tu Gmail')} → ${GB('Save', 'Guardar')}.</li>
    <li>${consoleLink('auth/clients', 'Clients')} → ${GB('Create client', 'Crear cliente')} → ${L('type', 'tipo')} ${GB('Web application', 'Aplicación web')}.<br>${L('Under', 'En')} ${GB('Authorized JavaScript origins', 'Orígenes autorizados de JavaScript')} ${L('add', 'agrega')}:<div class="row" style="margin:6px 0;flex-wrap:nowrap"><code>${esc(g.origin)}</code><button class="btn btn-sm" data-act="copy" data-text="${esc(g.origin)}">${L('Copy', 'Copiar')}</button></div>${L('Under', 'En')} ${GB('Authorized redirect URIs', 'URI de redireccionamiento autorizados')} ${L('add', 'agrega')}:<div class="row" style="margin:6px 0;flex-wrap:nowrap"><code>${esc(g.redirectUri)}</code><button class="btn btn-sm" data-act="copy" data-text="${esc(g.redirectUri)}">${L('Copy', 'Copiar')}</button></div>${GB('Create', 'Crear')}, ${L('then copy the', 'luego copia el')} <b>Client ID</b> ${L('(you don’t need the secret).', '(no necesitas el secret).')}</li>
    <li>${L('Paste it here', 'Pégalo aquí')} → <b>${L('Save', 'Guardar')}</b>:<div class="row" style="margin-top:8px;flex-wrap:nowrap;max-width:620px"><label class="sr" for="g-id">Client ID</label><input id="g-id" class="input grow" placeholder="1234567890-abc….apps.googleusercontent.com" value="${esc(g.clientId)}"><button class="btn" data-act="g-save">${L('Save', 'Guardar')}</button></div></li>
    <li>${L('Tap', 'Toca')} <b>${L('Connect Google', 'Conectar Google')}</b> → ${L('choose your account', 'elige tu cuenta')} → <i>${L('“Google hasn’t verified this app”', '“Google no verificó esta app”')}</i> → <b>${L('Continue', 'Continuar')}</b> → ${L('tick', 'marca')} <b>${L('every', 'todas las')}</b> ${L('box', 'casillas')} → <b>${L('Continue', 'Continuar')}</b>.
      <div style="margin-top:8px"><button class="btn btn-p" data-act="g-connect" ${g.configured ? '' : 'disabled title="' + L('Save your Client ID first', 'Primero guarda tu Client ID') + '"'}>${L('Connect Google', 'Conectar Google')}</button></div></li>
  </ol></div>`;
}
function aiSetup() {
  return S.app.ai ? `<div class="row"><span class="dot c-ok"></span><b>${L('AI on', 'IA activa')}</b><span class="faint">· ${L('model', 'modelo')} ${esc(S.app.model || 'auto')}</span><span class="grow"></span><button class="btn btn-g btn-sm" data-act="ai-remove">${L('Remove key', 'Quitar clave')}</button></div><p class="small faint" style="margin:8px 0 0">${L('Used this session', 'Uso en esta sesión')}: ${S.app.usage.calls} ${L('calls', 'llamadas')} · ${Math.round((S.app.usage.inputTokens + S.app.usage.outputTokens) / 1000)}k tokens${S.app.usage.lastError ? L(' · last error: ', ' · último error: ') + esc(S.app.usage.lastError) : ''}. ${L('Your data is sent to Anthropic only to generate answers.', 'Tus datos se envían a Anthropic solo para generar respuestas.')}</p>`
    : `<p class="muted" style="margin:0 0 8px">${L('Optional. Without a key the app uses built-in rules. With one, it writes the brief, triages email, finds commitments, drafts replies and answers free-form questions.', 'Opcional. Sin clave la app usa reglas integradas. Con una, escribe el resumen, clasifica el correo, encuentra compromisos, redacta respuestas y contesta preguntas libres.')}</p>
    <ol class="howto"><li>${L('Open', 'Abre')} <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com → API keys ${I.ext}</a>, ${L('sign up, and add credit under', 'crea una cuenta y carga saldo en')} ${GB('Billing', 'Facturación')}.</li><li>${L('Click', 'Toca')} ${GB('Create key', 'Crear clave')}, ${L('copy it, paste it here', 'cópiala y pégala aquí')}:
    <div class="row" style="margin-top:8px;flex-wrap:nowrap;max-width:620px"><input id="ai-key" class="input grow" type="password" placeholder="sk-ant-…"><button class="btn btn-p" data-act="ai-save">${ui.busy.ai ? '<span class="spin"></span>' : L('Save &amp; test', 'Guardar y probar')}</button></div></li></ol>`;
}
function settingsPage() {
  const s = S.app.settings; const last = S.run.last;
  const ruleText = (r) => { const t = S.app.ruleTypes[r.type]; return t ? t.label.replace('…', r.value ? `“${r.value}”` : '…') : r.type; };
  const sec = (id, title, body, sub = '') => `<section id="${id}" class="card" style="padding:22px"><div class="sec-head" style="margin-bottom:4px"><h2 class="h2">${title}</h2>${sub}</div>${body}</section>`;
  return `<div class="wrap body" style="max-width:1100px"><main class="main" style="flex-basis:100%">
  ${sec('connections', L('Google account', 'Cuenta de Google'), googleSetup(), S.app.demo ? pill(L('Demo data on', 'Demo activa'), 'warn') : '')}
  ${!S.app.google.connected ? sec('demo', L('Try it first', 'Pruébala primero'), `<p class="muted" style="margin:0 0 12px">${L('Explore the dashboard with clearly labeled sample data. It’s removed automatically when you connect Google.', 'Explora el panel con datos de ejemplo bien marcados. Se borran solos al conectar Google.')}</p><button class="btn" data-act="demo" data-on="${S.app.demo ? '' : '1'}">${S.app.demo ? L('Turn off demo data', 'Quitar datos de demo') : L('Load demo data', 'Cargar datos de demo')}</button>`) : ''}
  ${sec('ai', L('AI (Anthropic)', 'IA (Anthropic)'), aiSetup())}
  ${sec('brief', L('Morning brief', 'Resumen matutino'), `
    <div class="field"><label for="s-name">${L('Your first name', 'Tu nombre')}</label><input id="s-name" class="input" style="max-width:260px" value="${esc(s.name)}" placeholder="${L('for the greeting', 'para el saludo')}"></div>
    <div class="field"><label for="s-time">${L('Brief ready at', 'Resumen listo a las')}</label><span class="row"><input id="s-time" class="input mono" type="time" value="${esc(s.briefTime)}" style="width:130px"><span class="small faint">${L('Time zone', 'Zona horaria')}: ${esc(S.app.tz)}. ${L('Your new brief is built the first time you open the app after this time (phones don’t let web apps run in the background).', 'Tu nuevo resumen se arma la primera vez que abres la app después de esta hora (los celulares no dejan que una página web trabaje en segundo plano).')}</span></span></div>
    <div class="field"><span>${L('Days', 'Días')}</span><span class="row" style="gap:6px">${DAYS.map((d, i) => `<button class="chipbtn mono" style="min-width:48px;min-height:38px" aria-pressed="${!!s.days[i]}" data-act="day" data-i="${i}">${d}</button>`).join('')}</span></div>
    <div class="field"><span>${L('Briefing length', 'Largo del resumen')}</span><span class="row" style="gap:6px">${[['compact', L('Compact', 'Compacto')], ['standard', L('Standard', 'Estándar')], ['detailed', L('Detailed', 'Detallado')]].map(([l, t]) => `<button class="chipbtn" aria-pressed="${s.length === l}" data-act="set" data-k="length" data-v="${l}">${t}</button>`).join('')}</span></div>
    <div class="field"><span>${L('Refresh Google automatically when I open the app', 'Renovar Google automáticamente al abrir la app')}</span><span class="row"><button class="switch" role="switch" aria-checked="${!!s.autoGoogle}" aria-label="${L('Refresh Google automatically', 'Renovar Google automáticamente')}" data-act="set-bool" data-k="autoGoogle"></button><span class="small faint">${L('One quick redirect to Google, then back', 'Un salto rápido a Google y de vuelta')}</span></span></div>
    <div class="field"><label for="s-live">${L('Live updates every', 'Actualizar cada')}</label><span class="row"><select id="s-live" class="input" style="width:120px">${[5, 10, 15, 30, 60].map((m) => `<option ${+s.liveMinutes === m ? 'selected' : ''}>${m}</option>`).join('')}</select><span class="small faint">${L('minutes while the app is open — updates affected sections without rewriting the brief', 'minutos mientras la app está abierta — actualiza solo lo que cambió, sin reescribir el resumen')}</span></span></div>
    <div class="field"><span>${L('Working hours', 'Horario laboral')}</span><span class="row"><input id="s-ws" class="input mono" type="time" value="${esc(s.workStart)}" style="width:120px" aria-label="${L('Start', 'Inicio')}"> – <input id="s-we" class="input mono" type="time" value="${esc(s.workEnd)}" style="width:120px" aria-label="${L('End', 'Fin')}"><label class="small faint" for="s-mm">${L('“morning” means', '“en la mañana” significa')}</label><input id="s-mm" class="input mono" type="time" value="${esc(s.morningMeans)}" style="width:120px"></span></div>
    <div class="row" style="margin-top:14px"><button class="btn btn-p" data-act="save-brief">${L('Save', 'Guardar')}</button></div>`)}
  ${sec('rules', L('Priority rules', 'Reglas de prioridad'), `<p class="small faint" style="margin:0 0 8px">${L('Your rules always override AI judgement.', 'Tus reglas siempre mandan sobre la IA.')}</p><ul class="ul">${(s.rules || []).map((r) => `<li class="row" style="padding:12px 0;border-top:1px solid var(--bd);flex-wrap:nowrap"><span class="grow">${esc(ruleText(r))}</span><button class="switch" role="switch" aria-checked="${r.on}" aria-label="${L('Enable rule', 'Activar regla')}" data-act="rule-toggle" data-id="${esc(r.id)}"></button><button class="btn btn-g btn-sm" data-act="rule-del" data-id="${esc(r.id)}" aria-label="${L('Delete rule', 'Borrar regla')}">×</button></li>`).join('') || `<li class="empty">${L('No rules yet.', 'Aún no hay reglas.')}</li>`}</ul>
    <div class="row" style="margin-top:12px"><select id="r-type" class="input" style="flex:1 1 280px">${Object.entries(S.app.ruleTypes).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select><input id="r-val" class="input" style="flex:1 1 200px" placeholder="${L('value (email, @domain, project, hours, amount…)', 'valor (correo, @dominio, proyecto, horas, monto…)')}"><button class="btn btn-p" data-act="rule-add">${L('Add rule', 'Agregar regla')}</button></div>
    <div class="field" style="margin-top:14px"><label for="s-people">${L('Important people', 'Personas importantes')}</label><span class="row"><input id="s-people" class="input grow" value="${esc((s.importantPeople || []).join(', '))}" placeholder="${L('boss@company.com, @bigclient.com', 'jefe@empresa.com, @clientegrande.com')}"><button class="btn" data-act="save-people">${L('Save', 'Guardar')}</button></span></div>`)}
  ${sec('projects', L('Projects', 'Proyectos'), `<p class="small faint" style="margin:0 0 8px">${L('Projects connect email, meetings, tasks and files. Anything mentioning a keyword — or involving a listed person — is linked automatically.', 'Los proyectos unen correos, reuniones, tareas y archivos. Todo lo que mencione una palabra clave — o involucre a una persona de la lista — se vincula solo.')}</p>
    <ul class="ul">${S.projects.map((p) => `<li style="padding:12px 0;border-top:1px solid var(--bd)"><div class="row"><b class="grow">${esc(p.name)}${p.important ? ` <span class="c-warn">★ ${L('important', 'importante')}</span>` : ''}${p.demo ? ' ' + pill('demo', 'warn') : ''}</b><button class="btn btn-sm" data-act="proj-edit" data-id="${esc(p.id)}">${L('Edit', 'Editar')}</button><button class="btn btn-g btn-sm" data-act="proj-del" data-id="${esc(p.id)}">${L('Delete', 'Borrar')}</button></div><div class="small faint">${L('Keywords', 'Palabras clave')}: ${esc(p.keywords.join(', ') || '—')} · ${L('People', 'Personas')}: ${esc(p.people.join(', ') || '—')}</div></li>`).join('') || `<li class="empty">${L('No projects yet.', 'Aún no hay proyectos.')}</li>`}</ul>
    <div class="row" style="margin-top:12px"><button class="btn btn-p" data-act="proj-edit">${L('Add project', 'Agregar proyecto')}</button></div>`)}
  ${sec('health', L('Integration health', 'Estado de conexiones'), `<div class="tbl-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th class="eyebrow">${L('Source', 'Fuente')}</th><th class="eyebrow">${L('Status', 'Estado')}</th><th class="eyebrow">${L('Last successful sync', 'Última sincronización')}</th><th class="eyebrow">${L('Records', 'Registros')}</th><th class="eyebrow">${L('Access', 'Acceso')}</th></tr></thead><tbody>
    ${S.sources.map((x) => `<tr><td><b>${esc(x.label)}</b>${x.error ? `<div class="small c-crit">${esc(x.error)}</div>` : ''}</td><td>${pill(x.status === 'ok' ? L('Connected', 'Conectado') : x.status === 'reconnect' ? L('Reconnect', 'Reconectar') : L('Sync failed', 'Falló'), x.status === 'ok' ? 'ok' : x.status === 'reconnect' ? 'warn' : 'crit')}</td><td class="mono small muted">${esc(fmtWhen(x.lastSuccess))}</td><td class="mono small muted">${esc(x.records ?? '—')}</td><td><span class="tag l-info">${L('READ', 'LECTURA')}</span></td></tr>`).join('') || `<tr><td colspan="5" class="empty">${L('Nothing connected yet.', 'Aún no hay nada conectado.')}</td></tr>`}
    </tbody></table></div><p class="small faint" style="margin:10px 0 0">${L('If a source fails, its last good data is kept and marked — never erased. Next morning run:', 'Si una fuente falla, se conservan y marcan sus últimos datos buenos — nunca se borran. Próximo resumen:')} ${esc(S.run.nextMorning ? fmtWhen(S.run.nextMorning) : L('off', 'apagado'))}.</p>`, `<button class="btn btn-sm" data-act="refresh" ${S.run.running || !S.app.hasSources ? 'disabled' : ''}>${I.refresh} ${L('Refresh now', 'Actualizar ahora')}</button>`)}
  ${sec('pipeline', L('Last run', 'Última ejecución'), last ? `<div class="mono small muted" style="margin-bottom:12px">${esc(RUNTYPE[last.type] || last.type)} · ${esc(fmtWhen(last.startedAt))} → ${esc(fmtT(last.finishedAt))} · ${esc(STATUS[last.status] || last.status)}${last.error ? ' · ' + esc(last.error) : ''}</div><ol class="ul" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">${last.stages.map((st, i) => `<li class="stage" style="${st.status !== 'ok' ? 'border-color:var(--warn)' : ''}"><div class="row" style="justify-content:space-between"><span class="mono small faint">${String(i + 1).padStart(2, '0')}</span><span class="mono small c-${st.status === 'ok' ? 'ok' : st.status === 'skipped' ? 'mute' : st.status === 'partial' ? 'warn' : 'crit'}">${esc(STATUS[st.status] || st.status)}</span></div><div class="s13" style="font-weight:500">${esc(st.name)}</div><div class="small faint">${esc(st.detail)}</div></li>`).join('')}</ol>` : `<div class="empty">${L('No runs yet.', 'Aún no hay ejecuciones.')}</div>`)}
  ${sec('perms', L('Permissions & safety', 'Permisos y seguridad'), `<div class="tbl-wrap"><table class="tbl" style="min-width:560px"><thead><tr><th class="eyebrow">${L('Action', 'Acción')}</th><th class="eyebrow">${L('Risk', 'Riesgo')}</th><th class="eyebrow">${L('This app', 'Esta app')}</th></tr></thead><tbody>
    ${L([['Read email, calendar, file names, tasks', 'Low', 'ok', 'Allowed (read-only access)'], ['Draft replies', 'Low', 'ok', 'Allowed — you copy and send them yourself'], ['Create tasks & reminders', 'Low', 'ok', 'Allowed — stored in this app only'], ['Send email', 'Medium', 'warn', 'Not possible — no send permission'], ['Create, move or cancel meetings', 'High', 'crit', 'Not possible — calendar is read-only'], ['Delete email, files or tasks', 'High', 'crit', 'Not possible — no delete permission']], [['Leer correo, agenda, nombres de archivos y tareas', 'Bajo', 'ok', 'Permitido (solo lectura)'], ['Redactar respuestas', 'Bajo', 'ok', 'Permitido — tú las copias y envías'], ['Crear tareas y recordatorios', 'Bajo', 'ok', 'Permitido — se guardan solo en esta app'], ['Enviar correos', 'Medio', 'warn', 'No es posible — sin permiso de envío'], ['Crear, mover o cancelar reuniones', 'Alto', 'crit', 'No es posible — la agenda es de solo lectura'], ['Borrar correos, archivos o tareas', 'Alto', 'crit', 'No es posible — sin permiso de borrado']]).map((r) => `<tr><td>${r[0]}</td><td>${pill(r[1], r[2])}</td><td class="muted">${r[3]}</td></tr>`).join('')}</tbody></table></div>
    <p class="small faint" style="margin:10px 0 0">${L('Your data is stored only in this browser on this device', 'Tus datos se guardan solo en este navegador, en este dispositivo')} (${S.app.storageKB} KB) — ${L('not on GitHub or any server. Using another phone or computer means connecting there too. The AI key, if you add one, is also stored only here; data goes directly from this device to Google and to Anthropic.', 'no en GitHub ni en ningún servidor. Para usarla en otro teléfono o computadora, conéctala ahí también. La clave de IA, si agregas una, también se guarda solo aquí; los datos van directo de este dispositivo a Google y a Anthropic.')}</p>`)}
  ${sec('danger', L('Reset', 'Reiniciar'), `<p class="small faint" style="margin:0 0 10px">${L('Deletes synced data, snapshots and history on this device (keeps your settings, projects and connections).', 'Borra los datos sincronizados, fotos e historial de este dispositivo (mantiene tus ajustes, proyectos y conexiones).')}</p><button class="btn btn-d" data-act="reset">${L('Delete synced data', 'Borrar datos sincronizados')}</button>`)}
  </main></div>`;
}

// ---------- WELCOME / ONBOARDING ----------
function welcomePage() {
  const st = ui.step; const g = S.app.google;
  const steps = L(['Connect accounts', 'Choose brief time', 'Priority preferences', 'Generate first brief'], ['Conectar cuentas', 'Hora del resumen', 'Preferencias de prioridad', 'Generar primer resumen']);
  const canNext = st !== 1 || S.app.hasSources;
  const s = S.app.settings;
  let body = '';
  if (st === 1) body = `<h2 class="h2" style="font-size:20px;margin-bottom:12px">${L('Connect your Google account', 'Conecta tu cuenta de Google')}</h2>${googleSetup()}
    ${!g.connected ? `<div class="box" style="margin-top:18px"><b>${L('Just want to look around first?', '¿Solo quieres mirar primero?')}</b> <span class="muted">${L('Load clearly-labeled demo data — it’s removed when you connect.', 'Carga datos de demo bien marcados — se borran al conectar.')}</span><div style="margin-top:8px"><button class="btn" data-act="demo" data-on="${S.app.demo ? '' : '1'}">${S.app.demo ? L('Demo data is on — turn off', 'Demo activa — quitar') : L('Load demo data', 'Cargar datos de demo')}</button></div></div>` : ''}
    <div class="box" style="margin-top:12px"><b>${L('Optional: AI', 'Opcional: IA')}</b><div style="margin-top:8px">${aiSetup()}</div></div>`;
  if (st === 2) body = `<h2 class="h2" style="font-size:20px">${L('When should your brief be ready?', '¿A qué hora quieres tu resumen?')}</h2><p class="muted">${L('Each day, the first time you open the app after this time, it syncs and builds your new brief. During the day it updates every few minutes while open.', 'Cada día, la primera vez que abras la app después de esta hora, sincroniza y arma tu nuevo resumen. Durante el día se actualiza cada pocos minutos mientras está abierta.')}</p>
    <div class="row" style="gap:16px;align-items:flex-end"><label style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow">${L('Your first name', 'Tu nombre')}</span><input id="s-name" class="input" value="${esc(s.name)}"></label><label style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow">${L('Time', 'Hora')}</span><input id="s-time" class="input mono" type="time" value="${esc(s.briefTime)}" style="width:140px"></label><span class="small faint" style="padding-bottom:10px">${L('Time zone', 'Zona horaria')}: ${esc(S.app.tz)}</span></div>
    <div class="row" style="gap:6px;margin-top:16px">${DAYS.map((d, i) => `<button class="chipbtn mono" style="min-width:48px;min-height:38px" aria-pressed="${!!s.days[i]}" data-act="day" data-i="${i}">${d}</button>`).join('')}</div>`;
  if (st === 3) body = `<h2 class="h2" style="font-size:20px">${L('What should always rise to the top?', '¿Qué debe aparecer siempre primero?')}</h2><p class="muted">${L('Start with a few rules — your rules always override the AI. You can change these anytime in Settings.', 'Empieza con algunas reglas — tus reglas siempre mandan sobre la IA. Puedes cambiarlas cuando quieras en Ajustes.')}</p>
    <ul class="ul">${(s.rules || []).map((r) => `<li class="row" style="padding:10px 0;border-top:1px solid var(--bd);flex-wrap:nowrap"><span class="grow">${esc(S.app.ruleTypes[r.type]?.label.replace('…', r.value ? '“' + r.value + '”' : '…'))}</span><button class="switch" role="switch" aria-checked="${r.on}" data-act="rule-toggle" data-id="${esc(r.id)}" aria-label="${L('Enable rule', 'Activar regla')}"></button></li>`).join('')}</ul>
    <label style="display:flex;flex-direction:column;gap:6px;margin-top:16px"><span class="eyebrow">${L('Important people (emails or @domains, comma-separated)', 'Personas importantes (correos o @dominios, separados por comas)')}</span><span class="row" style="flex-wrap:nowrap"><input id="s-people" class="input grow" value="${esc((s.importantPeople || []).join(', '))}" placeholder="${L('boss@company.com, @bigclient.com', 'jefe@empresa.com, @clientegrande.com')}"><button class="btn" data-act="save-people">${L('Save', 'Guardar')}</button></span></label>`;
  if (st === 4) body = `<h2 class="h2" style="font-size:20px">${L('Building your first brief', 'Preparando tu primer resumen')}</h2><p class="muted">${L('This first run looks back a few days so you start with useful context.', 'Esta primera vez revisa los últimos días para que empieces con contexto útil.')}</p>
    ${S.run.running ? `<div class="row"><span class="spin"></span> ${esc(S.run.stage)}…</div>` : S.brief ? `<p class="c-ok"><b>${L('Your brief is ready.', 'Tu resumen está listo.')}</b></p><a class="btn btn-p" href="#/today" data-act="finish">${L('Open Today', 'Abrir Hoy')}</a>` : `<button class="btn btn-p" data-act="refresh">${L('Generate now', 'Generar ahora')}</button>`}
    ${S.run.last ? `<ol class="ul" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:16px">${S.run.last.stages.map((x) => `<li class="stage s13"><span class="c-${x.status === 'ok' ? 'ok' : 'warn'}">${x.status === 'ok' ? '✓' : '!'}</span> ${esc(x.name)}<div class="small faint">${esc(x.detail)}</div></li>`).join('')}</ol>` : ''}`;
  return `<main class="wrap" style="max-width:1000px;padding-top:48px;padding-bottom:56px;display:flex;flex-direction:column;gap:24px">
    <div>${logoHtml(BRAND, 44)}<h1 class="h1" style="margin:12px 0 6px;font-size:32px">${L('Welcome to', 'Bienvenido a')} ${esc(BRAND.nombre)}.</h1>${BRAND.eslogan ? `<p class="muted" style="margin:0 0 4px">${esc(BRAND.eslogan)}</p>` : ''}<p class="muted" style="margin:0;font-size:16px">${L('Connect your tools to build your first Daily Brief. Nothing appears until real data arrives — no fake activity.', 'Conecta tus herramientas para crear tu primer resumen diario. No aparece nada hasta que lleguen datos reales — nada inventado.')} <a href="GUIA.html" target="_blank" rel="noopener">${L('Step-by-step guide', 'Guía paso a paso')}</a></p></div>
    <ol class="ul steps-nav">${steps.map((l, i) => `<li><button class="step-btn" aria-current="${st === i + 1 ? 'step' : 'false'}" data-act="step" data-i="${i + 1}"><span class="mono small ${i + 1 < st ? 'c-ok' : st === i + 1 ? 'c-info' : 'faint'}">${L('STEP', 'PASO')} ${i + 1} · ${i + 1 < st ? L('DONE', 'LISTO') : st === i + 1 ? L('NOW', 'AHORA') : L('NEXT', 'DESPUÉS')}</span><span style="display:block;font-weight:600;margin-top:2px">${l}</span></button></li>`).join('')}</ol>
    <section class="card brief">${body}
      <div class="row" style="margin-top:24px;padding-top:18px;border-top:1px solid var(--bd)"><button class="btn" data-act="step" data-i="${Math.max(1, st - 1)}">${L('Back', 'Atrás')}</button><span class="grow small faint">${st === 1 && !canNext ? L('Connect Google (or load demo data) to continue.', 'Conecta Google (o carga los datos de demo) para continuar.') : ''}</span>
      ${st < 4 ? `<button class="btn btn-p" data-act="step-next" ${canNext ? '' : 'disabled'}>${st === 3 ? L('Generate my first brief', 'Generar mi primer resumen') : L('Continue', 'Continuar')}</button>` : `<a class="btn" href="#/today" data-act="finish">${L('Skip to dashboard', 'Ir al panel')}</a>`}</div></section></main>`;
}

// ---------- modals ----------
function modal(html) { $('#modal-root').innerHTML = `<div class="modal-bg" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; const f = $('#modal-root [autofocus]') || $('#modal-root button'); f && f.focus(); }
const closeModal = () => { $('#modal-root').innerHTML = ''; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); if (ui.searchRes) { ui.searchRes = null; render(); } } });

async function showSources(ids) {
  modal(`<div class="row"><span class="spin"></span> ${L('Loading sources…', 'Cargando fuentes…')}</div>`);
  try {
    const list = await api('/api/describe?ids=' + encodeURIComponent(ids));
    modal(`<div class="sec-head"><h2 class="h2">${L('Sources', 'Fuentes')}</h2><button class="btn btn-g" data-act="close">${L('Close', 'Cerrar')}</button></div><ul class="ul divide">${list.map((s) => `<li class="row" style="padding:10px 0"><span class="tag t-FACT">${esc(s.type.toUpperCase())}</span><span class="grow">${esc(s.label)}</span><span class="mono small faint">${esc(s.when || '')}</span>${realLink(s.link) ? `<a class="btn btn-sm" href="${esc(s.link)}" target="_blank" rel="noopener">${L('Open', 'Abrir')} ${I.ext}</a>` : ''}</li>`).join('')}</ul>`);
  } catch (e) { modal(`<p class="c-crit">${esc(e.message)}</p><button class="btn" data-act="close">${L('Close', 'Cerrar')}</button>`); }
}
async function showDraft(msgId) {
  modal(`<div class="row"><span class="spin"></span> ${L('Drafting a reply from the thread…', 'Redactando una respuesta a partir del correo…')}</div>`);
  try {
    const d = await api(`/api/messages/${encodeURIComponent(msgId)}/draft`, { body: {} });
    modal(`<div class="sec-head"><h2 class="h2">${L('Draft reply', 'Borrador de respuesta')}</h2>${tag('RECOMMENDATION')}</div>
      <div class="s13 muted">${L('To', 'Para')}: ${esc(d.to?.name || '')} &lt;${esc(d.to?.email || '')}&gt;</div><div class="s13 muted" style="margin-bottom:10px">${L('Subject', 'Asunto')}: ${esc(d.subject)}</div>
      <textarea id="draft-body" class="input" rows="12" style="width:100%" autofocus>${esc(d.body)}</textarea>
      ${d.placeholders?.length ? `<p class="small c-warn">${L('Fill in before sending', 'Completa antes de enviar')}: ${d.placeholders.map(esc).join(' · ')}</p>` : ''}
      <p class="small faint">${L('This app can’t send email. Copy the draft and send it from Gmail.', 'Esta app no puede enviar correos. Copia el borrador y envíalo desde Gmail.')}</p>
      <div class="row"><button class="btn btn-p" data-act="copy-draft">${L('Copy draft', 'Copiar borrador')}</button>${openLink(d.link, L('Open thread in Gmail', 'Abrir en Gmail'))}<span class="grow"></span><button class="btn btn-g" data-act="close">${L('Close', 'Cerrar')}</button></div>`);
  } catch (e) { modal(`<h2 class="h2">${L('Draft reply', 'Borrador de respuesta')}</h2><p class="c-warn">${esc(e.message)}</p><div class="row"><a class="btn" href="#/settings" data-act="close">${L('Open Settings', 'Abrir Ajustes')}</a><button class="btn btn-g" data-act="close">${L('Close', 'Cerrar')}</button></div>`); }
}
async function showThread(msgId) {
  modal(`<div class="row"><span class="spin"></span> ${L('Loading…', 'Cargando…')}</div>`);
  try {
    const t = await api(`/api/messages/${encodeURIComponent(msgId)}/thread`);
    modal(`<div class="sec-head"><h2 class="h2">${esc(t[0]?.subject || L('Thread', 'Conversación'))}</h2><button class="btn btn-g" data-act="close">${L('Close', 'Cerrar')}</button></div>${t.map((m) => `<div class="box" style="margin-bottom:10px"><div class="row"><b>${esc(m.from)}</b><span class="grow"></span><span class="mono small faint">${esc(m.date)}</span></div><div class="s13" style="white-space:pre-wrap;margin-top:6px">${esc(m.text)}</div></div>`).join('')}<p class="small faint">${L('Showing the messages synced in the last few days.', 'Se muestran los mensajes sincronizados de los últimos días.')}</p>`);
  } catch (e) { modal(`<p class="c-crit">${esc(e.message)}</p><button class="btn" data-act="close">${L('Close', 'Cerrar')}</button>`); }
}
function projectModal(id) {
  const p = S.projects.find((x) => x.id === id) || { name: '', keywords: [], people: [], important: false };
  modal(`<h2 class="h2" style="margin-bottom:12px">${id ? L('Edit project', 'Editar proyecto') : L('New project', 'Nuevo proyecto')}</h2>
    <div style="display:grid;gap:10px"><label class="small faint" for="p-name">${L('Name', 'Nombre')}</label><input id="p-name" class="input" value="${esc(p.name)}" autofocus>
    <label class="small faint" for="p-kw">${L('Keywords (comma-separated) — words that appear in related email subjects, events, tasks or file names', 'Palabras clave (separadas por comas) — palabras que aparecen en asuntos de correos, eventos, tareas o nombres de archivos')}</label><input id="p-kw" class="input" value="${esc(p.keywords.join(', '))}" placeholder="${L('apex, msa, implementation', 'cliente, contrato, lanzamiento')}">
    <label class="small faint" for="p-people">${L('People (emails, comma-separated)', 'Personas (correos, separados por comas)')}</label><input id="p-people" class="input" value="${esc(p.people.join(', '))}" placeholder="${L('john@apexcorp.com', 'juan@cliente.com')}">
    <label class="row"><input id="p-imp" type="checkbox" ${p.important ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--pri)"> ${L('Important project (raises priority of everything linked to it)', 'Proyecto importante (sube la prioridad de todo lo vinculado)')}</label></div>
    <div class="row" style="margin-top:16px"><button class="btn btn-p" data-act="proj-save" data-id="${esc(id || '')}">${L('Save', 'Guardar')}</button><button class="btn btn-g" data-act="close">${L('Cancel', 'Cancelar')}</button></div>`);
}
function addCommitModal() {
  modal(`<h2 class="h2" style="margin-bottom:12px">${L('Add a commitment', 'Agregar un compromiso')}</h2><div style="display:grid;gap:10px">
    <label class="small faint" for="c-dir">${L('Direction', 'Dirección')}</label><select id="c-dir" class="input"><option value="i_owe">${L('I owe someone', 'Yo le debo a alguien')}</option><option value="they_owe">${L('Someone owes me', 'Alguien me debe')}</option></select>
    <label class="small faint" for="c-person">${L('Person', 'Persona')}</label><input id="c-person" class="input" autofocus>
    <label class="small faint" for="c-what">${L('What', 'Qué')}</label><input id="c-what" class="input">
    <label class="small faint" for="c-date">${L('Promised by (optional)', 'Prometido para (opcional)')}</label><input id="c-date" class="input" type="date"></div>
    <div class="row" style="margin-top:16px"><button class="btn btn-p" data-act="commit-save">${L('Save', 'Guardar')}</button><button class="btn btn-g" data-act="close">${L('Cancel', 'Cancelar')}</button></div>`);
}
function confirmModal(text, onYes) {
  ui.confirm = onYes;
  modal(`<h2 class="h2" style="margin-bottom:8px">${L('Please confirm', 'Confirma, por favor')}</h2><p>${esc(text)}</p><div class="row"><button class="btn btn-p" data-act="confirm-yes" autofocus>${L('Confirm', 'Confirmar')}</button><button class="btn btn-g" data-act="close">${L('Cancel', 'Cancelar')}</button></div>`);
}

// ---------- actions ----------
const val = (id) => document.getElementById(id)?.value ?? '';
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
async function refreshState() { S = await api('/api/state'); render(); }
async function saveSettings(patch, msg = L('Saved', 'Guardado')) { await api('/api/settings', { body: patch }); await refreshState(); toast(msg); }
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
  theme: () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); const next = cur === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = next; store.set(THEME_KEY, next); },
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
  'task-done': async (d) => { try { await api(`/api/tasks/${encodeURIComponent(d.task)}`, { method: 'PATCH', body: { status: 'done' } }); toast(L('Marked done', 'Marcada como hecha')); await refreshState(); } catch (e) { toast(e.message, true); await refreshState(); } },
  'task-tomorrow': async (d) => { await api(`/api/tasks/${encodeURIComponent(d.task)}`, { method: 'PATCH', body: { date: tomorrow() } }); toast(L('Moved to tomorrow', 'Pasada a mañana')); await refreshState(); },
  draft: (d) => showDraft(d.msg),
  thread: (d) => showThread(d.msg),
  nudge: (d) => { const c = [...S.commitments.theyOwe, ...S.commitments.iOwe].find((x) => x.id === d.id); const id = c?.link && Object.values(S.inbox).flat().find((m) => m.link === c.link)?.id; if (id) showDraft(id); else toast(L('Open the original email to send a nudge.', 'Abre el correo original para enviar un recordatorio.')); },
  snooze: async (d) => { await api(`/api/messages/${encodeURIComponent(d.msg)}/hide`, { body: { hours: 24 } }); toast(L('Snoozed until tomorrow', 'Pospuesto hasta mañana')); await refreshState(); },
  hide: async (d) => { await api(`/api/messages/${encodeURIComponent(d.msg)}/hide`, { body: { archive: true } }); toast(L('Hidden from the dashboard (still in Gmail)', 'Oculto del panel (sigue en Gmail)')); await refreshState(); },
  recat: async (d) => { await api(`/api/messages/${encodeURIComponent(d.msg)}/category`, { body: { category: d.cat } }); toast(L('Updated', 'Actualizado')); await refreshState(); },
  'msg-task': async (d) => { await api('/api/tasks', { body: { title: d.title, sourceMessageId: d.msg } }); toast(L('Task created', 'Tarea creada')); await refreshState(); },
  commit: async (d) => { await api(`/api/commitments/${encodeURIComponent(d.id)}`, { body: { status: d.status } }); toast(d.status === 'done' ? L('Marked as delivered', 'Marcado como entregado') : L('Dismissed', 'Descartado')); await refreshState(); },
  'commit-task': async (d) => { await api('/api/tasks', { body: { title: d.title, fromCommitment: d.id } }); toast(L('Task created', 'Tarea creada')); await refreshState(); },
  'add-commit': () => addCommitModal(),
  'commit-save': async () => { try { await api('/api/commitments', { body: { direction: val('c-dir'), person: val('c-person'), what: val('c-what'), date: val('c-date') } }); closeModal(); toast(L('Commitment added', 'Compromiso agregado')); await refreshState(); } catch (e) { toast(e.message, true); } },
  ask: (d) => doChat(d.q),
  'chat-send': () => doChat(val('chat-in')),
  'chat-clear': async () => { await api('/api/chat/clear', { body: {} }); S.chat = []; render(); },
  'chat-action': (d) => {
    const c = S.chat.find((x) => x.id === d.chat); const a = c?.actions?.[+d.i]; if (!a) return;
    if (a.type === 'draft_reply') return showDraft(a.message_id);
    confirmModal(a.label + '?', async () => {
      if (a.type === 'create_task') await api('/api/tasks', { body: { title: a.title, date: a.due || null } });
      if (a.type === 'reschedule_task') await api(`/api/tasks/${encodeURIComponent(a.task_id)}`, { method: 'PATCH', body: { date: a.due } });
      toast(L('Done', 'Listo')); await refreshState();
    });
  },
  'confirm-yes': async () => { const f = ui.confirm; closeModal(); ui.confirm = null; try { await f?.(); } catch (e) { toast(e.message, true); } },
  search: async () => { ui.searchQ = val('q').trim(); if (!ui.searchQ) { ui.searchRes = null; return render(); } ui.searchRes = { loading: true, items: [] }; render(); try { ui.searchRes = { items: await api('/api/search?q=' + encodeURIComponent(ui.searchQ)) }; } catch (e) { ui.searchRes = { items: [] }; toast(e.message, true); } render(); },
  'search-close': () => { ui.searchRes = null; render(); },
  'capture-open': () => { ui.capture = ui.capture ? null : { text: '', parsed: null }; render(); setTimeout(() => $('#cap-in')?.focus(), 0); },
  'capture-close': () => { ui.capture = null; render(); },
  'capture-parse': async () => { const text = val('cap-in').trim(); if (!text) return; ui.capture = { text, parsed: ui.capture?.parsed || null, busy: true }; render(); try { ui.capture.parsed = await api('/api/capture/parse', { body: { text } }); } catch (e) { toast(e.message, true); } ui.capture.busy = false; render(); },
  'capture-create': async () => {
    const type = val('cap-type'); const title = val('cap-title').trim(); if (!title) return toast(L('Add a title', 'Agrega un título'), true);
    try { await api('/api/tasks', { body: { title: (type === 'event' ? L('Schedule: ', 'Agendar: ') : type === 'follow_up' ? L('Follow up: ', 'Seguimiento: ') : '') + title.replace(/^(Schedule|Follow up|Agendar|Seguimiento): /, ''), date: val('cap-date') || null, time: val('cap-time') || null, kind: type, person: ui.capture.parsed?.person || null } }); ui.capture = null; toast(L(`${CAPT[type]} created`, `${CAPT[type]} creado`)); await refreshState(); } catch (e) { toast(e.message, true); }
  },
  'focus-start': async (d) => { await api('/api/focus', { body: { action: 'start', taskId: d.task } }); location.hash = '#/focus'; await refreshState(); },
  'focus-new': async () => { const t = val('focus-title').trim(); if (!t) return; await api('/api/focus', { body: { action: 'start', title: t } }); await refreshState(); },
  'focus-stop': async () => { await api('/api/focus', { body: { action: 'stop' } }); await refreshState(); toast(L('Focus ended — held updates are back on Today', 'Enfoque terminado — las novedades en espera volvieron a Hoy')); },
  'focus-done': async () => { const id = S.focus?.task?.id; try { if (id) await api(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'done' } }); } catch (e) { toast(e.message, true); } await api('/api/focus', { body: { action: 'stop' } }); location.hash = '#/today'; await refreshState(); toast(L('Nice — done.', 'Bien hecho.')); },
  'step-add': async () => { const t = val('step-in').trim(); if (!t) return; const steps = [...(S.focus.steps || []), { text: t, done: false }]; await api('/api/focus', { body: { action: 'steps', steps } }); await refreshState(); setTimeout(() => $('#step-in')?.focus(), 0); },
  'step-toggle': async (d) => { const steps = S.focus.steps.map((s, i) => (i === +d.i ? { ...s, done: !s.done } : s)); await api('/api/focus', { body: { action: 'steps', steps } }); await refreshState(); },
  'step-del': async (d) => { const steps = S.focus.steps.filter((_, i) => i !== +d.i); await api('/api/focus', { body: { action: 'steps', steps } }); await refreshState(); },
  'week-summary': async () => { ui.busy.week = true; render(); try { const s = await api('/api/weekly/summary', { body: {} }); ui.weekly.summary = s; } catch (e) { toast(e.message, true); } ui.busy.week = false; render(); },
  copy: async (d) => { try { await navigator.clipboard.writeText(d.text); toast(L('Copied', 'Copiado')); } catch { toast(L('Select the text and copy it manually.', 'Selecciona el texto y cópialo a mano.')); } },
  'copy-draft': async () => { try { await navigator.clipboard.writeText(val('draft-body')); toast(L('Draft copied — paste it into Gmail', 'Borrador copiado — pégalo en Gmail')); } catch { toast(L('Select the text and copy it manually.', 'Selecciona el texto y cópialo a mano.')); } },
  'g-save': async () => { try { await api('/api/config/google', { body: { clientId: val('g-id') } }); toast(L('Saved — now tap Connect Google', 'Guardado — ahora toca Conectar Google')); await refreshState(); } catch (e) { toast(e.message, true); } },
  'g-connect': async (d) => { try { toast(L('Opening Google…', 'Abriendo Google…')); await api('/api/google/connect', { body: { consent: !!d.consent, returnTo: location.hash || '#/today' } }); } catch (e) { toast(e.message, true); } },
  'g-disconnect': () => confirmModal(L('Disconnect Google? Synced data stays on this device until you reset it.', '¿Desconectar Google? Los datos sincronizados quedan en este dispositivo hasta que los borres.'), async () => { await api('/api/google/disconnect', { body: {} }); await refreshState(); }),
  'ai-save': async () => { ui.busy.ai = true; render(); try { const r = await api('/api/config/anthropic', { body: { apiKey: val('ai-key') } }); toast(L('AI is on · ', 'IA activa · ') + r.model); } catch (e) { toast(e.message, true); } ui.busy.ai = false; await refreshState(); },
  'ai-remove': () => confirmModal(L('Remove the AI key? The app will switch to built-in rules.', '¿Quitar la clave de IA? La app pasará a usar reglas integradas.'), async () => { await api('/api/config/anthropic', { body: { apiKey: '' } }); await refreshState(); }),
  demo: async (d) => { toast(d.on ? L('Loading demo data…', 'Cargando datos de demo…') : L('Removing demo data…', 'Quitando datos de demo…')); try { await api('/api/demo', { body: { on: !!d.on } }); await refreshState(); } catch (e) { toast(e.message, true); } },
  day: async (d) => { const days = [...S.app.settings.days]; days[+d.i] = !days[+d.i]; await saveSettings({ days }); },
  set: async (d) => saveSettings({ [d.k]: d.v }),
  'set-bool': async (d) => saveSettings({ [d.k]: !S.app.settings[d.k] }),
  'save-brief': () => saveSettings({ name: val('s-name').trim(), briefTime: val('s-time') || '06:00', liveMinutes: +val('s-live') || 15, workStart: val('s-ws'), workEnd: val('s-we'), morningMeans: val('s-mm') }),
  'save-people': () => saveSettings({ importantPeople: val('s-people').split(',').map((x) => x.trim()).filter(Boolean) }),
  'rule-toggle': (d) => saveSettings({ rules: S.app.settings.rules.map((r) => (r.id === d.id ? { ...r, on: !r.on } : r)) }),
  'rule-del': (d) => saveSettings({ rules: S.app.settings.rules.filter((r) => r.id !== d.id) }, L('Rule removed', 'Regla eliminada')),
  'rule-add': () => { const type = val('r-type'); const value = val('r-val').trim(); if (S.app.ruleTypes[type].needs && !value) return toast(L('This rule needs a value', 'Esta regla necesita un valor'), true); saveSettings({ rules: [...S.app.settings.rules, { id: 'r' + Date.now(), type, value, on: true }] }, L('Rule added — applied to your inbox', 'Regla agregada — aplicada a tu correo')); },
  'proj-edit': (d) => projectModal(d.id),
  'proj-save': async (d) => { try { await api('/api/projects', { body: { id: d.id || undefined, name: val('p-name'), keywords: val('p-kw').split(','), people: val('p-people').split(','), important: document.getElementById('p-imp').checked } }); closeModal(); toast(L('Project saved — linking happens on the next refresh', 'Proyecto guardado — se vincula en la próxima actualización')); await refreshState(); ACT.refresh(); } catch (e) { toast(e.message, true); } },
  'proj-del': (d) => confirmModal(L('Delete this project? Linked items are just unlinked.', '¿Borrar este proyecto? Lo vinculado solo se desvincula.'), async () => { await api('/api/projects', { body: { id: d.id, delete: true } }); await refreshState(); }),
  reset: () => confirmModal(L('Delete all synced data, snapshots and history on this device?', '¿Borrar todos los datos sincronizados, fotos e historial de este dispositivo?'), async () => { await api('/api/reset', { body: {} }); await refreshState(); toast(L('Data deleted', 'Datos borrados')); }),
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
  if (r?.redirecting) { $('#app').innerHTML = `<div class="boot">${L('Refreshing your Google session…', 'Renovando tu sesión de Google…')}</div>`; return; }
  if (r?.error) setTimeout(() => toast(r.error, true), 300);
  if (r?.ok) { setTimeout(() => toast(r.missing?.length ? L('Connected, but some permissions were not granted — see Settings.', 'Conectado, pero faltan algunos permisos — mira Ajustes.') : L('Google connected — syncing your data', 'Google conectado — sincronizando tus datos')), 300); if (route() === 'welcome' && ui.step === 1) ui.step = 2; }
  return load().then(() => { lastRunning = !!S?.run?.running; pollTimer = setTimeout(poll, lastRunning ? 1500 : 45000); });
}).catch((e) => { $('#app').innerHTML = `<div class="boot">${L('Could not start', 'No se pudo iniciar')}: ${esc(e.message)}</div>`; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
