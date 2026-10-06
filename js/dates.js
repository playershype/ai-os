// Date helpers. Everything uses the device's local time zone. Reads dates written in Spanish or English.
import { L, LOCALE, H24 } from './i18n.js';
export const DAY = 86400000;
export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const endOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';

export function fmtTime(d) {
  d = new Date(d);
  let h = d.getHours(); const m = d.getMinutes();
  if (H24) return `${pad(h)}:${pad(m)}`;
  const pm = h >= 12; h = h % 12 || 12;
  return `${h}:${pad(m)} ${L(pm ? 'PM' : 'AM', pm ? 'p. m.' : 'a. m.')}`;
}
export function fmtDay(d) { return new Date(d).toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' }); }
export function weekdayShort(d) { return new Date(d).toLocaleDateString(LOCALE, { weekday: 'short' }); }
export function relDay(d, now = new Date()) {
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / DAY);
  if (diff === 0) return L('today', 'hoy');
  if (diff === 1) return L('tomorrow', 'mañana');
  if (diff === -1) return L('yesterday', 'ayer');
  if (diff > 1 && diff < 7) return weekdayShort(d);
  return fmtDay(d);
}
export function ago(d, now = new Date()) {
  const s = (now - new Date(d)) / 1000;
  if (s < 60) return L('just now', 'ahora');
  if (s < 3600) return Math.round(s / 60) + ' min';
  if (s < 86400) return Math.round(s / 3600) + ' h';
  return Math.round(s / 86400) + ' d';
}
export function parseHM(hm) { const [h, m] = String(hm || '09:00').split(':').map(Number); return { h: h || 0, m: m || 0 }; }

// Whole-word regex that also works with accented letters (ñ, á, é…).
const W = (s) => new RegExp(`(?<![\\p{L}\\d])(?:${s})(?![\\p{L}\\d])`, 'u');
const WD = [
  ['sunday|sun', 'domingo|dom'], ['monday|mon', 'lunes|lun'], ['tuesday|tue|tues', 'martes|mar'], ['wednesday|wed', 'miércoles|miercoles|mié|mie'],
  ['thursday|thu|thurs', 'jueves|jue'], ['friday|fri', 'viernes|vie'], ['saturday|sat', 'sábado|sabado|sáb|sab']
];
const MONTHS = [
  'jan|january|ene|enero', 'feb|february|febrero', 'mar|march|marzo', 'apr|april|abr|abril', 'may|mayo', 'jun|june|junio',
  'jul|july|julio', 'aug|august|ago|agosto', 'sep|sept|september|septiembre|setiembre', 'oct|october|octubre', 'nov|november|noviembre', 'dec|december|dic|diciembre'
];
const monthIndex = (w) => MONTHS.findIndex((m) => m.split('|').includes(w.replace('.', '')));
const MONTH_RE = MONTHS.join('|');

