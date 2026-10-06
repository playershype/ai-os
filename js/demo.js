// SAMPLE DATA for trying the app before connecting Google. Everything here is fictional
// and is shown with a "DEMO DATA" banner. It is removed as soon as a real account is connected.
import { addDays, startOfDay } from './dates.js';
import { L, LOCALE } from './i18n.js';

export const DEMO_ME = 'you@demo.example';
const WD = L(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']);

export function demoData(now) {
  const H = 3600000;
  const today = startOfDay(now);
  const at = (dayOffset, h, m = 0) => { const d = addDays(today, dayOffset); d.setHours(h, m, 0, 0); return d; };
  const P = {
    sarah: { name: L('Sarah Miller', 'Sara Méndez'), email: 'sarah.miller@northpeak.example' },
    david: { name: L('David Chen', 'David Chávez'), email: 'david.chen@northpeak.example' },
    john: { name: L('John Smith', 'Juan Salinas'), email: 'john.smith@apexcorp.example' },
    maria: { name: L('Maria Lopez', 'María López'), email: 'maria.lopez@apexcorp.example' },
    elena: { name: L('Elena Vance', 'Elena Vargas'), email: 'elena.vance@northpeak.example' },
    priya: { name: L('Priya Nair', 'Paula Rivas'), email: 'priya.nair@northpeak.example' },
    me: { name: L('You', 'Tú'), email: DEMO_ME }
  };
  let n = 0;
  const msg = (thread, from, to, subject, body, date, opts = {}) => ({
    id: 'demo_m' + (++n), source: 'demo', sourceId: 'm' + n, threadId: 'demo_t' + thread, from, to: [to], cc: [], subject, snippet: body.slice(0, 140), body,
    date: new Date(date).toISOString(), labels: opts.labels || (from.email === DEMO_ME ? ['SENT'] : ['INBOX', 'UNREAD', 'IMPORTANT']),
    isSent: from.email === DEMO_ME, inInbox: from.email !== DEMO_ME, isUnread: from.email !== DEMO_ME, bulk: !!opts.bulk, link: '#demo', demo: true
  });
  const fiveAgo = new Date(now - 5 * 24 * H);
  const promisedDay = WD[addDays(today, -2).getDay()];
  const elenaDay = WD[addDays(today, -1).getDay()];
  const messages = [
    msg(1, P.sarah, P.me, L('Updated AWS cost estimate', 'Costos de AWS actualizados'), L('Hi — attached are the revised AWS cost numbers for Q4. Please use these in the budget model before the Finance Review today. They are higher than what is in v3.', 'Hola, te adjunto los costos revisados de AWS para el Q4. Por favor úsalos en el modelo de presupuesto antes de la Revisión Financiera de hoy. Son más altos que los de la v3.'), now - 14 * H),
    msg(2, P.sarah, P.me, L('Re: Q4 runway estimates', 'Re: Proyección de caja Q4'), L('Should the hiring assumptions change before the 2 PM review? I need a yes/no on the revised margin by noon today.', '¿Cambiamos los supuestos de contratación antes de la revisión de las 2 p. m.? Necesito un sí o no sobre el margen revisado antes del mediodía.'), now - 1 * H),
    msg(3, P.me, P.john, L('Re: Implementation timeline', 'Re: Cronograma de implementación'), L(`Thanks John. I'll send the revised timeline by ${promisedDay}.`, `Gracias Juan. Te envío el cronograma revisado el ${promisedDay}.`), fiveAgo),
    msg(3, P.john, P.me, L('Re: Implementation timeline', 'Re: Cronograma de implementación'), L('Hi, following up on the revised delivery timeline you mentioned. Could you send it before our call? We will get you our security requirements early next week.', 'Hola, te escribo por el cronograma revisado que mencionaste. ¿Me lo puedes enviar antes de nuestra llamada? Te enviaremos los requisitos de seguridad a principios de la próxima semana.'), now - 18 * H),
    msg(4, P.maria, P.me, L('MSA – Section 9 redline', 'Contrato marco – cambios en la cláusula 9'), L('Attached is our redline of the MSA. We have capped indemnification at 1x ARR (previously 3x). We would like to sign by Friday.', 'Adjunto nuestros cambios al contrato marco. Limitamos la indemnización a 1x el ingreso anual (antes 3x). Queremos firmar antes del viernes.'), now - 3 * H),
    msg(5, P.david, P.me, L('Board packet timing', 'Fecha del informe al directorio'), L('Heads up: the board packet locks Friday at 3 PM. Please have your budget section ready.', 'Aviso: el informe al directorio se cierra el viernes a las 3 p. m. Por favor ten lista tu sección de presupuesto.'), now - 26 * H),
    msg(6, P.priya, P.me, L('Apollo beta announcement — approve copy?', 'Anuncio beta de Apollo — ¿apruebas el texto?'), L('Can you review the beta announcement copy when you get a chance? Draft is in the Apollo folder.', '¿Puedes revisar el texto del anuncio beta cuando tengas un momento? El borrador está en la carpeta de Apollo.'), now - 5 * H),
    msg(7, P.elena, P.me, L('Stripe webhook deployment', 'Despliegue del webhook de Stripe'), L(`Quick update: I'll deploy the Stripe webhook by ${elenaDay} 5 PM so the cutover can go ahead.`, `Actualización rápida: voy a desplegar el webhook de Stripe el ${elenaDay} a las 5 pm para que el cambio pueda avanzar.`), now - 4 * 24 * H),
    msg(7, P.me, P.elena, L('Re: Stripe webhook deployment', 'Re: Despliegue del webhook de Stripe'), L('Hi Elena, any update on the webhook deploy? The cutover depends on it.', 'Hola Elena, ¿alguna novedad del despliegue del webhook? El cambio depende de eso.'), now - 20 * H),
    msg(8, P.me, P.david, L('Re: Exec sync follow-ups', 'Re: Pendientes del comité'), L('Good meeting. Let me get you the headcount summary next week.', 'Buena reunión. Te mando el resumen de personal la próxima semana.'), now - 3 * 24 * H),
    msg(9, { name: 'Northwind Legal', email: 'legal@northwind.example' }, P.me, L('Countersigned agreement', 'Contrato firmado por ambas partes'), L('Attached is the fully executed renewal agreement. No action needed.', 'Adjunto el contrato de renovación firmado. No se requiere ninguna acción.'), now - 7 * H, { labels: ['INBOX'] }),
    msg(10, { name: 'SaaS Weekly', email: 'news@saasweekly.example' }, P.me, L('This week in SaaS: 12 growth tactics', 'Esta semana en SaaS: 12 tácticas de crecimiento'), L('Our top stories this week...', 'Lo más destacado de la semana...'), now - 9 * H, { bulk: true, labels: ['INBOX', 'CATEGORY_PROMOTIONS'] }),
    msg(11, { name: 'Cloudy Billing', email: 'no-reply@cloudy.example' }, P.me, L('Your receipt #4821', 'Tu recibo #4821'), L('Thanks for your payment.', 'Gracias por tu pago.'), now - 11 * H, { bulk: true, labels: ['INBOX', 'CATEGORY_UPDATES'] }),
    msg(12, { name: 'GitHub', email: 'notifications@github.example' }, P.me, '[apollo] PR #212 merged', 'Merged into main.', now - 6 * H, { bulk: true, labels: ['INBOX', 'CATEGORY_UPDATES'] })
  ];
  let e = 0;
  const ev = (title, s, en, attendees = [], extra = {}) => ({
    id: 'demo_e' + (++e), source: 'demo', sourceId: 'e' + e, title, start: s.toISOString(), end: en.toISOString(), allDay: false, location: extra.location || '', meetLink: extra.meet || '',
    description: extra.description || '', attendees: [{ ...P.me, self: true, response: 'accepted' }, ...attendees.map((a) => ({ ...a, response: 'accepted' }))],
    organizer: extra.organizer || DEMO_ME, myResponse: 'accepted', busy: true, status: 'confirmed', link: '#demo', recurringId: extra.rec || null, created: extra.created || new Date(now - 10 * 24 * H).toISOString(), demo: true
  });
  const others = (k) => Array.from({ length: k }, (_, i) => ({ name: L(`Teammate ${i + 1}`, `Colega ${i + 1}`), email: `teammate${i + 1}@northpeak.example` }));
  const events = [
    ev(L('Apex Corp implementation review', 'Revisión de implementación Apex Corp'), at(-7, 15), at(-7, 15, 30), [P.john, P.maria], { description: L('Open issue: API migration schedule. Next review in one week.', 'Pendiente: cronograma de migración de la API. Próxima revisión en una semana.'), rec: 'apex' }),
    ev(L('Engineering standup', 'Reunión diaria de ingeniería'), at(0, 9, 30), at(0, 10), others(7), { meet: 'https://meet.example/standup' }),
    ev(L('Lunch with Sam', 'Almuerzo con Samuel'), at(0, 12, 30), at(0, 13, 15)),
    ev(L('Prep: Q4 Finance Review', 'Preparación: Revisión Financiera Q4'), at(0, 13, 15), at(0, 13, 45)),
    ev(L('Q4 Finance Review', 'Revisión Financiera Q4'), at(0, 14), at(0, 15), [P.david, P.sarah, ...others(4)], { location: L('Boardroom C', 'Sala C'), description: L('Approve Q4 budget and headcount plan for the board packet. Budget section: you.', 'Aprobar el presupuesto Q4 y el plan de personal para el informe al directorio. Sección de presupuesto: tú.'), organizer: P.david.email }),
    ev(L('Apex Corp implementation review', 'Revisión de implementación Apex Corp'), at(0, 14, 45), at(0, 15, 15), [P.john, P.maria], { meet: 'https://meet.example/apex', description: L('Review implementation milestone and MSA Section 9.', 'Revisar el hito de implementación y la cláusula 9 del contrato.'), organizer: P.john.email, rec: 'apex', created: new Date(now - 20 * H).toISOString() }),
    ev(L('1:1 with Priya', 'Reunión 1 a 1 con Paula'), at(0, 16, 30), at(0, 17), [P.priya]),
    ev(L('Billing webhook cutover', 'Cambio al webhook de facturación'), at(2, 10), at(2, 11), [P.elena, ...others(2)]),
    ev(L('Staff Engineer final-round interviews', 'Entrevistas finales Ingeniero Senior'), at(3, 13), at(3, 17), others(3)),
    ev(L('Board packet review', 'Revisión del informe al directorio'), at(4, 11), at(4, 12), [P.david, P.sarah]),
    ev(L('Apollo v2 beta launch sync', 'Coordinación lanzamiento beta Apollo v2'), at(9, 10), at(9, 10, 30), [P.priya, ...others(3)])
  ];
  const doc = (i, name, mime, hoursAgo, by, me = false) => ({ id: 'demo_d' + i, source: 'demo', sourceId: 'd' + i, name, mimeType: mime, modifiedTime: new Date(now - hoursAgo * H).toISOString(), modifiedBy: by, modifiedByMe: me, link: '#demo', demo: true });
  const documents = [
    doc(1, L('Q4_Model_v3.xlsx', 'Modelo_Presupuesto_Q4_v3.xlsx'), 'application/vnd.google-apps.spreadsheet', 50, L('Finance Ops', 'Finanzas')),
    doc(2, L('AWS cost estimate Q4.pdf', 'Costos AWS Q4.pdf'), 'application/pdf', 14, P.sarah.name),
    doc(3, L('msa_final_v4.docx', 'contrato_marco_v4.docx'), 'application/vnd.google-apps.document', 3, P.maria.name),
    doc(4, L('Apex Implementation Plan v4', 'Plan de implementación Apex v4'), 'application/vnd.google-apps.document', 96, P.me.name, true),
    doc(5, L('Q4 Finance Review deck', 'Presentación Revisión Financiera Q4'), 'application/vnd.google-apps.presentation', 24, P.me.name, true)
  ];
  const task = (i, title, due, extra = {}) => ({ id: 'demo_t' + i, source: 'demo', sourceId: 't' + i, title, notes: '', due: due ? due.toISOString() : null, dueHasTime: !!extra.time, status: 'open', priority: 'normal', createdAt: new Date(now - 4 * 24 * H).toISOString(), link: '#demo', demo: true, ...extra });
  const tasks = [
    task(1, L('Finalize Q4 budget model', 'Terminar el modelo de presupuesto Q4'), at(0, 11), { time: true, priority: 'high', project: 'demo_q4' }),
    task(2, L('Submit interview scorecard', 'Enviar evaluación de entrevista'), at(0, 23, 59), { project: 'demo_hiring' }),
    task(3, L('Draft team OKRs for Q1', 'Borrador de objetivos del equipo Q1'), at(-1, 23, 59), { postponed: 3 }),
    task(4, L('Book flights for offsite', 'Reservar vuelos para el retiro'), at(4, 23, 59)),
    task(5, L('Webhook cutover checklist', 'Lista de control del cambio de webhook'), at(2, 9), { time: true, status: 'blocked', blockedBy: L('Waiting on Elena’s webhook deploy', 'Esperando el despliegue del webhook de Elena'), project: 'demo_billing' }),
    task(6, L('Approve Apollo beta copy', 'Aprobar el texto beta de Apollo'), null, { project: 'demo_apollo' }),
    task(7, L('Northwind renewal signature', 'Firma de renovación Northwind'), at(-1, 17), { status: 'done', completedAt: new Date(now - 7 * H).toISOString() })
  ];
  const proj = (id, name, keywords, people, important = false) => ({ id, name, keywords, people, important, owner: 'You', source: 'demo', demo: true });
  const projects = [
    proj('demo_q4', L('Q4 Planning', 'Planificación Q4'), ['q4', 'budget', 'board packet', 'runway', 'finance review', 'aws cost', 'presupuesto', 'directorio', 'proyección', 'revisión financiera', 'costos de aws', 'aws'], [P.sarah.email, P.david.email], true),
    proj('demo_apex', 'Apex Corp', ['apex', 'msa', 'section 9', 'implementation', 'contrato marco', 'cláusula 9', 'implementación', 'cronograma'], [P.john.email, P.maria.email], true),
    proj('demo_billing', L('Billing Migration', 'Migración de facturación'), ['webhook', 'billing', 'stripe', 'cutover', 'facturación'], [P.elena.email]),
    proj('demo_apollo', L('Apollo v2 Launch', 'Lanzamiento Apollo v2'), ['apollo', 'beta'], [P.priya.email]),
    proj('demo_hiring', L('Hiring — Staff Engineer', 'Contratación — Ingeniero Senior'), ['interview', 'scorecard', 'candidate', 'final-round', 'final round', 'entrevista', 'evaluación', 'candidato'], [])
  ];
  return { messages, events, documents, tasks, projects };
}
