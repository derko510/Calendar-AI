// Pure grader: grade(testCase, result) → { pass, reasons[], answerOk }. No I/O, no clock.
// answerOk: null when the case has no answerMatches; otherwise whether the answer text matched every regex.
// For core cases answerOk is reported separately (so core pass rates stay comparable with older runs);
// for extended cases a failed answer check fails the case.

export const answerRegexes = (testCase) => {
  const m = testCase.answerMatches;
  return m === undefined ? [] : Array.isArray(m) ? m : [m];
};

export function grade(testCase, result) {
  const expect = testCase.expect;
  const reasons = [];

  if (!result || typeof result !== 'object') {
    return { pass: false, reasons: ['no result'], answerOk: answerRegexes(testCase).length ? false : null };
  }
  if (result.intent !== expect.intent) {
    reasons.push(`intent: expected "${expect.intent}", got "${result.intent ?? '(none)'}"`);
    return { pass: false, reasons, answerOk: answerRegexes(testCase).length ? false : null };
  }

  if (expect.intent === 'question') {
    const got = new Set(Array.isArray(result.eventIds) ? result.eventIds : []);
    if (expect.none) {
      if (got.size > 0) reasons.push(`expected no events, got [${[...got].join(', ')}]`);
    }
    for (const id of expect.includes || []) {
      if (!got.has(id)) reasons.push(`missing ${id}`);
    }
    for (const id of expect.excludes || []) {
      if (got.has(id)) reasons.push(`should not include ${id}`);
    }
  }

  if (expect.intent === 'delete') {
    const got = new Set(Array.isArray(result.eventIds) ? result.eventIds : []);
    const want = new Set(expect.ids);
    for (const id of want) if (!got.has(id)) reasons.push(`missing ${id}`);
    for (const id of got) if (!want.has(id)) reasons.push(`should not delete ${id}`);
  }

  if (expect.intent === 'create') {
    const got = Array.isArray(result.events) ? result.events : [];
    if (got.length !== expect.events.length) {
      reasons.push(`expected ${expect.events.length} event(s), got ${got.length}`);
    }
    const used = new Set();
    for (const want of expect.events) {
      const i = got.findIndex((e, idx) => !used.has(idx) && createMatches(want, e));
      if (i === -1) reasons.push(`no event matching ${describeCreate(want)}`);
      else used.add(i);
    }
  }

  const regexes = answerRegexes(testCase);
  let answerOk = null;
  if (regexes.length) {
    // No-break spaces / hyphens (gpt-oss writes "10:00" + U+202F + "AM") count as plain ones
    const text = String(result.answer || '').replace(/[\u00A0\u2007\u202F]/g, ' ').replace(/[\u2010\u2011]/g, '-');
    const missed = regexes.filter(r => !r.test(text));
    answerOk = missed.length === 0;
    if (!answerOk && testCase.suite === 'extended') reasons.push(`answer text does not match ${missed.map(String).join(', ')}`);
  }

  return { pass: reasons.length === 0, reasons, answerOk };
}

function createMatches(want, e) {
  if (!e || e.date !== want.date || e.startTime !== want.startTime) return false;
  if (want.endTime && e.endTime !== want.endTime) return false;
  if (want.endDate && e.endDate !== want.endDate) return false;
  if (want.title && !want.title.test(String(e.title || ''))) return false;
  return true;
}

export function describeCreate(e) {
  const title = e.title instanceof RegExp ? String(e.title) : JSON.stringify(e.title);
  return `${e.date} ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}${e.endDate ? ` (ends ${e.endDate})` : ''} title ${title}`;
}
