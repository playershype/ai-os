// Brand creator: edit a brand, preview it live, download the files for one client's copy of the app.
import { BRAND, FONTS, normalize, tokens, logoHtml, contrast } from './brand.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BASE = {
  dark: { '--bd': 'rgba(255,255,255,.08)', '--bd2': 'rgba(255,255,255,.14)', '--tx': '#E2E8F0', '--mu': '#A3B1C4', '--fa': '#7F8DA3', '--ok': '#34D399', '--ok-t': 'rgba(16,185,129,.14)', '--warn': '#FBBF24', '--warn-t': 'rgba(245,158,11,.14)', '--crit': '#F87171', '--crit-t': 'rgba(239,68,68,.14)', 'color-scheme': 'dark' },
  light: { '--bd': 'rgba(15,23,42,.09)', '--bd2': 'rgba(15,23,42,.16)', '--tx': '#0B1220', '--mu': '#475569', '--fa': '#5B6B80', '--ok': '#047857', '--ok-t': 'rgba(4,120,87,.10)', '--warn': '#B45309', '--warn-t': 'rgba(180,83,9,.10)', '--crit': '#B91C1C', '--crit-t': 'rgba(185,28,28,.08)', 'color-scheme': 'light' }
};
const FIELDS = ['nombre', 'nombreCorto', 'eslogan', 'tipografia', 'idioma', 'formatoHora', 'iniciales', 'temaInicial', 'soporte', 'id'];
const COLORS = ['principal', 'fondoOscuro', 'fondoClaro'];
let logo = null; // { dataUrl, name }
let idTouched = false;
const derivedInitials = (n) => String(n || '').split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w)).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

$('#tipografia').innerHTML = FONTS.map((f) => `<option>${f}</option>`).join('');

function fill(b) {
  for (const k of FIELDS) $('#' + k).value = b[k] || '';
  if (b.iniciales === derivedInitials(b.nombre)) $('#iniciales').value = '';
  for (const k of COLORS) { $('#' + k).value = b.colores[k]; $('#' + k + '-pick').value = b.colores[k]; }
  logo = b.logo ? { dataUrl: b.logo, name: b.logo, existing: true } : null;
  idTouched = b.id !== 'aios';
  update();
}
function current() {
  const raw = {}; for (const k of FIELDS) raw[k] = $('#' + k).value.trim();
  raw.colores = {}; for (const k of COLORS) raw.colores[k] = $('#' + k).value.trim();
  if (!idTouched) raw.id = raw.nombre;
  if (!raw.iniciales) raw.iniciales = derivedInitials(raw.nombre);
  const b = normalize(raw);
  b.logo = logo ? 'logo.png' : '';
  return b;
}
function loadFont(f) {
  if (f === 'Geist' || document.getElementById('font-' + f.replace(/\s/g, ''))) return;
  const l = document.createElement('link'); l.id = 'font-' + f.replace(/\s/g, ''); l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${f.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(l);
}
function setVars(el, vars) { for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v); }

