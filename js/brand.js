// Brand layer: reads marca.json and applies name, logo, colors and font.
// To make a new branded version, change ONLY marca.json (and the files the brand tool generates).
const DEFAULT = {
  id: 'aios', nombre: 'AI Operating System', nombreCorto: 'AI OS', eslogan: 'Tu centro de mando diario',
  logo: '', iniciales: '', tipografia: 'Geist',
  colores: { principal: '#38BDF8', fondoOscuro: '#0A0D14', fondoClaro: '#F4F6F9' }, temaInicial: 'auto', soporte: '',
  idioma: 'es', formatoHora: '12h'
};
export const FONTS = ['Geist', 'Manrope', 'DM Sans', 'Plus Jakarta Sans', 'IBM Plex Sans', 'Outfit', 'Sora', 'Space Grotesk', 'Figtree', 'Work Sans'];

// ---- color helpers ----
const HEX = /^#([0-9a-f]{6})$/i;
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h) => { const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`;
function ensure(color, bg, toward, min = 4.5) { let c = color; for (let i = 0; i < 30 && contrast(c, bg) < min; i++) c = mix(c, toward, 0.08); return c; }
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'app';

export function normalize(raw) {
  const b = { ...DEFAULT, ...(raw || {}), colores: { ...DEFAULT.colores, ...((raw || {}).colores || {}) } };
  for (const k of ['principal', 'fondoOscuro', 'fondoClaro']) if (!HEX.test(b.colores[k] || '')) b.colores[k] = DEFAULT.colores[k];
  b.nombre = String(b.nombre || DEFAULT.nombre).slice(0, 60);
  b.nombreCorto = String(b.nombreCorto || b.nombre).slice(0, 14);
  b.id = slug((raw && (raw.id || raw.nombre)) || 'aios');
  b.iniciales = String(b.iniciales || b.nombre.split(/\s+/).map((w) => w[0]).join('').slice(0, 2)).toUpperCase().slice(0, 3);
  if (!FONTS.includes(b.tipografia)) b.tipografia = 'Geist';
  if (b.logo && !/^[\w.-]+\.(png|jpe?g|svg|webp)$/i.test(b.logo)) b.logo = '';
  if (!['auto', 'dark', 'light'].includes(b.temaInicial)) b.temaInicial = 'auto';
  if (!['es', 'en'].includes(b.idioma)) b.idioma = 'es';
  if (!['12h', '24h'].includes(b.formatoHora)) b.formatoHora = '12h';
  return b;
}

// All theme tokens derived from the brand colors (with automatic contrast fixes).
export function tokens(b) {
  const P = b.colores.principal; const D = b.colores.fondoOscuro; const L = b.colores.fondoClaro;
  const darkBg = lum(D) > 0.05 ? DEFAULT.colores.fondoOscuro : D;
  const lightBg = lum(L) < 0.8 ? DEFAULT.colores.fondoClaro : L;
  const pd = ensure(P, mix(darkBg, '#FFFFFF', 0.06), '#FFFFFF');
  const pl = ensure(P, '#FFFFFF', '#000000');
  const fgOn = (bg) => (contrast('#FFFFFF', bg) >= contrast('#06121F', bg) ? '#FFFFFF' : '#06121F');
  return {
    dark: { '--bg': darkBg, '--s1': mix(darkBg, '#FFFFFF', 0.045), '--s2': mix(darkBg, '#FFFFFF', 0.08), '--s3': mix(darkBg, '#FFFFFF', 0.12),
      '--pri': pd, '--pri-t': rgba(pd, 0.13), '--pri-b': rgba(pd, 0.4), '--btn-bg': pd, '--btn-fg': fgOn(pd), '--glow': `radial-gradient(ellipse at top,${rgba(pd, 0.1)},transparent 70%)` },
    light: { '--bg': lightBg, '--s1': '#FFFFFF', '--s2': mix(lightBg, '#FFFFFF', 0.4), '--s3': mix(lightBg, '#0B1220', 0.05),
      '--pri': pl, '--pri-t': rgba(pl, 0.09), '--pri-b': rgba(pl, 0.35), '--btn-bg': pl, '--btn-fg': fgOn(pl), '--glow': `radial-gradient(ellipse at top,${rgba(pl, 0.06)},transparent 70%)` },
    themeColor: darkBg
  };
}

export function logoHtml(b, size = 28) {
  if (b.logo) return `<img src="${b.logo}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:6px;flex:0 0 auto">`;
  const fs = b.iniciales.length > 2 ? 9 : 11;
  return `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true" style="flex:0 0 auto"><rect x="1" y="1" width="26" height="26" rx="7" fill="var(--pri)"/><text x="14" y="14" dy=".36em" text-anchor="middle" font-family="${b.tipografia}, system-ui, sans-serif" font-size="${fs}" font-weight="700" fill="var(--btn-fg)">${b.iniciales.replace(/[<>&"]/g, '')}</text></svg>`;
}

const css = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
export function apply(b, target = document) {
  const t = tokens(b);
  if (target.documentElement) target.documentElement.lang = b.idioma;
  let style = target.getElementById('brand-style');
  if (!style) { style = target.createElement('style'); style.id = 'brand-style'; target.head.appendChild(style); }
  style.textContent = `:root,:root[data-theme="dark"]{${css(t.dark)}}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){${css(t.light)}}}
:root[data-theme="light"]{${css(t.light)}}
body,button,input,select,textarea{font-family:'${b.tipografia}',system-ui,-apple-system,'Segoe UI',sans-serif}`;
  if (b.tipografia !== 'Geist' && !target.getElementById('brand-font')) {
    const l = target.createElement('link'); l.id = 'brand-font'; l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(b.tipografia).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
    target.head.appendChild(l);
  }
  const meta = (n, v) => { let m = target.querySelector(`meta[name="${n}"]`); if (!m) { m = target.createElement('meta'); m.name = n; target.head.appendChild(m); } m.content = v; };
  meta('theme-color', t.themeColor); meta('apple-mobile-web-app-title', b.nombreCorto);
  if (b.logo) { const ic = target.querySelector('link[rel="icon"]'); if (ic) ic.href = b.logo; }
}

async function load() {
  try { const r = await fetch('marca.json', { cache: 'no-cache' }); if (r.ok) return normalize(await r.json()); } catch {}
  return normalize(null);
}
export const BRAND = typeof document !== 'undefined' ? await load() : normalize(null);
