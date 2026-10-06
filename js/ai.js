// AI client (Anthropic). Used for interpretation, classification, extraction and writing —
// never as the database. Everything works without a key, using simpler built-in rules.
import { config, saveConfig } from './store.js';
import { L } from './i18n.js';

const API = 'https://api.anthropic.com/v1';
const HEADERS = () => ({ 'x-api-key': config.anthropic.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' });
export const aiEnabled = () => !!config.anthropic.apiKey;

export async function pickModel(force = false) {
  if (config.anthropic.model && !force) return config.anthropic.model;
  const res = await fetch(`${API}/models?limit=50`, { headers: HEADERS() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || `Anthropic API error ${res.status}`);
  const ids = (body.data || []).map((m) => m.id);
  const model = ids.find((id) => /sonnet/i.test(id)) || ids[0];
  if (!model) throw new Error(L('No models available for this API key.', 'No hay modelos disponibles para esta clave.'));
  config.anthropic.model = model; config.anthropic.autoModel = true; saveConfig();
  return model;
}

export const usage = { calls: 0, inputTokens: 0, outputTokens: 0, lastError: null };

export async function ask({ system, prompt, maxTokens = 2000 }) {
  if (!aiEnabled()) throw new Error(L('AI is not set up. Add an Anthropic API key in Settings.', 'La IA no está configurada. Agrega una clave de Anthropic en Ajustes.'));
  const model = await pickModel();
  const res = await fetch(`${API}/messages`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || `Anthropic API error ${res.status}`;
    usage.lastError = msg;
    if (res.status === 404 && config.anthropic.autoModel) { config.anthropic.model = ''; saveConfig(); }
    throw new Error(msg);
  }
  usage.calls++; usage.inputTokens += body.usage?.input_tokens || 0; usage.outputTokens += body.usage?.output_tokens || 0; usage.lastError = null;
  return (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
}

export async function askJson(opts) {
  const text = await ask({ ...opts, system: opts.system + '\n\nRespond with a single JSON object only. No prose, no code fences.' });
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(L('AI returned an unreadable answer.', 'La IA devolvió una respuesta ilegible.'));
  return JSON.parse(text.slice(start, end + 1));
}

export const HONESTY = `Rules you must follow:
- Use ONLY the data provided. Never invent people, deadlines, commitments, meetings, documents, statuses or document contents.
- Label every statement: FACT (directly stated in a source), INFERENCE (a reasonable reading that is not stated outright), RECOMMENDATION (a suggested action).
- Prefer cautious wording for inferences ("Possible follow-up detected", "may"). If context is insufficient, say so.
- Cite the ids of the items you used in "sources". Only use ids that appear in the data.
- Be concise. No filler, no exclamation marks.`;
