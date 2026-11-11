// Pure grader: grade(testCase, result) → { pass, reasons[] }. No I/O, no clock.

export function grade(testCase, result) {
  const expect = testCase.expect;
  const reasons = [];

  if (!result || typeof result !== 'object') {
    return { pass: false, reasons: ['no result'] };
  }
  if (result.intent !== expect.intent) {
    reasons.push(`intent: expected "${expect.intent}", got "${result.intent ?? '(none)'}"`);
    return { pass: false, reasons };
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

  return { pass: reasons.length === 0, reasons };
}

function createMatches(want, e) {
  if (!e || e.date !== want.date || e.startTime !== want.startTime) return false;
  if (want.endTime && e.endTime !== want.endTime) return false;
  if (want.title && !want.title.test(String(e.title || ''))) return false;
  return true;
}

export function describeCreate(e) {
  const title = e.title instanceof RegExp ? String(e.title) : JSON.stringify(e.title);
  return `${e.date} ${e.startTime}${e.endTime ? `–${e.endTime}` : ''} title ${title}`;
}
