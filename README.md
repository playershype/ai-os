# AI Operating System — web version (phone-first)

A personal command center that runs entirely in your browser and is hosted free on GitHub Pages.
It reads Gmail, Google Calendar, Google Drive and Google Tasks (read-only) and answers every morning:
*what matters today, what changed, what needs my attention, and what should I do next?*

**Setup: open `GUIA.html` (Spanish, step by step).**

- No server and no install: data is stored only in the browser (localStorage) on each device.
- Google sign-in uses the OAuth token flow by redirect (Client ID only, no secret). Sessions last ~1 hour; the app refreshes on open.
- The morning brief is generated the first time you open the app after your brief time; live updates every 15 min while open.
- Optional AI (Anthropic API key, stored only on the device). Every AI statement is labeled FACT / INFERENCE / RECOMMENDATION, source ids are validated, and extracted commitments must quote the email exactly.
- Spanish/English and white-label branding are driven by `marca.json`, `js/brand.js` and `js/i18n.js`; the default brand keeps the existing `aios:` localStorage namespace so current data is preserved.
- Layers: `js/google.js` + `js/connectors.js` (integration), `js/store.js` (data), `js/core.js` + `js/plan.js` + `js/assist.js` + `js/ai.js` (intelligence), `js/pipeline.js` (morning pipeline), `js/api.js` (actions), `js/brand.js` + `js/i18n.js` (brand/language), `app.js` (presentation).
