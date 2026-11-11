#!/usr/bin/env node
// Eval runner for the calendar assistant.
//
//   node evals/run.js [--engine agent|prompt-v1|prompt-v0|all] [--model <model id>] [--suite core|extended|all]
//                     [--runs N] [--only id1,id2] [--category next,last] [--answer-mode tool|text] [--tpm N]
//                     [--dry] [--self-test] [--verbose]
//
// --dry        validate cases + fixtures only (no network); exit 1 on errors
// --self-test  offline: grader vs. perfect/empty results, and expected answers vs. the deterministic search
// --suite      core = the original 37 cases, extended = the newer ones; both are reported separately (default all)
// --runs N     repeat the run N times and report mean and min–max per suite
// --tpm N      pace requests to N tokens/minute (default 7000 for Groq models, off for Claude), so a free-tier
//              rate limit slows the run instead of failing cases. Rate-limit waits are reported separately from latency.
// Real runs always exit 0: the output is a report, not a gate.

import 'dotenv/config';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAssistant, ENGINES } from '../server/src/assistant/index.js';
import { normalizeEvents, searchEvents, formatWhen } from '../server/src/assistant/events.js';
import { zonedToUtc, isDateString, isTimeString, dateGuide } from '../server/src/assistant/time.js';
import { createLLM, groqKey, groqModel, anthropicModel } from '../server/src/services/llm.js';
import { events as rawEvents, TIME_ZONE, DEFAULT_NOW } from './fixtures/calendar.js';
import { mainExt, kolkata, big, BIG_GYM_NOVEMBER, BIG_DENTIST_NEXT } from './fixtures/extended.js';
import { cases as allCases, CATEGORIES, SUITES } from './cases.js';
import { grade, describeCreate, answerRegexes } from './grade.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// `dotenv/config` reads .env from the cwd; also try the client root so the runner works from anywhere
dotenv.config({ path: resolve(HERE, '..', '.env') });

