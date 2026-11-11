// Checks the app's settings from your machine: `npm run check-env` (reads client/.env).
// Makes one tiny request to the AI provider. Never prints secret values.
import 'dotenv/config';
import { createLLM, llmProvider, activeModel, groqModel, anthropicModel } from '../src/services/llm.js';
import { ownerEmails, publicAccess, demoChatEnabled } from '../src/auth/requireUser.js';

let failures = 0;
const ok = (name, detail = '') => console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail) => { failures++; console.log(`  ❌ ${name} — ${detail}`); };

console.log('\nAI');

// Tests one provider's key with a tiny request, never printing the key
async function checkKey(keyName, model) {
  if (!process.env[keyName]) return fail(keyName, 'not set');
  try {
    const raw = await createLLM({ model }).generate('Respond with ONLY this JSON object: {"ok":true}', { maxTokens: 20, json: true });
    JSON.parse(raw).ok === true ? ok(keyName, `${model} answered`) : fail(keyName, `unexpected reply: ${raw.slice(0, 120)}`);
  } catch (err) {
    fail(keyName, err.message === 'rate_limited' ? 'rate limited (key works, try again later)' : String(err.message).slice(0, 300));
  }
}

if (!process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  fail('AI key', 'set GROQ_API_KEY and/or ANTHROPIC_API_KEY (the chat needs one)');
} else {
  // Groq serves everyone who is not an owner (and backs up Claude); Claude serves OWNER_EMAILS
  if (process.env.GROQ_API_KEY) await checkKey('GROQ_API_KEY', groqModel());
  else console.log('  ⚠️  GROQ_API_KEY — not set: visitors and the demo will have no assistant');
  if (process.env.ANTHROPIC_API_KEY) await checkKey('ANTHROPIC_API_KEY', anthropicModel());
  else console.log('  ⚠️  ANTHROPIC_API_KEY — not set: owners will use Groq');
  console.log(`  ℹ️  ${llmProvider()}`);
  console.log(`  ℹ️  models: ${activeModel()}`);
}

console.log('\nWho gets which AI');
ownerEmails().length
  ? ok('OWNER_EMAILS', `${ownerEmails().length} owner account(s) get Claude`)
  : console.log('  ⚠️  OWNER_EMAILS — not set: nobody is an owner, so everyone (including you) gets Groq');
console.log(`  ℹ️  public access ${publicAccess() ? 'on' : 'off'} · demo chat ${demoChatEnabled() ? 'on' : 'off'}`);

console.log('\nGoogle sign-in');
const isPlaceholder = v => /^your_|^replace_with/.test(v || '');
const viteClientId = process.env.VITE_GOOGLE_CLIENT_ID || '';
const serverClientId = process.env.GOOGLE_CLIENT_ID || '';
!viteClientId || isPlaceholder(viteClientId)
  ? fail('VITE_GOOGLE_CLIENT_ID', 'not set (sign-in needs it)')
  : ok('VITE_GOOGLE_CLIENT_ID', 'set');

if (!serverClientId) {
  viteClientId && !isPlaceholder(viteClientId)
    ? ok('GOOGLE_CLIENT_ID', 'not set, using VITE_GOOGLE_CLIENT_ID')
    : fail('GOOGLE_CLIENT_ID', 'not set (the server needs the OAuth client ID)');
} else if (isPlaceholder(serverClientId)) {
  fail('GOOGLE_CLIENT_ID', 'still the placeholder from .env.example');
} else if (viteClientId && serverClientId !== viteClientId) {
  fail('GOOGLE_CLIENT_ID', 'differs from VITE_GOOGLE_CLIENT_ID (they must be the same OAuth client)');
} else {
  ok('GOOGLE_CLIENT_ID', 'set');
}

const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
!clientSecret || isPlaceholder(clientSecret)
  ? fail('GOOGLE_CLIENT_SECRET', 'not set (needed to keep you signed in)')
  : ok('GOOGLE_CLIENT_SECRET', 'set');

const sessionSecret = process.env.SESSION_SECRET || '';
if (!sessionSecret || isPlaceholder(sessionSecret)) {
  fail('SESSION_SECRET', "not set (generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\")");
} else if (sessionSecret.length < 32) {
  fail('SESSION_SECRET', `too short (${sessionSecret.length} chars, needs 32+)`);
} else {
  ok('SESSION_SECRET', `set (${sessionSecret.length} chars)`);
}

if (process.env.VITE_GOOGLE_CLIENT_SECRET || process.env.VITE_SESSION_SECRET) {
  fail('VITE_* secret', 'a secret has a VITE_ prefix, which would ship it to the browser; remove the prefix');
}

console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
