#!/usr/bin/env node
// Eval runner for the calendar assistant.
//
//   node evals/run.js [--engine agent|prompt-v1|prompt-v0|all] [--model <model id>]
//                     [--only id1,id2] [--category next,last] [--dry] [--self-test] [--verbose]
//
// --dry        validate cases + fixture only (no network); exit 1 on errors
// --self-test  offline: grader vs. perfect/empty results, and expected answers vs. the deterministic search
// Real runs always exit 0: the output is a report, not a gate.

import 'dotenv/config';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAssistant, ENGINES } from '../server/src/assistant/index.js';
import { normalizeEvents, searchEvents, formatWhen } from '../server/src/assistant/events.js';
import { zonedToUtc, isDateString, isTimeString } from '../server/src/assistant/time.js';
import { createLLM, groqKey, llmProvider, activeModel } from '../server/src/services/llm.js';
import { events as rawEvents, TIME_ZONE, DEFAULT_NOW } from './fixtures/calendar.js';
import { cases as allCases, CATEGORIES } from './cases.js';
import { grade, describeCreate } from './grade.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// `dotenv/config` reads .env from the cwd; also try the client root so the runner works from anywhere
dotenv.config({ path: resolve(HERE, '..', '.env') });

// ---------- args ----------
function parseArgs(argv) {
  const opts = { engine: 'agent', model: null, only: null, category: null, dry: false, selfTest: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.includes('=') ? a.split(/=(.*)/s) : [a, undefined];
    const value = () => inline ?? argv[++i];
    if (flag === '--engine') opts.engine = value();
    else if (flag === '--model') opts.model = value();
    else if (flag === '--only') opts.only = value().split(',').map(s => s.trim()).filter(Boolean);
    else if (flag === '--category') opts.category = value().split(',').map(s => s.trim()).filter(Boolean);
    else if (flag === '--dry') opts.dry = true;
    else if (flag === '--self-test') opts.selfTest = true;
    else if (flag === '--verbose' || flag === '-v') opts.verbose = true;
    else if (flag === '--help' || flag === '-h') {
      console.log('Usage: node evals/run.js [--engine agent|prompt-v1|prompt-v0|all] [--model <model id>] [--only id1,id2] [--category next,last] [--dry] [--self-test] [--verbose]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

// ---------- helpers ----------
const LOCAL_NOW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function localToDate(local) {
  const [date, time] = local.split('T');
  return zonedToUtc(date, time, TIME_ZONE);
}

const normalized = normalizeEvents(rawEvents, TIME_ZONE);
const byId = new Map(normalized.map(e => [e.id, e]));
const describeId = (id) => {
  const e = byId.get(id);
  return e ? `${id} "${e.title}" ${formatWhen(e, TIME_ZONE)}` : `${id} (unknown id)`;
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

function describeResult(result) {
  if (!result) return '(no result)';
  if (result.intent === 'create') {
    return `create ${(result.events || []).map(e => `${e.date} ${e.startTime}${e.endTime ? `–${e.endTime}` : ''} "${e.title}"`).join('; ')}`;
  }
  const ids = (result.eventIds || []).map(id => `\n        - ${describeId(id)}`).join('');
  const answer = result.answer ? `\n        answer: ${JSON.stringify(result.answer)}` : '';
  return `${result.intent}${answer}${ids || '\n        (no eventIds)'}`;
}

// ---------- validation (--dry) ----------
function validate(cases) {
  const errors = [];
  const fixtureIds = new Set();
  for (const e of rawEvents) {
    if (fixtureIds.has(e.id)) errors.push(`fixture: duplicate id ${e.id}`);
    fixtureIds.add(e.id);
  }
  if (normalized.length !== rawEvents.length) errors.push(`fixture: ${rawEvents.length - normalized.length} event(s) failed to normalize`);

  const caseIds = new Set();
  for (const c of cases) {
    const where = `case ${c.id}`;
    if (!c.id) errors.push('case without id');
    if (caseIds.has(c.id)) errors.push(`${where}: duplicate id`);
    caseIds.add(c.id);
    if (!CATEGORIES.includes(c.category)) errors.push(`${where}: unknown category "${c.category}"`);
    if (typeof c.message !== 'string' || !c.message.trim()) errors.push(`${where}: empty message`);
    const now = c.now ?? DEFAULT_NOW;
    if (!LOCAL_NOW.test(now) || Number.isNaN(localToDate(now).getTime())) errors.push(`${where}: bad now "${now}"`);

    const x = c.expect;
    if (!x || !['question', 'create', 'delete'].includes(x.intent)) {
      errors.push(`${where}: expect.intent must be question|create|delete`);
      continue;
    }
    const checkIds = (list, label) => {
      if (list === undefined) return;
      if (!Array.isArray(list)) return errors.push(`${where}: ${label} must be an array`);
      for (const id of list) if (!fixtureIds.has(id)) errors.push(`${where}: ${label} id "${id}" not in fixture`);
    };
    if (x.intent === 'question') {
      checkIds(x.includes, 'includes');
      checkIds(x.excludes, 'excludes');
      if (x.none && x.includes?.length) errors.push(`${where}: none:true with includes`);
      const overlap = (x.includes || []).filter(id => (x.excludes || []).includes(id));
      if (overlap.length) errors.push(`${where}: ids both included and excluded: ${overlap.join(', ')}`);
      if (x.includes?.length > 3) errors.push(`${where}: more than 3 includes (engines return at most 3 eventIds)`);
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
        if (e.endTime !== undefined && (!isTimeString(e.endTime) || e.endTime <= e.startTime)) errors.push(`${w}: bad endTime "${e.endTime}"`);
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
  if (x.intent === 'question') return { intent: 'question', answer: 'ok', eventIds: x.none ? [] : [...(x.includes || [])] };
  if (x.intent === 'delete') return { intent: 'delete', eventIds: [...x.ids] };
  return {
    intent: 'create',
    events: x.events.map(e => ({
      title: e.example || 'Untitled', date: e.date, startTime: e.startTime,
      endTime: e.endTime || '', description: '', location: ''
    }))
  };
}

function selfTest(cases) {
  const problems = [];
  for (const c of cases) {
    const perfect = grade(c, perfectResult(c));
    if (!perfect.pass) problems.push(`grader: perfect result fails ${c.id}: ${perfect.reasons.join('; ')}`);
    const empty = grade(c, {});
    if (empty.pass) problems.push(`grader: empty result passes ${c.id}`);
    const emptyIntent = grade(c, { intent: c.expect.intent, eventIds: [], events: [], answer: '' });
    const intentOnly = c.expect.intent === 'question' && (c.expect.none || !c.expect.includes?.length);
    if (!intentOnly && emptyIntent.pass) problems.push(`grader: right intent with no content passes ${c.id}`);
  }

  // The expected answers must agree with the deterministic search the agent's tools use
  const search = (now, query) => searchEvents(normalized, query, { now: localToDate(now), timeZone: TIME_ZONE }).events.map(e => e.id);
  const checks = [
    ['next anything', DEFAULT_NOW, { status: 'upcoming', order: 'asc', limit: 1 }, ['gym-2026-11-11']],
    ['right now', DEFAULT_NOW, { status: 'now' }, ['study-session']],
    ['next interview', DEFAULT_NOW, { keywords: ['interview'], status: 'upcoming', order: 'asc', limit: 1 }, ['northwind-interview']],
    ['last interview', DEFAULT_NOW, { keywords: ['interview'], status: 'past', order: 'desc', limit: 1 }, ['orbital-interview']],
    ['next dentist', DEFAULT_NOW, { keywords: ['dentist', 'dental'], status: 'upcoming', order: 'asc', limit: 1 }, ['dentist-2026-11-15']],
    ['last dentist', DEFAULT_NOW, { keywords: ['dentist', 'dental'], status: 'past', order: 'desc', limit: 1 }, ['dental-checkup']],
    ['last doctor', DEFAULT_NOW, { keywords: ['dr.', 'doctor', 'physical'], status: 'past', order: 'desc', limit: 1 }, ['physical']],
    ['next class', DEFAULT_NOW, { keywords: ['lecture', 'class'], status: 'upcoming', order: 'asc', limit: 1 }, ['lecture-2026-11-12']],
    ['next dinner john', DEFAULT_NOW, { keywords: ['john'], status: 'upcoming', order: 'asc', limit: 1 }, ['dinner-john-nov']],
    ['last haircut', DEFAULT_NOW, { keywords: ['haircut'], status: 'past', order: 'desc', limit: 1 }, ['haircut']],
    ['flight to NY', DEFAULT_NOW, { keywords: ['nyc', 'new york'], status: 'upcoming', order: 'asc', limit: 1 }, ['flight-nyc-nov']],
    ['mars', DEFAULT_NOW, { keywords: ['mars'] }, []],
    ['yoga', DEFAULT_NOW, { keywords: ['yoga'] }, []],
    ['tomorrow', DEFAULT_NOW, { from: '2026-11-11', to: '2026-11-11' }, ['gym-2026-11-11', 'busy-2026-11-11', 'northwind-interview']],
    ['last weekend', DEFAULT_NOW, { from: '2026-11-07', to: '2026-11-08' }, ['hike', 'free-2026-11-08', 'brunch']],
    ['friday', DEFAULT_NOW, { from: '2026-11-13', to: '2026-11-13' }, ['gym-2026-11-13', 'tentative']],
    ['thanksgiving', DEFAULT_NOW, { from: '2026-11-26', to: '2026-11-26' }, ['thanksgiving']],
    ['earlier today', DEFAULT_NOW, { from: '2026-11-10', to: '2026-11-10', status: 'past' }, ['lecture-2026-11-10', 'busy-2026-11-10', 'orbital-interview', 'hi']],
    ['next while in progress', '2026-11-12T14:00', { status: 'upcoming', order: 'asc', limit: 1 }, ['long-horizon-talk']],
    ['in progress thu', '2026-11-12T14:00', { status: 'now' }, ['harbor-interview']],
    ['next dentist same day', '2026-11-15T09:30', { keywords: ['dentist'], status: 'upcoming', order: 'asc', limit: 1 }, ['dentist-2026-11-15']],
    ['last dentist same day', '2026-11-15T12:00', { keywords: ['dentist'], status: 'past', order: 'desc', limit: 1 }, ['dentist-2026-11-15']],
    ['dinner john next week', DEFAULT_NOW, { keywords: ['john'], from: '2026-11-15', to: '2026-11-21' }, ['dinner-john-nov']],
    ['gym rest of this week', DEFAULT_NOW, { keywords: ['gym'], status: 'upcoming', to: '2026-11-14' }, ['gym-2026-11-11', 'gym-2026-11-13']]
  ];
  for (const [name, now, query, want] of checks) {
    const got = search(now, query);
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`search "${name}": expected [${want.join(', ')}], got [${got.join(', ')}]`);
  }

  // DST: an event after Nov 1 is UTC-8, before is UTC-7
  const iso = (id) => rawEvents.find(e => e.id === id).start.dateTime;
  if (iso('orbital-interview') !== '2026-11-10T21:30:00.000Z') problems.push(`DST: orbital starts ${iso('orbital-interview')}`);
  if (iso('dental-checkup') !== '2026-10-20T22:00:00.000Z') problems.push(`DST: dental checkup starts ${iso('dental-checkup')}`);

  return { problems, graderCases: cases.length, searchChecks: checks.length };
}

// ---------- real run ----------
async function runEngine(engine, model, cases, verbose) {
  const llm = createLLM({ model, maxRetries: 6, maxWaitMs: 60000 });
  const rows = [];
  for (const c of cases) {
    const now = localToDate(c.now ?? DEFAULT_NOW);
    const started = Date.now();
    let result = null;
    let error = null;
    try {
      result = await runAssistant(c.message, rawEvents, { engine, now, timeZone: TIME_ZONE, llm });
    } catch (err) {
      error = err?.message || String(err);
    }
    const latencyMs = Date.now() - started;
    const graded = error ? { pass: false, reasons: [`error: ${error}`] } : grade(c, result);
    rows.push({ id: c.id, category: c.category, message: c.message, now: c.now ?? DEFAULT_NOW, expect: serializeExpect(c.expect), result, error, latencyMs, ...graded });
    process.stdout.write(graded.pass ? '.' : 'F');
    if (verbose) process.stdout.write(` ${c.id} (${latencyMs} ms)\n`);
  }
  process.stdout.write('\n');
  return { engine, model: llm.model, usage: { ...llm.usage }, rows };
}

const serializeExpect = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v instanceof RegExp ? String(v) : v)));

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(0)}%` : '-';
}

function printReport(runs, cases, verbose) {
  const categories = CATEGORIES.filter(cat => cases.some(c => c.category === cat));
  const colW = Math.max(12, ...runs.map(r => r.engine.length + 2));
  const pad = (s, w) => String(s).padEnd(w);
  const header = pad('category', 10) + runs.map(r => pad(r.engine, colW)).join('');
  console.log(`\n${header}\n${'-'.repeat(header.length)}`);
  for (const cat of categories) {
    const cells = runs.map(r => {
      const rows = r.rows.filter(x => x.category === cat);
      return pad(`${rows.filter(x => x.pass).length}/${rows.length}`, colW);
    });
    console.log(pad(cat, 10) + cells.join(''));
  }
  console.log('-'.repeat(header.length));
  const line = (label, fn) => console.log(pad(label, 10) + runs.map(r => pad(fn(r), colW)).join(''));
  line('overall', r => {
    const p = r.rows.filter(x => x.pass).length;
    return `${p}/${r.rows.length} ${pct(p, r.rows.length)}`;
  });
  line('avg ms', r => Math.round(r.rows.reduce((s, x) => s + x.latencyMs, 0) / (r.rows.length || 1)));
  line('tokens', r => r.usage.promptTokens + r.usage.completionTokens);
  line('llm calls', r => r.usage.calls);

  for (const r of runs) {
    const failures = r.rows.filter(x => !x.pass);
    if (failures.length === 0) continue;
    console.log(`\nFailures — ${r.engine} (${r.model}):`);
    for (const f of failures) {
      const c = cases.find(x => x.id === f.id);
      console.log(`  ✗ ${f.id} [${f.category}] ${JSON.stringify(f.message)}${c.now ? ` @ ${c.now}` : ''}`);
      console.log(`      expected: ${describeExpect(c.expect)}`);
      console.log(`      got:      ${f.error ? `error: ${f.error}` : describeResult(f.result)}`);
      console.log(`      why:      ${f.reasons.join('; ')}`);
      if (verbose && f.result?.trace) console.log(`      trace:    ${JSON.stringify(f.result.trace, null, 2).replace(/\n/g, '\n      ')}`);
    }
  }
}

// ---------- main ----------
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let cases = allCases;
  if (opts.only) {
    const unknown = opts.only.filter(id => !allCases.some(c => c.id === id));
    if (unknown.length) console.warn(`Unknown case id(s): ${unknown.join(', ')}`);
    cases = cases.filter(c => opts.only.includes(c.id));
  }
  if (opts.category) cases = cases.filter(c => opts.category.includes(c.category));

  const errors = validate(allCases);
  if (opts.dry) {
    const counts = Object.fromEntries(CATEGORIES.map(cat => [cat, allCases.filter(c => c.category === cat).length]));
    console.log(`Fixture: ${rawEvents.length} events. Cases: ${allCases.length} (${cases.length} selected).`);
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
  const provider = llmProvider();
  if (provider === 'anthropic' ? !process.env.ANTHROPIC_API_KEY : !groqKey()) {
    console.error('No AI key found. Add ANTHROPIC_API_KEY (Claude) or GROQ_API_KEY to client/.env, or run with --dry / --self-test for offline checks.');
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
  const model = opts.model || activeModel();

  console.log(`Running ${cases.length} case(s) × ${engines.join(', ')} on ${provider}:${model} (now ${DEFAULT_NOW} ${TIME_ZONE})`);
  const runs = [];
  for (const engine of engines) {
    process.stdout.write(`${engine}: `);
    runs.push(await runEngine(engine, model, cases, opts.verbose));
  }

  printReport(runs, cases, opts.verbose);

  const outDir = join(HERE, 'results');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '_');
  for (const r of runs) {
    const file = join(outDir, `${safe(r.engine)}-${safe(r.model)}-${stamp}.json`);
    const passed = r.rows.filter(x => x.pass).length;
    writeFileSync(file, JSON.stringify({
      engine: r.engine,
      model: r.model,
      startedAt: stamp,
      now: DEFAULT_NOW,
      timeZone: TIME_ZONE,
      summary: {
        passed,
        total: r.rows.length,
        accuracy: r.rows.length ? passed / r.rows.length : 0,
        avgLatencyMs: Math.round(r.rows.reduce((s, x) => s + x.latencyMs, 0) / (r.rows.length || 1)),
        usage: r.usage,
        byCategory: Object.fromEntries(CATEGORIES.map(cat => {
          const rows = r.rows.filter(x => x.category === cat);
          return [cat, { passed: rows.filter(x => x.pass).length, total: rows.length }];
        }).filter(([, v]) => v.total > 0))
      },
      cases: r.rows
    }, null, 2));
    console.log(`\nWrote ${file}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