// ---------- args ----------
function parseArgs(argv) {
  const opts = { engine: 'agent', model: null, only: null, category: null, suite: 'all', runs: 1, answerMode: null, tpm: null, dry: false, selfTest: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.includes('=') ? a.split(/=(.*)/s) : [a, undefined];
    const value = () => inline ?? argv[++i];
    if (flag === '--engine') opts.engine = value();
    else if (flag === '--model') opts.model = value();
    else if (flag === '--only') opts.only = value().split(',').map(s => s.trim()).filter(Boolean);
    else if (flag === '--category') opts.category = value().split(',').map(s => s.trim()).filter(Boolean);
    else if (flag === '--suite') opts.suite = value();
    else if (flag === '--runs') opts.runs = Math.max(1, Number(value()) || 1);
    else if (flag === '--answer-mode') opts.answerMode = value();
    else if (flag === '--tpm') opts.tpm = Number(value());
    else if (flag === '--dry') opts.dry = true;
    else if (flag === '--self-test') opts.selfTest = true;
    else if (flag === '--verbose' || flag === '-v') opts.verbose = true;
    else if (flag === '--help' || flag === '-h') {
      console.log('Usage: node evals/run.js [--engine agent|prompt-v1|prompt-v0|all] [--model <model id>] [--suite core|extended|all] [--runs N] [--only id1,id2] [--category next,last] [--answer-mode tool|text] [--tpm N] [--dry] [--self-test] [--verbose]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

// ---------- fixtures ----------
const FIXTURES = {
  main: { events: rawEvents, timeZone: TIME_ZONE, defaultNow: DEFAULT_NOW },
  'main-ext': mainExt,
  kolkata,
  big
};
for (const f of Object.values(FIXTURES)) {
  f.normalized = normalizeEvents(f.events, f.timeZone);
  f.byId = new Map(f.normalized.map(e => [e.id, e]));
}
const suiteOf = c => c.suite || 'core';
const fixtureOf = c => FIXTURES[c.fixture || 'main'];
const caseNow = c => c.now ?? fixtureOf(c).defaultNow;

const LOCAL_NOW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
function localToDate(local, timeZone = TIME_ZONE) {
  const [date, time] = local.split('T');
  return zonedToUtc(date, time, timeZone);
}

const describeId = (fixture, id) => {
  const e = fixture.byId.get(id);
  return e ? `${id} "${e.title}" ${formatWhen(e, fixture.timeZone)}` : `${id} (unknown id)`;
};

function describeExpect(expect) {
  if (expect.intent === 'question') {
    if (expect.none) return 'question with no events';
    const parts = [];
    if (expect.includes?.length) parts.push(`includes [${expect.includes.join(', ')}]`);
    if (expect.excludes?.length) parts.push(`excludes [${expect.excludes.join(', ')}]`);
    return `question ${parts.join(' ') || '(intent only)'}`;
  }
  if (expect.intent === 'delete') return `delete [${expect.ids.join(', ')}]`;
  return `create ${expect.events.map(describeCreate).join('; ')}`;
}

function describeResult(result, fixture) {
  if (!result) return '(no result)';
  if (result.intent === 'create') {
    return `create ${(result.events || []).map(e => `${e.date} ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}${e.endDate ? ` (ends ${e.endDate})` : ''} "${e.title}"`).join('; ')}`;
  }
  const ids = (result.eventIds || []).map(id => `\n        - ${describeId(fixture, id)}`).join('');
  const answer = result.answer ? `\n        answer: ${JSON.stringify(result.answer)}` : '';
  return `${result.intent}${answer}${ids || '\n        (no eventIds)'}`;
}

// ---------- validation (--dry) ----------
function validate(cases) {
  const errors = [];
  for (const [name, f] of Object.entries(FIXTURES)) {
    const ids = new Set();
    for (const e of f.events) {
      if (ids.has(e.id)) errors.push(`fixture ${name}: duplicate id ${e.id}`);
      ids.add(e.id);
    }
    if (f.normalized.length !== f.events.length) errors.push(`fixture ${name}: ${f.events.length - f.normalized.length} event(s) failed to normalize`);
  }

  const caseIds = new Set();
  for (const c of cases) {
    const where = `case ${c.id}`;
    if (!c.id) errors.push('case without id');
    if (caseIds.has(c.id)) errors.push(`${where}: duplicate id`);
    caseIds.add(c.id);
    if (!CATEGORIES.includes(c.category)) errors.push(`${where}: unknown category "${c.category}"`);
    if (!SUITES.includes(suiteOf(c))) errors.push(`${where}: unknown suite "${c.suite}"`);
    const fixture = fixtureOf(c);
    if (!fixture) {
      errors.push(`${where}: unknown fixture "${c.fixture}"`);
      continue;
    }
    if (typeof c.message !== 'string' || !c.message.trim()) errors.push(`${where}: empty message`);
    const now = caseNow(c);
    if (!LOCAL_NOW.test(now) || Number.isNaN(localToDate(now, fixture.timeZone).getTime())) errors.push(`${where}: bad now "${now}"`);
    for (const r of answerRegexes(c)) {
      if (!(r instanceof RegExp)) errors.push(`${where}: answerMatches must be RegExp(s)`);
      else if (/[gy]/.test(r.flags)) errors.push(`${where}: answerMatches must not use g/y flags`);
    }
    if (answerRegexes(c).length && !answerRegexes(c).every(r => r.test(c.answerExample || ''))) errors.push(`${where}: answerExample does not match answerMatches`);
    for (const h of c.history || []) {
      if (!['user', 'assistant'].includes(h.role) || typeof h.text !== 'string') errors.push(`${where}: bad history entry`);
      for (const id of h.eventIds || []) if (!fixture.byId.has(id)) errors.push(`${where}: history id "${id}" not in fixture`);
    }

    const x = c.expect;
    if (!x || !['question', 'create', 'delete'].includes(x.intent)) {
      errors.push(`${where}: expect.intent must be question|create|delete`);
      continue;
    }
    const checkIds = (list, label) => {
      if (list === undefined) return;
      if (!Array.isArray(list)) return errors.push(`${where}: ${label} must be an array`);
      for (const id of list) if (!fixture.byId.has(id)) errors.push(`${where}: ${label} id "${id}" not in fixture`);
    };
    if (x.intent === 'question') {
      checkIds(x.includes, 'includes');
      checkIds(x.excludes, 'excludes');
      if (x.none && x.includes?.length) errors.push(`${where}: none:true with includes`);
      const overlap = (x.includes || []).filter(id => (x.excludes || []).includes(id));
      if (overlap.length) errors.push(`${where}: ids both included and excluded: ${overlap.join(', ')}`);
      if (x.includes?.length > 5) errors.push(`${where}: more than 5 includes (answers carry at most 5 eventIds)`);
    }
    if (x.intent === 'delete') {
      if (!Array.isArray(x.ids) || x.ids.length === 0) errors.push(`${where}: delete needs ids`);
      checkIds(x.ids, 'ids');
    }
    if (x.intent === 'create') {
      if (!Array.isArray(x.events) || x.events.length === 0) {
        errors.push(`${where}: create needs events`);
        continue;
      }
      x.events.forEach((e, i) => {
        const w = `${where} events[${i}]`;
        if (!isDateString(e.date)) errors.push(`${w}: bad date "${e.date}"`);
        if (!isTimeString(e.startTime)) errors.push(`${w}: bad startTime "${e.startTime}"`);
        if (e.endDate !== undefined && (!isDateString(e.endDate) || e.endDate <= e.date)) errors.push(`${w}: bad endDate "${e.endDate}"`);
        if (e.endTime !== undefined && (!isTimeString(e.endTime) || (!e.endDate && e.endTime <= e.startTime))) errors.push(`${w}: bad endTime "${e.endTime}"`);
        if (!(e.title instanceof RegExp)) errors.push(`${w}: title must be a RegExp`);
        else if (/[gy]/.test(e.title.flags)) errors.push(`${w}: title regex must not use g/y flags (stateful)`);
        else if (typeof e.example === 'string' && !e.title.test(e.example)) errors.push(`${w}: example "${e.example}" does not match ${e.title}`);
      });
    }
  }
  return errors;
}

// ---------- self-test (offline) ----------
function perfectResult(c) {
  const x = c.expect;
  const answer = c.answerExample || 'ok';
  if (x.intent === 'question') return { intent: 'question', answer, eventIds: x.none ? [] : [...(x.includes || [])] };
  if (x.intent === 'delete') return { intent: 'delete', eventIds: [...x.ids] };
  return {
    intent: 'create',
    events: x.events.map(e => ({
      title: e.example || 'Untitled', date: e.date, startTime: e.startTime,
      endTime: e.endTime || '', ...(e.endDate && { endDate: e.endDate }), description: '', location: ''
    }))
  };
}

function selfTest(cases) {
  const problems = [];
  for (const c of cases) {
    const perfect = grade(c, perfectResult(c));
    if (!perfect.pass) problems.push(`grader: perfect result fails ${c.id}: ${perfect.reasons.join('; ')}`);
    if (perfect.answerOk === false) problems.push(`grader: perfect answer text fails ${c.id}`);
    const empty = grade(c, {});
    if (empty.pass) problems.push(`grader: empty result passes ${c.id}`);
    const emptyIntent = grade(c, { intent: c.expect.intent, eventIds: [], events: [], answer: '' });
    const intentOnly = c.expect.intent === 'question' && (c.expect.none || !c.expect.includes?.length) && !(suiteOf(c) === 'extended' && answerRegexes(c).length);
    if (!intentOnly && emptyIntent.pass) problems.push(`grader: right intent with no content passes ${c.id}`);
    if (answerRegexes(c).length && emptyIntent.answerOk !== false) problems.push(`grader: empty answer text passes the answer check of ${c.id}`);
  }

  // The expected answers must agree with the deterministic search the agent's tools use
  const search = (fixture, now, query) => {
    const f = FIXTURES[fixture];
    const r = searchEvents(f.normalized, query, { now: localToDate(now, f.timeZone), timeZone: f.timeZone });
    return r.error ? [`error: ${r.error}`] : r.events.map(e => e.id);
  };
  const checks = [
    ['next anything', 'main', DEFAULT_NOW, { status: 'upcoming', order: 'asc', limit: 1 }, ['gym-2026-11-11']],
    ['right now', 'main', DEFAULT_NOW, { status: 'now' }, ['study-session']],
    ['next interview', 'main', DEFAULT_NOW, { keywords: ['interview'], status: 'upcoming', order: 'asc', limit: 1 }, ['northwind-interview']],
    ['last interview', 'main', DEFAULT_NOW, { keywords: ['interview'], status: 'past', order: 'desc', limit: 1 }, ['orbital-interview']],
    ['next dentist', 'main', DEFAULT_NOW, { keywords: ['dentist', 'dental'], status: 'upcoming', order: 'asc', limit: 1 }, ['dentist-2026-11-15']],
    ['last dentist', 'main', DEFAULT_NOW, { keywords: ['dentist', 'dental'], status: 'past', order: 'desc', limit: 1 }, ['dental-checkup']],
    ['last dentist, model lists only "dentist" (synonyms are code-side)', 'main', DEFAULT_NOW, { keywords: ['dentist'], status: 'past', order: 'desc', limit: 1 }, ['dental-checkup']],
    ['last doctor', 'main', DEFAULT_NOW, { keywords: ['dr.', 'doctor', 'physical'], status: 'past', order: 'desc', limit: 1 }, ['physical']],
    ['last doctor, just "doctor"', 'main', DEFAULT_NOW, { keywords: ['doctor'], status: 'past', order: 'desc', limit: 1 }, ['physical']],
    ['next class', 'main', DEFAULT_NOW, { keywords: ['lecture', 'class'], status: 'upcoming', order: 'asc', limit: 1 }, ['lecture-2026-11-12']],
    ['next class, just "class"', 'main', DEFAULT_NOW, { keywords: ['class'], status: 'upcoming', order: 'asc', limit: 1 }, ['lecture-2026-11-12']],
    ['cs 170 final ranks above lectures', 'main', DEFAULT_NOW, { keywords: ['CS 170', 'final'], status: 'upcoming', limit: 1 }, ['cs170-final']],
    ['orbital phrase', 'main', DEFAULT_NOW, { keywords: ['Orbital Labs interview'] }, ['orbital-interview']],
    ['next dinner john', 'main', DEFAULT_NOW, { keywords: ['john'], status: 'upcoming', order: 'asc', limit: 1 }, ['dinner-john-nov']],
    ['last haircut', 'main', DEFAULT_NOW, { keywords: ['haircut'], status: 'past', order: 'desc', limit: 1 }, ['haircut']],
    ['flight to NY', 'main', DEFAULT_NOW, { keywords: ['nyc', 'new york'], status: 'upcoming', order: 'asc', limit: 1 }, ['flight-nyc-nov']],
    ['flight to NY, just "New York"', 'main', DEFAULT_NOW, { keywords: ['New York'], status: 'upcoming', order: 'asc', limit: 1 }, ['flight-nyc-nov']],
    ['mom birthday', 'main', DEFAULT_NOW, { keywords: ['mom birthday'] }, ['moms-birthday']],
    ['mars', 'main', DEFAULT_NOW, { keywords: ['mars'] }, []],
    ['yoga', 'main', DEFAULT_NOW, { keywords: ['yoga'] }, []],
    ['tomorrow', 'main', DEFAULT_NOW, { from: '2026-11-11', to: '2026-11-11' }, ['gym-2026-11-11', 'busy-2026-11-11', 'northwind-interview']],
    ['last weekend', 'main', DEFAULT_NOW, { from: '2026-11-07', to: '2026-11-08' }, ['hike', 'free-2026-11-08', 'brunch']],
    ['friday', 'main', DEFAULT_NOW, { from: '2026-11-13', to: '2026-11-13' }, ['gym-2026-11-13', 'tentative']],
    ['thanksgiving', 'main', DEFAULT_NOW, { from: '2026-11-26', to: '2026-11-26' }, ['thanksgiving']],
    ['earlier today', 'main', DEFAULT_NOW, { from: '2026-11-10', to: '2026-11-10', status: 'past' }, ['lecture-2026-11-10', 'busy-2026-11-10', 'orbital-interview', 'hi']],
    ['next while in progress', 'main', '2026-11-12T14:00', { status: 'upcoming', order: 'asc', limit: 1 }, ['robotics-seminar']],
    ['in progress thu', 'main', '2026-11-12T14:00', { status: 'now' }, ['harbor-interview']],
    ['next dentist same day', 'main', '2026-11-15T09:30', { keywords: ['dentist'], status: 'upcoming', order: 'asc', limit: 1 }, ['dentist-2026-11-15']],
    ['last dentist same day', 'main', '2026-11-15T12:00', { keywords: ['dentist'], status: 'past', order: 'desc', limit: 1 }, ['dentist-2026-11-15']],
    ['dinner john next week', 'main', DEFAULT_NOW, { keywords: ['john'], from: '2026-11-15', to: '2026-11-21' }, ['dinner-john-nov']],
    ['gym rest of this week', 'main', DEFAULT_NOW, { keywords: ['gym'], status: 'upcoming', to: '2026-11-14' }, ['gym-2026-11-11', 'gym-2026-11-13']],
    // extended suite
    ['yesterday', 'main', DEFAULT_NOW, { from: '2026-11-09', to: '2026-11-09' }, ['gym-2026-11-09', 'acme-confirmation']],
    ['interviews this week', 'main', DEFAULT_NOW, { keywords: ['interview'], from: '2026-11-08', to: '2026-11-14' }, ['orbital-interview', 'northwind-interview', 'harbor-interview']],
    ['flight next week', 'main', DEFAULT_NOW, { keywords: ['flight'], from: '2026-11-15', to: '2026-11-21' }, ['flight-nyc-nov']],
    ['this weekend', 'main', DEFAULT_NOW, { from: '2026-11-14', to: '2026-11-15' }, ['moms-birthday', 'dentist-2026-11-15']],
    ['gym last week', 'main', DEFAULT_NOW, { keywords: ['gym'], from: '2026-11-01', to: '2026-11-07' }, ['gym-2026-11-02', 'gym-2026-11-04', 'gym-2026-11-06']],
    ['two upcoming interviews', 'main', DEFAULT_NOW, { keywords: ['interview'], status: 'upcoming' }, ['northwind-interview', 'harbor-interview']],
    ['friday with injection', 'main-ext', DEFAULT_NOW, { from: '2026-11-13', to: '2026-11-13' }, ['gym-2026-11-13', 'tentative', 'injection']],
    ['kolkata tomorrow', 'kolkata', kolkata.defaultNow, { from: '2026-11-12', to: '2026-11-12' }, ['gym-kol', 'dinner-kol']],
    ['kolkata today', 'kolkata', kolkata.defaultNow, { from: '2026-11-11', to: '2026-11-11' }, ['standup-kol', 'lunch-kol']],
    ['trip', 'main-ext', DEFAULT_NOW, { keywords: ['trip'] }, ['nyc-trip']],
    ['hackathon', 'main-ext', DEFAULT_NOW, { keywords: ['hackathon'] }, ['hackathon']],
    ['big: gym in November (limit 50)', 'big', DEFAULT_NOW, { keywords: ['gym'], from: '2026-11-01', to: '2026-11-30', limit: 50 }, BIG_GYM_NOVEMBER],
    ['big: next dentist', 'big', DEFAULT_NOW, { keywords: ['dentist'], status: 'upcoming', limit: 1 }, [BIG_DENTIST_NEXT]],
    ['eye exam', 'main', DEFAULT_NOW, { keywords: ['eye exam'] }, []]
  ];
  for (const [name, fixture, now, query, want] of checks) {
    const got = search(fixture, now, query);
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`search "${name}": expected [${want.join(', ')}], got [${got.join(', ')}]`);
  }
  const bigGym = searchEvents(big.normalized, { keywords: ['gym'], from: '2026-11-01', to: '2026-11-30' }, { now: localToDate(DEFAULT_NOW), timeZone: big.timeZone });
  if (!(bigGym.total > bigGym.events.length)) problems.push('big: November gym sessions should exceed the default search limit');
  if (big.events.length < 290) problems.push(`big: only ${big.events.length} events`);

  // Date guide ranges agree with the cases
  const guide = dateGuide(localToDate(DEFAULT_NOW), TIME_ZONE).ranges;
  const wantRanges = { yesterday: '2026-11-09', 'this week': '2026-11-08 to 2026-11-14', 'next week': '2026-11-15 to 2026-11-21', 'last week': '2026-11-01 to 2026-11-07', 'this weekend': '2026-11-14 to 2026-11-15', 'last weekend': '2026-11-07 to 2026-11-08' };
  for (const [k, v] of Object.entries(wantRanges)) if (guide[k] !== v) problems.push(`date guide ${k}: expected ${v}, got ${guide[k]}`);
  const kolGuide = dateGuide(localToDate(kolkata.defaultNow, kolkata.timeZone), kolkata.timeZone).ranges;
  if (kolGuide.today !== '2026-11-11' || kolGuide.tomorrow !== '2026-11-12') problems.push(`kolkata date guide: today ${kolGuide.today}, tomorrow ${kolGuide.tomorrow}`);

  // DST: an event after Nov 1 is UTC-8, before is UTC-7
  const iso = (id) => rawEvents.find(e => e.id === id).start.dateTime;
  if (iso('orbital-interview') !== '2026-11-10T21:30:00.000Z') problems.push(`DST: orbital starts ${iso('orbital-interview')}`);
  if (iso('dental-checkup') !== '2026-10-20T22:00:00.000Z') problems.push(`DST: dental checkup starts ${iso('dental-checkup')}`);
  // Kolkata "now" is still the previous day in UTC
  if (localToDate(kolkata.defaultNow, kolkata.timeZone).toISOString() !== '2026-11-10T23:40:00.000Z') problems.push('kolkata now is not 2026-11-10T23:40Z');

  return { problems, graderCases: cases.length, searchChecks: checks.length };
}

// ---------- real run ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const snapshot = u => ({ calls: u.calls || 0, tokens: (u.promptTokens || 0) + (u.completionTokens || 0), retries: u.retries || 0, retryWaitMs: u.retryWaitMs || 0, modelMs: u.modelMs || 0 });
const diff = (a, b) => Object.fromEntries(Object.keys(a).map(k => [k, b[k] - a[k]]));

async function runEngine(engine, model, cases, opts) {
  const llm = createLLM({ model, maxRetries: 6, maxWaitMs: 60000 });
  const isGroq = llm.provider === 'groq';
  const tpm = Number.isFinite(opts.tpm) && opts.tpm > 0 ? opts.tpm : isGroq ? 7000 : Infinity;
  const window = []; // { t, tokens } for the last minute, to pace under the provider's tokens/minute
  let paceWaitMs = 0;
  const rows = [];
  for (const c of cases) {
    const fixture = fixtureOf(c);
    const now = localToDate(caseNow(c), fixture.timeZone);
    // Wait until the last minute's tokens + this case's estimate fit under the limit
    const done = rows.filter(r => !r.infra);
    const estimate = done.length ? done.reduce((s, r) => s + r.tokens, 0) / done.length : 2500;
    for (;;) {
      const t = Date.now();
      while (window.length && t - window[0].t > 60000) window.shift();
      const used = window.reduce((s, w) => s + w.tokens, 0);
      if (!window.length || used + estimate <= tpm) break;
      const wait = 60000 - (t - window[0].t) + 250;
      paceWaitMs += wait;
      await sleep(wait);
    }

    let result = null;
    let error = null;
    let errorDetail = null;
    let infra = false;
    let rateLimitRetries = 0;
    let delta;
    let wallMs;
    for (let attempt = 0; ; attempt++) {
      const before = snapshot(llm.usage);
      const started = Date.now();
      try {
        result = await runAssistant(c.message, fixture.events, { engine, now, timeZone: fixture.timeZone, llm, history: c.history, range: c.range, answerMode: opts.answerMode || undefined });
        error = null;
        errorDetail = null;
      } catch (err) {
        error = err?.message || String(err);
        errorDetail = err?.providerMessage ? String(err.providerMessage).slice(0, 300) : null;
      }
      wallMs = Date.now() - started;
      delta = diff(before, snapshot(llm.usage));
      window.push({ t: Date.now(), tokens: delta.tokens });
      // A rate limit that outlasted the client's own retries is infrastructure, not a model failure: wait and rerun.
      // Groq's tokens-per-day limit says "try again in 6m29s"; wait that long (up to 15 min), else 30 s, 60 s.
      if (error === 'rate_limited' && attempt < 2) {
        const m = /try again in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i.exec(errorDetail || '');
        const hinted = m ? ((Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 60 + Number(m[3])) * 1000 + 1000 : 0;
        const wait = hinted && hinted <= 15 * 60000 ? hinted : 30000 * (attempt + 1);
        rateLimitRetries += 1;
        paceWaitMs += wait;
        if (opts.verbose) process.stdout.write(`(rate limited, waiting ${Math.round(wait / 1000)} s) `);
        await sleep(wait);
        continue;
      }
      infra = error === 'rate_limited';
      break;
    }
    const latencyMs = wallMs - delta.retryWaitMs; // model + our code, without rate-limit waits
    const graded = error ? { pass: false, reasons: [`error: ${error}`], answerOk: answerRegexes(c).length ? false : null } : grade(c, result);
    rows.push({
      id: c.id, suite: suiteOf(c), category: c.category, message: c.message, now: caseNow(c), fixture: c.fixture || 'main',
      expect: serializeExpect(c.expect), result, error, ...(errorDetail && { errorDetail }), infra,
      latencyMs, wallMs, modelMs: delta.modelMs, calls: delta.calls, tokens: delta.tokens,
      retries: delta.retries + rateLimitRetries, retryWaitMs: delta.retryWaitMs,
      malformed: result?.stats?.malformed ?? null,
      ...graded
    });
    process.stdout.write(infra ? 'R' : graded.pass ? '.' : 'F');
    if (opts.verbose) process.stdout.write(` ${c.id} (${latencyMs} ms, ${delta.calls} calls, ${delta.tokens} tok)\n`);
  }
  process.stdout.write('\n');
  return { engine, model: llm.model, usage: { ...llm.usage }, paceWaitMs, rows };
}

const serializeExpect = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v instanceof RegExp ? String(v) : v)));

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(0)}%` : '-';
}
const quantile = (values, q) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
};

// Per-suite numbers for one run (rate-limited "infra" rows are excluded from the score and counted separately)
function suiteSummary(rows) {
  const graded = rows.filter(r => !r.infra);
  const passed = graded.filter(r => r.pass).length;
  const answerRows = graded.filter(r => r.answerOk !== null);
  const lat = graded.map(r => r.latencyMs);
  return {
    passed, total: graded.length, infra: rows.length - graded.length,
    answerText: answerRows.length ? { passed: answerRows.filter(r => r.answerOk).length, total: answerRows.length } : null,
    medianMs: quantile(lat, 0.5), p90Ms: quantile(lat, 0.9),
    tokensPerQuestion: Math.round(graded.reduce((s, r) => s + r.tokens, 0) / (graded.length || 1)),
    callsPerQuestion: +(graded.reduce((s, r) => s + r.calls, 0) / (graded.length || 1)).toFixed(2),
    retries: rows.reduce((s, r) => s + r.retries, 0),
    retryWaitMs: rows.reduce((s, r) => s + r.retryWaitMs, 0),
    malformed: rows.reduce((s, r) => s + (r.malformed || 0), 0),
    errors: graded.filter(r => r.error).length
  };
}

function printReport(run, cases, verbose) {
  const pad = (s, w) => String(s).padEnd(w);
  console.log(`\n${run.engine} on ${run.model}`);
  const categories = CATEGORIES.filter(cat => run.rows.some(x => x.category === cat));
  for (const suite of SUITES) {
    const rows = run.rows.filter(r => r.suite === suite);
    if (!rows.length) continue;
    const line = categories
      .map(cat => [cat, rows.filter(x => x.category === cat && !x.infra)])
      .filter(([, r]) => r.length)
      .map(([cat, r]) => `${cat} ${r.filter(x => x.pass).length}/${r.length}`)
      .join(', ');
    const s = suiteSummary(rows);
    console.log(`  ${pad(suite, 9)} ${s.passed}/${s.total} ${pct(s.passed, s.total)}${s.infra ? ` (+${s.infra} rate-limited, not graded)` : ''}` +
      `${s.answerText ? `  answer text ${s.answerText.passed}/${s.answerText.total}` : ''}` +
      `  median ${s.medianMs} ms, p90 ${s.p90Ms} ms  ${s.tokensPerQuestion} tok/q, ${s.callsPerQuestion} calls/q  retries ${s.retries} (${Math.round(s.retryWaitMs / 1000)} s waiting)  malformed ${s.malformed}`);
    console.log(`            ${line}`);
  }
  if (run.paceWaitMs) console.log(`  paced: ${Math.round(run.paceWaitMs / 1000)} s spent waiting for the tokens/minute window (not counted in latency)`);

  const failures = run.rows.filter(x => !x.pass || (x.answerOk === false));
  if (failures.length === 0) return;
  console.log('\n  Failures:');
  for (const f of failures) {
    const c = cases.find(x => x.id === f.id);
    const fixture = fixtureOf(c);
    const tag = f.infra ? 'rate-limited' : f.pass ? 'answer text only' : f.suite;
    console.log(`  ✗ ${f.id} [${f.category}, ${tag}] ${JSON.stringify(f.message)}${c.now ? ` @ ${c.now}` : ''}`);
    console.log(`      expected: ${describeExpect(c.expect)}${answerRegexes(c).length ? ` + answer ${answerRegexes(c).map(String).join(' ')}` : ''}`);
    console.log(`      got:      ${f.error ? `error: ${f.error}` : describeResult(f.result, fixture)}`);
    console.log(`      why:      ${f.reasons.join('; ') || (f.answerOk === false ? 'answer text did not match' : '')}`);
    if (verbose && f.result?.trace) console.log(`      trace:    ${JSON.stringify(f.result.trace, null, 2).replace(/\n/g, '\n      ')}`);
  }
}

function printAggregate(runs) {
  if (runs.length < 2) return;
  console.log(`\nAcross ${runs.length} runs:`);
  for (const suite of SUITES) {
    const sums = runs.map(r => suiteSummary(r.rows.filter(x => x.suite === suite))).filter(s => s.total);
    if (!sums.length) continue;
    const scores = sums.map(s => s.passed);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`  ${suite.padEnd(9)} runs ${scores.map((p, i) => `${p}/${sums[i].total}`).join(', ')}  mean ${mean.toFixed(1)}  min–max ${Math.min(...scores)}–${Math.max(...scores)}  median latency ${Math.round(sums.reduce((a, s) => a + s.medianMs, 0) / sums.length)} ms`);
  }
}

// ---------- main ----------
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let cases = allCases;
  if (opts.suite !== 'all') {
    if (!SUITES.includes(opts.suite)) {
      console.error(`Unknown suite "${opts.suite}". Use one of: ${SUITES.join(', ')}, all`);
      process.exit(1);
    }
    cases = cases.filter(c => suiteOf(c) === opts.suite);
  }
  if (opts.only) {
    const unknown = opts.only.filter(id => !allCases.some(c => c.id === id));
    if (unknown.length) console.warn(`Unknown case id(s): ${unknown.join(', ')}`);
    cases = allCases.filter(c => opts.only.includes(c.id));
  }
  if (opts.category) cases = cases.filter(c => opts.category.includes(c.category));

  const errors = validate(allCases);
  if (opts.dry) {
    const counts = Object.fromEntries(CATEGORIES.map(cat => [cat, allCases.filter(c => c.category === cat).length]).filter(([, n]) => n));
    const bySuite = SUITES.map(s => `${s} ${allCases.filter(c => suiteOf(c) === s).length}`).join(', ');
    console.log(`Fixtures: ${Object.entries(FIXTURES).map(([k, f]) => `${k} ${f.events.length}`).join(', ')} events. Cases: ${allCases.length} (${bySuite}; ${cases.length} selected).`);
    console.log(`By category: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    if (errors.length) {
      console.error(`\n${errors.length} validation error(s):\n${errors.map(e => `  - ${e}`).join('\n')}`);
      process.exit(1);
    }
    console.log('Validation OK.');
    return;
  }

  if (opts.selfTest) {
    if (errors.length) {
      console.error(`Validation errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
      process.exit(1);
    }
    const { problems, graderCases, searchChecks } = selfTest(allCases);
    if (problems.length) {
      console.error(`Self-test failed:\n${problems.map(p => `  - ${p}`).join('\n')}`);
      process.exit(1);
    }
    console.log(`Self-test OK: grader checked on ${graderCases} cases (perfect passes, empty fails); ${searchChecks} deterministic search checks agree.`);
    return;
  }

  if (errors.length) {
    console.error(`Cases are invalid; run with --dry for details (${errors.length} error(s)).`);
    process.exit(1);
  }
  // Without --model the run uses what an owner would get (Claude if its key is set, else Groq)
  const model = opts.model || (process.env.ANTHROPIC_API_KEY ? anthropicModel() : groqKey() ? groqModel() : null);
  const needsClaude = model?.startsWith('claude');
  if (!model || (needsClaude ? !process.env.ANTHROPIC_API_KEY : !groqKey())) {
    console.error('No AI key found for that model. Add ANTHROPIC_API_KEY (Claude) or GROQ_API_KEY to client/.env, or run with --dry / --self-test for offline checks.');
    process.exit(1);
  }
  if (cases.length === 0) {
    console.error('No cases selected.');
    process.exit(1);
  }

  const engines = opts.engine === 'all' ? ENGINES : opts.engine.split(',');
  const badEngine = engines.find(e => !ENGINES.includes(e));
  if (badEngine) {
    console.error(`Unknown engine "${badEngine}". Use one of: ${ENGINES.join(', ')}, all`);
    process.exit(1);
  }

  console.log(`Running ${cases.length} case(s) × ${engines.join(', ')} × ${opts.runs} run(s) on ${model}${opts.answerMode ? ` (answer mode ${opts.answerMode})` : ''}`);
  const outDir = join(HERE, 'results');
  mkdirSync(outDir, { recursive: true });
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '_');
  for (const engine of engines) {
    const runs = [];
    for (let i = 0; i < opts.runs; i++) {
      process.stdout.write(`${engine}${opts.runs > 1 ? ` run ${i + 1}` : ''}: `);
      const run = await runEngine(engine, model, cases, opts);
      runs.push(run);
      printReport(run, cases, opts.verbose);

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = join(outDir, `${safe(engine)}-${safe(run.model)}-${stamp}.json`);
      const graded = run.rows.filter(x => !x.infra);
      const passed = graded.filter(x => x.pass).length;
      writeFileSync(file, JSON.stringify({
        engine: run.engine,
        model: run.model,
        answerMode: opts.answerMode || null,
        startedAt: stamp,
        now: DEFAULT_NOW,
        timeZone: TIME_ZONE,
        summary: {
          passed,
          total: graded.length,
          accuracy: graded.length ? passed / graded.length : 0,
          avgLatencyMs: Math.round(graded.reduce((s, x) => s + x.latencyMs, 0) / (graded.length || 1)),
          usage: run.usage,
          paceWaitMs: run.paceWaitMs,
          suites: Object.fromEntries(SUITES.map(s => [s, suiteSummary(run.rows.filter(x => x.suite === s))]).filter(([, v]) => v.total + v.infra > 0)),
          byCategory: Object.fromEntries(CATEGORIES.map(cat => {
            const rows = graded.filter(x => x.category === cat);
            return [cat, { passed: rows.filter(x => x.pass).length, total: rows.length }];
          }).filter(([, v]) => v.total > 0))
        },
        cases: run.rows
      }, null, 2));
      console.log(`  Wrote ${file}`);
    }
    printAggregate(runs);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