// Parses "by Friday", "tomorrow morning", "Oct 9", "el viernes", "mañana por la mañana", "9 de octubre", "a las 3 pm"…
// Returns { date: Date|null, hasTime: bool, matched: string|null }. Never guesses when nothing matches.
export function parseWhen(text, base = new Date(), morningMeans = '09:00') {
  const t = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
  let day = null; let matched = null; let m;
  const b = startOfDay(base);
  const nextMon = () => addDays(b, ((1 - b.getDay() + 7) % 7) || 7);
  // "mañana" alone = tomorrow; "la mañana" / "por la mañana" = morning
  const tomorrowEs = /(?<!la |por la |en la |de la )(?<![\p{L}])mañana(?![\p{L}])/u.test(t);
  if ((m = t.match(W('today|tonight|this evening|end of (?:the )?day|eod|hoy|esta noche|esta tarde|fin del día|fin del dia')))) { day = b; matched = m[0]; }
  else if ((m = t.match(W('tomorrow|pasado mañana'))) || tomorrowEs) {
    if (m && m[0] === 'pasado mañana') { day = addDays(b, 2); matched = m[0]; } else { day = addDays(b, 1); matched = m ? m[0] : 'mañana'; }
  }
  else if ((m = t.match(W('end of (?:the )?week|eow|this week|fin de semana|esta semana|finales de (?:la|esta) semana')))) { day = addDays(b, (5 - b.getDay() + 7) % 7); matched = m[0]; }
  else if ((m = t.match(W('early next week|principios de la (?:próxima|proxima) semana|inicios de la (?:próxima|proxima) semana')))) { day = addDays(nextMon(), 1); matched = m[0]; }
  else if ((m = t.match(W('next week|(?:la )?(?:próxima|proxima) semana|la semana que viene')))) { day = nextMon(); matched = m[0]; }
  else if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) { day = new Date(+m[1], +m[2] - 1, +m[3]); matched = m[0]; }
  else if ((m = t.match(new RegExp(`(?<![\\p{L}])(${MONTH_RE})\\.? (\\d{1,2})(?:st|nd|rd|th)?(?!\\d)`, 'u')))) { day = new Date(b.getFullYear(), monthIndex(m[1]), +m[2]); matched = m[0]; }
  else if ((m = t.match(new RegExp(`(?<!\\d)(\\d{1,2}) (?:de )?(${MONTH_RE})(?![\\p{L}])`, 'u')))) { day = new Date(b.getFullYear(), monthIndex(m[2]), +m[1]); matched = m[0]; }
  else if ((m = t.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/))) {
    // Spanish order is day/month; English is month/day. Prefer the reading that is a real date.
    const a = +m[1]; const c = +m[2];
    const dm = a <= 31 && c <= 12; const md = a <= 12 && c <= 31;
    if (dm || md) { const useDM = L(!md && dm, dm); day = useDM ? new Date(b.getFullYear(), c - 1, a) : new Date(b.getFullYear(), a - 1, c); matched = m[0]; }
  } else {
    for (let i = 0; i < 7; i++) {
      if ((m = t.match(W(`(?:next |this |on |by |el |este |próximo |proximo |para el |antes del )?(?:${WD[i][0]}|${WD[i][1]})`)))) {
        let diff = (i - b.getDay() + 7) % 7; if (diff === 0) diff = 7;
        day = addDays(b, diff); matched = m[0].trim(); break;
      }
    }
  }
  if (day && day < addDays(b, -60)) day.setFullYear(day.getFullYear() + 1);
  let hasTime = false; let hh = null; let mm = 0;
  if ((m = t.match(/(?<!\d)(\d{1,2})(?::(\d{2}))? ?(am|pm|a\. ?m\.?|p\. ?m\.?)(?![\p{L}])/u))) { hh = (+m[1] % 12) + (/^p/.test(m[3]) ? 12 : 0); mm = +(m[2] || 0); hasTime = true; }
  else if ((m = t.match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/))) { hh = +m[1]; mm = +m[2]; hasTime = true; }
  else if ((m = t.match(W('a las (\\d{1,2})')))) { hh = +m[0].replace(/\D/g, ''); if (hh >= 1 && hh <= 7) hh += 12; hasTime = true; }
  else if (t.match(W('noon|mediodía|mediodia'))) { hh = 12; hasTime = true; }
  else if (t.match(W('morning|(?:por|en) la mañana|a primera hora'))) { const p = parseHM(morningMeans); hh = p.h; mm = p.m; hasTime = true; }
  else if (t.match(W('afternoon|(?:por|en) la tarde|esta tarde'))) { hh = 14; hasTime = true; }
  else if (t.match(W('evening|tonight|(?:por|en) la noche|esta noche'))) { hh = 18; hasTime = true; }
  if (!day && hasTime) day = b;
  if (!day || isNaN(day)) return { date: null, hasTime: false, matched: null };
  const d = new Date(day);
  if (hasTime) d.setHours(hh, mm, 0, 0); else d.setHours(23, 59, 0, 0);
  return { date: d, hasTime, matched };
}
