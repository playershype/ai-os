// Integration layer (browser): Google sign-in by redirect (no server, no client secret) + read-only API calls.
import { config, saveConfig } from './store.js';

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/tasks.readonly'
];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export class ReconnectNeeded extends Error {}

export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
export const jsOrigin = () => location.origin;
export const isConfigured = () => !!config.google.clientId;
export const isConnected = () => !!config.google.everConnected;
export const tokenValid = () => !!(config.google.token?.access_token && Date.now() < config.google.token.expires_at);

// Sends the browser to Google; Google sends it back with a 1-hour access token.
export function startAuth(returnRoute = '#/today', { consent = false } = {}) {
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  sessionStorage.setItem('aios-oauth-state', state);
  sessionStorage.setItem('aios-return', returnRoute.startsWith('#') ? returnRoute : '#/today');
  const p = new URLSearchParams({ client_id: config.google.clientId, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPES.join(' '), include_granted_scopes: 'true', state });
  if (config.google.email) p.set('login_hint', config.google.email);
  if (consent || !config.google.everConnected) p.set('prompt', 'consent');
  location.assign(`${AUTH_URL}?${p}`);
}

// Call once on page load. Returns {ok}, {error} or null.
export async function handleRedirect() {
  const h = location.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error)=/.test(h)) return null;
  const q = new URLSearchParams(h);
  const back = sessionStorage.getItem('aios-return') || '#/today';
  const expected = sessionStorage.getItem('aios-oauth-state');
  sessionStorage.removeItem('aios-oauth-state');
  history.replaceState(null, '', redirectUri() + back);
  if (q.get('error')) return { error: q.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : `Google: ${q.get('error')}` };
  if (!expected || q.get('state') !== expected) return { error: 'Sign-in link expired — please try again.' };
  const granted = (q.get('scope') || '').split(' ');
  const missing = SCOPES.filter((s) => !granted.includes(s));
  config.google.token = { access_token: q.get('access_token'), expires_at: Date.now() + (Number(q.get('expires_in') || 3600) - 60) * 1000 };
  config.google.grantedScopes = granted;
  saveConfig();
  try {
    const profile = await gget('https://gmail.googleapis.com/gmail/v1/users/me/profile');
    config.google.email = profile.emailAddress;
  } catch (e) { if (!missing.length) return { error: e.message }; }
  config.google.everConnected = true;
  config.google.connectedAt ||= new Date().toISOString();
  saveConfig();
  sessionStorage.removeItem('aios-auto-auth');
  return { ok: true, missing };
}

export async function gget(url, params) {
  const full = params ? `${url}?${new URLSearchParams(params)}` : url;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!tokenValid()) throw new ReconnectNeeded('Google session expired — tap “Refresh Google”.');
    const res = await fetch(full, { headers: { Authorization: `Bearer ${config.google.token.access_token}` } });
    if (res.status === 401) { delete config.google.token; saveConfig(); throw new ReconnectNeeded('Google session expired — tap “Refresh Google”.'); }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) { await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); continue; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body.error?.message || res.statusText;
      if (res.status === 403 && /has not been used|is disabled/i.test(msg)) throw new Error(`This Google API is not enabled in your Google Cloud project. ${msg}`);
      if (res.status === 403 && /insufficient/i.test(msg)) throw new ReconnectNeeded('Missing permission — reconnect Google and tick every box.');
      throw new Error(`Google API ${res.status}: ${msg}`);
    }
    return body;
  }
}

export function disconnect() {
  const t = config.google.token?.access_token;
  if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST', mode: 'no-cors' }).catch(() => {});
  delete config.google.token; delete config.google.email; delete config.google.grantedScopes; delete config.google.everConnected;
  saveConfig();
}

export async function pool(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = { __error: e }; } }
  }));
  return out;
}

const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
export async function gmailList(q, max) {
  const ids = []; let pageToken;
  do {
    const r = await gget(`${GM}/messages`, { q, maxResults: Math.min(100, max - ids.length), ...(pageToken ? { pageToken } : {}) });
    for (const m of r.messages || []) ids.push(m.id);
    pageToken = r.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids;
}
export const gmailGet = (id) => gget(`${GM}/messages/${id}`, { format: 'full' });

export async function calendarEvents(timeMin, timeMax) {
  const items = []; let pageToken;
  do {
    const r = await gget('https://www.googleapis.com/calendar/v3/calendars/primary/events', { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250', ...(pageToken ? { pageToken } : {}) });
    items.push(...(r.items || [])); pageToken = r.nextPageToken;
  } while (pageToken && items.length < 1000);
  return items;
}
export async function driveRecent(since) {
  const r = await gget('https://www.googleapis.com/drive/v3/files', { q: `modifiedTime > '${since.toISOString()}' and trashed = false`, orderBy: 'modifiedTime desc', pageSize: '60', fields: 'files(id,name,mimeType,modifiedTime,webViewLink,lastModifyingUser(displayName,emailAddress,me),owners(displayName,emailAddress))' });
  return r.files || [];
}
export async function googleTasks() {
  const lists = await gget('https://tasks.googleapis.com/tasks/v1/users/@me/lists', { maxResults: '20' });
  const out = [];
  for (const l of lists.items || []) {
    const r = await gget(`https://tasks.googleapis.com/tasks/v1/lists/${l.id}/tasks`, { showCompleted: 'true', showHidden: 'true', maxResults: '100' });
    for (const t of r.items || []) out.push({ ...t, listTitle: l.title });
  }
  return out;
}