function paneHtml(b, mode) {
  const es = b.idioma !== 'en'; const T = (en, sp) => (es ? sp : en);
  const lg = logo ? `<img src="${esc(logo.dataUrl)}" alt="" width="28" height="28" style="width:28px;height:28px;object-fit:contain;border-radius:6px">` : logoHtml(b, 28);
  return `<div class="pv-top">${lg}<span><b style="display:block;font-size:15px">${esc(b.nombre)}</b><span class="mono faint" style="font-size:11px">${T('Today', 'Hoy')} · ${mode === 'dark' ? T('dark mode', 'modo oscuro') : T('light mode', 'modo claro')}</span></span><span class="grow"></span><span class="btn btn-p btn-sm">+ ${T('Capture', 'Capturar')}</span></div>
  <div class="pv-body">
    <div class="card brief" style="padding:16px"><span class="eyebrow c-info">${T('Morning brief · 6:02 AM', 'Resumen matutino · 6:02 a. m.')}</span><div class="h3" style="margin:8px 0 6px;font-size:18px">${T('Good morning. Here’s what matters today.', 'Buenos días. Esto es lo importante hoy.')}</div>
      <div class="row" style="gap:6px"><span class="pill l-crit">${T('1 critical', '1 crítica')}</span><span class="pill l-warn">${T('2 overdue', '2 vencidos')}</span><span class="pill l-info">${T('3 need a reply', '3 por responder')}</span></div>
      <div style="margin-top:10px;font-size:13px"><span class="tag t-FACT">${T('FACT', 'HECHO')}</span> <b>${T('Budget model due 11:00 AM.', 'El presupuesto vence a las 11:00 a. m.')}</b> <span class="muted">${T('Needed for the 2:00 PM review.', 'Se necesita para la revisión de las 2:00 p. m.')}</span></div>
      <div style="margin-top:6px;font-size:13px"><span class="tag t-RECOMMENDATION">${T('RECOMMENDATION', 'RECOMENDACIÓN')}</span> <span class="muted">${T('Use 10:00–10:45 for it.', 'Úsalo de 10:00 a 10:45.')}</span></div></div>
    <div class="card" style="padding:12px 14px"><div class="row"><span class="rank mono l-crit">1</span><b class="grow">${T('Finalize budget model', 'Terminar el presupuesto')}</b><span class="pill l-crit">${T('Critical', 'Crítica')}</span></div>
      <div class="row" style="margin-top:10px"><span class="btn btn-p btn-sm">${T('Mark done', 'Marcar hecha')}</span><span class="btn btn-sm">${T('Open', 'Abrir')}</span><span class="btn btn-g btn-sm">${T('Why am I seeing this?', '¿Por qué veo esto?')}</span></div></div>
    <div class="row"><span class="chipbtn" aria-pressed="true" style="display:inline-flex;align-items:center">${T('Needs reply', 'Por responder')} · 3</span><span class="chipbtn" style="display:inline-flex;align-items:center">${T('Waiting on', 'En espera')} · 2</span></div>
    ${b.eslogan ? `<div class="small faint">${esc(b.eslogan)}</div>` : ''}
  </div>`;
}

