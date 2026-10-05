// SAMPLE DATA for trying the app before connecting Google. Everything here is fictional
// and is shown with a "DEMO DATA" banner. It is removed as soon as a real account is connected.
import { addDays, startOfDay } from './dates.js';

export const DEMO_ME = 'you@demo.example';
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function demoData(now) {
  const H = 3600000;
  const today = startOfDay(now);
  const at = (dayOffset, h, m = 0) => { const d = addDays(today, dayOffset); d.setHours(h, m, 0, 0); return d; };
  const P = {
    sarah: { name: 'Sarah Miller', email: 'sarah.miller@northpeak.example' },
    david: { name: 'David Chen', email: 'david.chen@northpeak.example' },
    john: { name: 'John Smith', email: 'john.smith@apexcorp.example' },
    maria: { name: 'Maria Lopez', email: 'maria.lopez@apexcorp.example' },
    elena: { name: 'Elena Vance', email: 'elena.vance@northpeak.example' },
    priya: { name: 'Priya Nair', email: 'priya.nair@northpeak.example' },
    me: { name: 'You', email: DEMO_ME }
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
    msg(1, P.sarah, P.me, 'Updated AWS cost estimate', 'Hi — attached are the revised AWS cost numbers for Q4. Please use these in the budget model before the Finance Review today. They are higher than what is in v3.', now - 14 * H),
    msg(2, P.sarah, P.me, 'Re: Q4 runway estimates', 'Should the hiring assumptions change before the 2 PM review? I need a yes/no on the revised margin by noon today.', now - 1 * H),
    msg(3, P.me, P.john, 'Re: Implementation timeline', `Thanks John. I'll send the revised timeline by ${promisedDay}.`, fiveAgo),
    msg(3, P.john, P.me, 'Re: Implementation timeline', 'Hi, following up on the revised delivery timeline you mentioned. Could you send it before our call? We will get you our security requirements early next week.', now - 18 * H),
    msg(4, P.maria, P.me, 'MSA – Section 9 redline', 'Attached is our redline of the MSA. We have capped indemnification at 1x ARR (previously 3x). We would like to sign by Friday.', now - 3 * H),
    msg(5, P.david, P.me, 'Board packet timing', 'Heads up: the board packet locks Friday at 3 PM. Please have your budget section ready.', now - 26 * H),
    msg(6, P.priya, P.me, 'Apollo beta announcement — approve copy?', 'Can you review the beta announcement copy when you get a chance? Draft is in the Apollo folder.', now - 5 * H),
    msg(7, P.elena, P.me, 'Stripe webhook deployment', `Quick update: I'll deploy the Stripe webhook by ${elenaDay} 5 PM so the cutover can go ahead.`, now - 4 * 24 * H),
    msg(7, P.me, P.elena, 'Re: Stripe webhook deployment', 'Hi Elena, any update on the webhook deploy? The cutover depends on it.', now - 20 * H),
    msg(8, P.me, P.david, 'Re: Exec sync follow-ups', 'Good meeting. Let me get you the headcount summary next week.', now - 3 * 24 * H),
    msg(9, { name: 'Northwind Legal', email: 'legal@northwind.example' }, P.me, 'Countersigned agreement', 'Attached is the fully executed renewal agreement. No action needed.', now - 7 * H, { labels: ['INBOX'] }),
    msg(10, { name: 'SaaS Weekly', email: 'news@saasweekly.example' }, P.me, 'This week in SaaS: 12 growth tactics', 'Our top stories this week...', now - 9 * H, { bulk: true, labels: ['INBOX', 'CATEGORY_PROMOTIONS'] }),
    msg(11, { name: 'Cloudy Billing', email: 'no-reply@cloudy.example' }, P.me, 'Your receipt #4821', 'Thanks for your payment.', now - 11 * H, { bulk: true, labels: ['INBOX', 'CATEGORY_UPDATES'] }),
    msg(12, { name: 'GitHub', email: 'notifications@github.example' }, P.me, '[apollo] PR #212 merged', 'Merged into main.', now - 6 * H, { bulk: true, labels: ['INBOX', 'CATEGORY_UPDATES'] })
  ];
  let e = 0;
  const ev = (title, s, en, attendees = [], extra = {}) => ({
    id: 'demo_e' + (++e), source: 'demo', sourceId: 'e' + e, title, start: s.toISOString(), end: en.toISOString(), allDay: false, location: extra.location || '', meetLink: extra.meet || '',
    description: extra.description || '', attendees: [{ ...P.me, self: true, response: 'accepted' }, ...attendees.map((a) => ({ ...a, response: 'accepted' }))],
    organizer: extra.organizer || DEMO_ME, myResponse: 'accepted', busy: true, status: 'confirmed', link: '#demo', recurringId: extra.rec || null, created: extra.created || new Date(now - 10 * 24 * H).toISOString(), demo: true
  });
  const others = (k) => Array.from({ length: k }, (_, i) => ({ name: `Teammate ${i + 1}`, email: `teammate${i + 1}@northpeak.example` }));
  const events = [
    ev('Apex Corp implementation review', at(-7, 15), at(-7, 15, 30), [P.john, P.maria], { description: 'Open issue: API migration schedule. Next review in one week.', rec: 'apex' }),
    ev('Engineering standup', at(0, 9, 30), at(0, 10), others(7), { meet: 'https://meet.example/standup' }),
    ev('Lunch with Sam', at(0, 12, 30), at(0, 13, 15)),
    ev('Prep: Q4 Finance Review', at(0, 13, 15), at(0, 13, 45)),
    ev('Q4 Finance Review', at(0, 14), at(0, 15), [P.david, P.sarah, ...others(4)], { location: 'Boardroom C', description: 'Approve Q4 budget and headcount plan for the board packet. Budget section: you.', organizer: P.david.email }),
    ev('Apex Corp implementation review', at(0, 14, 45), at(0, 15, 15), [P.john, P.maria], { meet: 'https://meet.example/apex', description: 'Review implementation milestone and MSA Section 9.', organizer: P.john.email, rec: 'apex', created: new Date(now - 20 * H).toISOString() }),
    ev('1:1 with Priya', at(0, 16, 30), at(0, 17), [P.priya]),
    ev('Billing webhook cutover', at(2, 10), at(2, 11), [P.elena, ...others(2)]),
    ev('Staff Engineer final-round interviews', at(3, 13), at(3, 17), others(3)),
    ev('Board packet review', at(4, 11), at(4, 12), [P.david, P.sarah]),
    ev('Apollo v2 beta launch sync', at(9, 10), at(9, 10, 30), [P.priya, ...others(3)])
  ];
  const doc = (i, name, mime, hoursAgo, by, me = false) => ({ id: 'demo_d' + i, source: 'demo', sourceId: 'd' + i, name, mimeType: mime, modifiedTime: new Date(now - hoursAgo * H).toISOString(), modifiedBy: by, modifiedByMe: me, link: '#demo', demo: true });
  const documents = [
    doc(1, 'Q4_Model_v3.xlsx', 'application/vnd.google-apps.spreadsheet', 50, 'Finance Ops'),
    doc(2, 'AWS cost estimate Q4.pdf', 'application/pdf', 14, 'Sarah Miller'),
    doc(3, 'msa_final_v4.docx', 'application/vnd.google-apps.document', 3, 'Maria Lopez'),
    doc(4, 'Apex Implementation Plan v4', 'application/vnd.google-apps.document', 96, 'You', true),
    doc(5, 'Q4 Finance Review deck', 'application/vnd.google-apps.presentation', 24, 'You', true)
  ];
  const task = (i, title, due, extra = {}) => ({ id: 'demo_t' + i, source: 'demo', sourceId: 't' + i, title, notes: '', due: due ? due.toISOString() : null, dueHasTime: !!extra.time, status: 'open', priority: 'normal', createdAt: new Date(now - 4 * 24 * H).toISOString(), link: '#demo', demo: true, ...extra });
  const tasks = [
    task(1, 'Finalize Q4 budget model', at(0, 11), { time: true, priority: 'high', project: 'demo_q4' }),
    task(2, 'Submit interview scorecard', at(0, 23, 59), { project: 'demo_hiring' }),
    task(3, 'Draft team OKRs for Q1', at(-1, 23, 59), { postponed: 3 }),
    task(4, 'Book flights for offsite', at(4, 23, 59)),
    task(5, 'Webhook cutover checklist', at(2, 9), { time: true, status: 'blocked', blockedBy: 'Waiting on Elena’s webhook deploy', project: 'demo_billing' }),
    task(6, 'Approve Apollo beta copy', null, { project: 'demo_apollo' }),
    task(7, 'Northwind renewal signature', at(-1, 17), { status: 'done', completedAt: new Date(now - 7 * H).toISOString() })
  ];
  const proj = (id, name, keywords, people, important = false) => ({ id, name, keywords, people, important, owner: 'You', source: 'demo', demo: true });
  const projects = [
    proj('demo_q4', 'Q4 Planning', ['q4', 'budget', 'board packet', 'runway', 'finance review', 'aws cost'], [P.sarah.email, P.david.email], true),
    proj('demo_apex', 'Apex Corp', ['apex', 'msa', 'section 9', 'implementation'], [P.john.email, P.maria.email], true),
    proj('demo_billing', 'Billing Migration', ['webhook', 'billing', 'stripe', 'cutover'], [P.elena.email]),
    proj('demo_apollo', 'Apollo v2 Launch', ['apollo', 'beta'], [P.priya.email]),
    proj('demo_hiring', 'Hiring — Staff Engineer', ['interview', 'scorecard', 'candidate', 'final-round', 'final round'], [])
  ];
  return { messages, events, documents, tasks, projects };
}
