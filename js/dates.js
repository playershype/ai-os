// Date helpers. Everything uses the computer's local time zone.
export const DAY = 86400000;
export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const endOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';

const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function fmtTime(d) {
  d = new Date(d);
  let h = d.getHours(); const m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
}
export function fmtDay(d) {
  d = new Date(d);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
export function relDay(d, now = new Date()) {
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return new Date(d).toLocaleDateString('en-US', { weekday: 'short' });
  return fmtDay(d);
}
export function ago(d, now = new Date()) {
  const s = (now - new Date(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  return Math.round(s / 86400) + 'd';
}
export function parseHM(hm) { const [h, m] = String(hm || '09:00').split(':').map(Number); return { h: h || 0, m: m || 0 }; }

// Parses phrases like "by Friday", "tomorrow morning", "Oct 9", "end of week", "3pm".
// Returns { date: Date|null, hasTime: bool, matched: string|null }. Never guesses when nothing matches.
export function parseWhen(text, base = new Date(), morningMeans = '09:00') {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  let day = null; let matched = null;
  const b = startOfDay(base);
  let m;
  if (/\b(today|tonight|this evening|end of (the )?day|eod)\b/.test(t)) { day = b; matched = t.match(/\b(today|tonight|this evening|end of (the )?day|eod)\b/)[0]; }
  else if (/\btomorrow\b/.test(t)) { day = addDays(b, 1); matched = 'tomorrow'; }
  else if ((m = t.match(/\b(end of (the )?week|eow|this week)\b/))) { const diff = (5 - b.getDay() + 7) % 7; day = addDays(b, diff); matched = m[0]; }
  else if ((m = t.match(/\bearly next week\b/))) { const diff = ((1 - b.getDay() + 7) % 7) || 7; day = addDays(b, diff + 1); matched = m[0]; }
  else if ((m = t.match(/\bnext week\b/))) { const diff = ((1 - b.getDay() + 7) % 7) || 7; day = addDays(b, diff); matched = m[0]; }
  else if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) { day = new Date(+m[1], +m[2] - 1, +m[3]); matched = m[0]; }
  else if ((m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})(st|nd|rd|th)?\b/))) {
    day = new Date(b.getFullYear(), MONTHS.indexOf(m[1]), +m[2]); if (day < addDays(b, -60)) day.setFullYear(day.getFullYear() + 1); matched = m[0];
  } else if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/))) {
    day = new Date(b.getFullYear(), +m[1] - 1, +m[2]); if (isNaN(day) || +m[1] > 12) day = null; else matched = m[0];
  } else {
    for (let i = 0; i < 7; i++) {
      const re = new RegExp(`\\b(next |this |on |by )?(${WD[i]}|${WD_SHORT[i]})\\b`);
      if ((m = t.match(re))) {
        let diff = (i - b.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        day = addDays(b, diff); matched = m[0].trim(); break;
      }
    }
  }
  let hasTime = false; let hh = null; let mm = 0;
  if ((m = t.match(/\b(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/))) { hh = (+m[1] % 12) + (m[3] === 'pm' ? 12 : 0); mm = +(m[2] || 0); hasTime = true; }
  else if ((m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))) { hh = +m[1]; mm = +m[2]; hasTime = true; }
  else if (/\bnoon\b/.test(t)) { hh = 12; hasTime = true; }
  else if (/\bmorning\b/.test(t)) { const p = parseHM(morningMeans); hh = p.h; mm = p.m; hasTime = true; }
  else if (/\bafternoon\b/.test(t)) { hh = 14; hasTime = true; }
  else if (/\b(evening|tonight)\b/.test(t)) { hh = 18; hasTime = true; }
  if (!day && hasTime) day = b;
  if (!day) return { date: null, hasTime: false, matched: null };
  const d = new Date(day);
  if (hasTime) d.setHours(hh, mm, 0, 0); else d.setHours(23, 59, 0, 0);
  return { date: d, hasTime, matched };
}
