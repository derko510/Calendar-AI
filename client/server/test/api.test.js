// HTTP-level checks of the API entry point (api/index.js): health shape, CORS, body errors, 404s. No network or AI keys.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.VERCEL = '1'; // must be set before the import so the app does not listen on its own
const SECRET_VALUES = {
  GROQ_API_KEY: 'gsk_test_secret_value_1234567890',
  ANTHROPIC_API_KEY: 'sk-ant-test-secret-value-1234567890',
  GOOGLE_CLIENT_SECRET: 'google-secret-value-1234567890',
  SESSION_SECRET: 's'.repeat(40)
};
Object.assign(process.env, SECRET_VALUES, { GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com' });
delete process.env.ALLOWED_ORIGINS;

const { default: app } = await import('../../api/index.js');

let server;
let port;

before(async () => {
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(() => new Promise(resolve => server.close(resolve)));

// node:http (not fetch) so tests can send any Origin header, including "null"
function request(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('health reports configuration without any key material', async () => {
  const { status, text, json } = await request('/api/health');
  assert.equal(status, 200);
  for (const field of ['status', 'timestamp', 'engine', 'provider', 'model', 'hasGroqKey', 'hasAnthropicKey', 'authConfigured', 'ownersConfigured', 'publicAccess', 'demoChat', 'commit']) {
    assert.ok(field in json, `missing ${field}`);
  }
  assert.equal(json.hasGroqKey, true);
  assert.equal(json.hasAnthropicKey, true);
  assert.equal(json.authConfigured, true);
  assert.equal(typeof json.demoChat, 'boolean');
  assert.equal(typeof json.ownersConfigured, 'boolean');
  assert.equal(typeof json.publicAccess, 'boolean');
  assert.equal(json.allowlist, undefined);
  assert.equal(json.groqKey, undefined);
  for (const value of Object.values(SECRET_VALUES)) {
    assert.ok(!text.includes(value), 'secret leaked');
    assert.ok(!text.includes(value.slice(0, 8)), 'key prefix leaked');
    assert.ok(!text.includes(value.slice(-4)), 'key suffix leaked');
  }
});

test('Origin: null is rejected with a clean 403', async () => {
  const { status, json } = await request('/api/health', { headers: { Origin: 'null' } });
  assert.equal(status, 403);
  assert.equal(json.error, 'origin_not_allowed');
});

test('a foreign origin is rejected with a clean 403', async () => {
  const { status, json } = await request('/api/health', { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(status, 403);
  assert.equal(json.error, 'origin_not_allowed');
});

test('same-origin and listed origins pass', async () => {
  const same = await request('/api/health', { headers: { Origin: `http://127.0.0.1:${port}` } });
  assert.equal(same.status, 200);
  const dev = await request('/api/health', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(dev.status, 200);
});

test('malformed JSON is a 400', async () => {
  const { status, json } = await request('/api/assistant/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"message": '
  });
  assert.equal(status, 400);
  assert.equal(json.error, 'bad_json');
});

test('an oversized body is a 413', async () => {
  const body = JSON.stringify({ message: 'hi', events: [], pad: 'x'.repeat(3 * 1024 * 1024) });
  const { status, json } = await request('/api/assistant/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    body
  });
  assert.equal(status, 413);
  assert.equal(json.error, 'payload_too_large');
});

test('an unknown /api path is a 404', async () => {
  const { status, json } = await request('/api/nope');
  assert.equal(status, 404);
  assert.equal(json.error, 'Not found');
});