async function drawIcon(b, t, size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.fillStyle = t.dark['--bg']; g.fillRect(0, 0, size, size);
  if (logo) {
    const img = new Image(); img.src = logo.dataUrl; await img.decode().catch(() => {});
    const box = size * 0.62; const r = Math.min(box / (img.naturalWidth || 1), box / (img.naturalHeight || 1));
    const w = (img.naturalWidth || box) * r; const h = (img.naturalHeight || box) * r;
    g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  } else {
    const m = size * 0.2; const s = size - 2 * m; const rad = s * 0.24;
    g.fillStyle = t.dark['--pri']; g.beginPath(); g.roundRect(m, m, s, s, rad); g.fill();
    await document.fonts.load(`700 ${Math.round(size / 3)}px "${b.tipografia}"`).catch(() => {});
    g.fillStyle = t.dark['--btn-fg']; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(s * (b.iniciales.length > 2 ? 0.34 : 0.44))}px "${b.tipografia}", system-ui, sans-serif`;
    g.fillText(b.iniciales, size / 2, size / 2 + size * 0.015);
  }
  return c;
}

let seq = 0;
async function update() {
  const my = ++seq;
  const b = current(); const t = tokens(b);
  if (!idTouched) $('#id').value = b.id;
  $('#iniciales').placeholder = b.iniciales;
  loadFont(b.tipografia);
  for (const mode of ['dark', 'light']) {
    const el = $('#pv-' + mode);
    setVars(el, { ...BASE[mode], ...t[mode], 'font-family': `'${b.tipografia}', system-ui, sans-serif` });
    el.innerHTML = paneHtml(b, mode);
  }
  $('#hdr-logo').innerHTML = logo ? `<img src="${esc(logo.dataUrl)}" alt="" width="28" height="28" style="width:28px;height:28px;object-fit:contain">` : logoHtml(b, 28);
  const notes = [];
  if (t.dark['--pri'] !== b.colores.principal.toUpperCase()) notes.push('En modo oscuro aclaramos un poco el color principal para que se lea bien.');
  if (t.light['--pri'] !== b.colores.principal.toUpperCase()) notes.push('En modo claro oscurecimos un poco el color principal para que se lea bien.');
  if (b.colores.fondoOscuro !== t.dark['--bg']) notes.push('El fondo oscuro elegido es demasiado claro; se usa el fondo oscuro por defecto.');
  const hue = (h) => { const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255); const mx = Math.max(r, g, bl); const mn = Math.min(r, g, bl); if (mx === mn) return null; const d = mx - mn; let x = mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
  const hp = hue(b.colores.principal);
  if (hp !== null && (hp < 15 || hp > 345 || (hp > 25 && hp < 50))) notes.push('Este color se parece a los colores de alerta (rojo/ámbar). Se puede usar, pero las alertas se distinguirán menos.');
  if (contrast(b.colores.principal, '#808080') < 1.3) notes.push('El color principal es muy gris: puede costar distinguir los botones.');
  $('#notes').innerHTML = notes.map((n) => `<div class="note">${esc(n)}</div>`).join('');
  const icons = await Promise.all([180, 96, 60].map((s) => drawIcon(b, t, s)));
  if (my !== seq) return;
  const box = $('#icons'); box.innerHTML = '';
  icons.forEach((c, i) => { const wrap = document.createElement('div'); wrap.style.textAlign = 'center'; wrap.append(c); const cap = document.createElement('div'); cap.className = 'small muted'; cap.style.marginTop = '6px'; cap.textContent = i === 0 ? b.nombreCorto : ''; wrap.append(cap); box.append(wrap); });
}

// ---- tiny zip writer (no compression) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (d) => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255]; const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name); const data = f.data; const crc = crc32(data);
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(local, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
const canvasBytes = (c) => new Promise((r) => c.toBlob(async (b) => r(new Uint8Array(await b.arrayBuffer())), 'image/png'));

async function download() {
  const b = current(); const t = tokens(b); const enc = new TextEncoder();
  const marca = { id: b.id, nombre: b.nombre, nombreCorto: b.nombreCorto, eslogan: b.eslogan, logo: b.logo, iniciales: b.iniciales, tipografia: b.tipografia, colores: b.colores, temaInicial: b.temaInicial, soporte: b.soporte, idioma: b.idioma, formatoHora: b.formatoHora };
  const manifest = { name: b.nombre, short_name: b.nombreCorto, description: b.eslogan || b.nombre, start_url: './#/today', scope: './', display: 'browser', background_color: t.dark['--bg'], theme_color: t.dark['--bg'],
    icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
  const files = [
    { name: 'marca.json', data: enc.encode(JSON.stringify(marca, null, 2) + '\n') },
    { name: 'manifest.webmanifest', data: enc.encode(JSON.stringify(manifest, null, 2) + '\n') }
  ];
  for (const s of [180, 192, 512]) files.push({ name: `icon-${s}.png`, data: await canvasBytes(await drawIcon(b, t, s)) });
  if (logo) {
    const img = new Image(); img.src = logo.dataUrl; await img.decode().catch(() => {});
    const c = document.createElement('canvas'); const k = Math.min(1, 512 / Math.max(img.naturalWidth || 512, img.naturalHeight || 512));
    c.width = Math.max(1, Math.round((img.naturalWidth || 512) * k)); c.height = Math.max(1, Math.round((img.naturalHeight || 512) * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    files.push({ name: 'logo.png', data: await canvasBytes(c) });
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(zip(files)); a.download = `marca-${b.id}.zip`;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// ---- events ----
document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'id') idTouched = !!e.target.value.trim();
  if (id.endsWith('-pick')) $('#' + id.replace('-pick', '')).value = e.target.value.toUpperCase();
  if (COLORS.includes(id) && /^#[0-9a-f]{6}$/i.test(e.target.value)) $('#' + id + '-pick').value = e.target.value;
  update();
});
document.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') update(); });
$('#logo-file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 3e6) { alert('El logo debe pesar menos de 3 MB.'); return; }
  const r = new FileReader(); r.onload = () => { logo = { dataUrl: r.result, name: f.name }; $('#logo-name').textContent = f.name; $('#logo-prev').innerHTML = `<img src="${esc(r.result)}" alt="" width="36" height="36" style="width:36px;height:36px;object-fit:contain">`; update(); }; r.readAsDataURL(f);
});
$('#logo-clear').addEventListener('click', () => { logo = null; $('#logo-file').value = ''; $('#logo-name').textContent = 'Sin logo: se usan las iniciales.'; $('#logo-prev').innerHTML = ''; update(); });
$('#download').addEventListener('click', () => download().catch((e) => alert('No se pudo crear el paquete: ' + e.message)));
$('#reset').addEventListener('click', () => fill(BRAND));
fill(BRAND);
if (BRAND.logo) { $('#logo-name').textContent = BRAND.logo; $('#logo-prev').innerHTML = `<img src="${esc(BRAND.logo)}" alt="" width="36" height="36" style="width:36px;height:36px;object-fit:contain">`; }
