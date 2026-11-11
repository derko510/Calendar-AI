// The chat route's gate: who is asking decides which AI tier they get.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireUser, isOwner, isEmailAllowed, takeToken, resetRateLimit } from '../src/auth/requireUser.js';
import { encryptSession, COOKIE_NAME, COOKIE_PATH } from '../src/auth/session.js';

const SECRET = 'x'.repeat(40);
const ENV = ['OWNER_EMAILS', 'ALLOWED_EMAILS', 'PUBLIC_ACCESS', 'DEMO_CHAT_ENABLED', 'PUBLIC_CHAT_LIMIT'];

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  for (const k of ENV) delete process.env[k];
  resetRateLimit();
});

function call({ cookie, body = {}, ip = '203.0.113.9' } = {}) {
  const headers = { cookie, 'x-forwarded-for': ip };
  const req = { body, ip, get: (h) => headers[h.toLowerCase()] };
  const out = { status: 200, body: null, nextCalled: false };
  const res = {
    status(code) { out.status = code; return this; },
    json(data) { out.body = data; return this; }
  };
  requireUser(req, res, () => { out.nextCalled = true; });
  return { ...out, user: req.user };
}

const cookieFor = (payload, secret = SECRET) =>
  `${COOKIE_NAME}=${encryptSession({ refreshToken: 'rt', sub: '123', ...payload }, secret)}`;

test('cookie path covers the chat route', () => {
  assert.equal(COOKIE_PATH, '/api');
});

test('no cookie and no demo flag → 401 signed_out, chat never runs', () => {
  const r = call();
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'signed_out');
  assert.equal(r.nextCalled, false);
});

test('tampered or foreign-secret cookie → 401', () => {
  const good = cookieFor({ email: 'me@example.com' });
  const tampered = good.slice(0, -4) + (good.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal(call({ cookie: tampered }).status, 401);
  assert.equal(call({ cookie: cookieFor({ email: 'me@example.com' }, 'y'.repeat(40)) }).status, 401);
});

test('owner email → owner tier (case-insensitive; ALLOWED_EMAILS is the legacy name)', () => {
  process.env.OWNER_EMAILS = ' Me@Example.com , second@example.com';
  const r = call({ cookie: cookieFor({ email: 'me@example.com' }) });
  assert.equal(r.nextCalled, true);
  assert.deepEqual(r.user, { sub: '123', email: 'me@example.com', owner: true });
  assert.equal(isOwner('SECOND@example.com'), true);

  delete process.env.OWNER_EMAILS;
  process.env.ALLOWED_EMAILS = 'me@example.com';
  assert.equal(call({ cookie: cookieFor({ email: 'me@example.com' }) }).user.owner, true);
});

test('any other signed-in account → public tier, never owner', () => {
  process.env.OWNER_EMAILS = 'me@example.com';
  const r = call({ cookie: cookieFor({ email: 'stranger@example.com', sub: '999' }) });
  assert.equal(r.nextCalled, true);
  assert.deepEqual(r.user, { sub: '999', email: 'stranger@example.com', owner: false });
});

test('with no owner list configured, nobody is an owner', () => {
  const r = call({ cookie: cookieFor({ email: 'me@example.com' }) });
  assert.equal(r.user.owner, false);
  assert.equal(isOwner(''), false);
});

test('PUBLIC_ACCESS=false: owners only, strangers 403, demo chat off', () => {
  process.env.OWNER_EMAILS = 'me@example.com';
  process.env.PUBLIC_ACCESS = 'false';
  assert.equal(call({ cookie: cookieFor({ email: 'me@example.com' }) }).user.owner, true);
  const blocked = call({ cookie: cookieFor({ email: 'stranger@example.com' }) });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'not_allowed');
  assert.equal(call({ body: { demo: true } }).body.error, 'demo_chat_disabled');
  assert.equal(isEmailAllowed('stranger@example.com'), false);
  assert.equal(isEmailAllowed('me@example.com'), true);
});

test('demo → public tier by default; DEMO_CHAT_ENABLED=false turns it off', () => {
  const r = call({ body: { demo: true } });
  assert.equal(r.nextCalled, true);
  assert.deepEqual(r.user, { demo: true, owner: false });

  process.env.DEMO_CHAT_ENABLED = 'false';
  const off = call({ body: { demo: true } });
  assert.equal(off.status, 403);
  assert.equal(off.body.error, 'demo_chat_disabled');
});

test('a signed-in owner is the owner even if the request also says demo', () => {
  process.env.OWNER_EMAILS = 'me@example.com';
  assert.equal(call({ cookie: cookieFor({ email: 'me@example.com' }), body: { demo: true } }).user.owner, true);
});

test('public tier is rate limited per visitor; owners are not', () => {
  process.env.OWNER_EMAILS = 'me@example.com';
  process.env.PUBLIC_CHAT_LIMIT = '3';
  for (let i = 0; i < 3; i++) assert.equal(call({ body: { demo: true }, ip: '198.51.100.1' }).nextCalled, true);
  const limited = call({ body: { demo: true }, ip: '198.51.100.1' });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error, 'rate_limited');
  assert.equal(call({ body: { demo: true }, ip: '198.51.100.2' }).nextCalled, true, 'another visitor is unaffected');

  const stranger = cookieFor({ email: 's@example.com', sub: '7' });
  for (let i = 0; i < 3; i++) assert.equal(call({ cookie: stranger }).nextCalled, true);
  assert.equal(call({ cookie: stranger }).status, 429);

  const owner = cookieFor({ email: 'me@example.com' });
  for (let i = 0; i < 10; i++) assert.equal(call({ cookie: owner }).nextCalled, true);
});

test('rate-limit window slides', () => {
  const t0 = 1_000_000;
  assert.equal(takeToken('k', t0, 1), true);
  assert.equal(takeToken('k', t0 + 1000, 1), false);
  assert.equal(takeToken('k', t0 + 10 * 60 * 1000 + 1, 1), true);
});
