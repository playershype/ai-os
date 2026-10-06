// Language layer. The language comes from marca.json ("idioma": "es" or "en").
import { BRAND } from './brand.js';
export const LANG = BRAND.idioma === 'en' ? 'en' : 'es';
export const LOCALE = LANG === 'es' ? 'es-419' : 'en-US';
export const H24 = BRAND.formatoHora === '24h';
// L('English', 'Español') — returns the text for the current language.
export const L = (en, es) => (LANG === 'es' ? es : en);
// Plural helper: P(n, 'source', 'sources', 'fuente', 'fuentes')
export const P = (n, en1, enN, es1, esN) => `${n} ${LANG === 'es' ? (n === 1 ? es1 : esN) : (n === 1 ? en1 : enN)}`;
export const AI_LANG = () => (LANG === 'es' ? 'Write every text field in neutral Latin American Spanish (keep names, quotes and email subjects exactly as in the source).' : 'Write in English.');
