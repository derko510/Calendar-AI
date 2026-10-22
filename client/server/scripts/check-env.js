// Checks the backend's keys and connections from your machine: `npm run check-env` (reads client/.env).
// Makes one tiny request to Groq and the database. Never prints secret values.
import 'dotenv/config';
import pg from 'pg';

let failures = 0;
const ok = (name, detail = '') => console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail) => { failures++; console.log(`  ❌ ${name} — ${detail}`); };
const skip = (name, detail) => console.log(`  ⚪ ${name} — ${detail}`);

async function checkGroq() {
  if (!process.env.GROQ_API_KEY) return fail('GROQ_API_KEY', 'not set (the chat needs it)');
  const { generate, groqModel } = await import('../src/services/llm.js');
  try {
    const raw = await generate('Respond with ONLY this JSON object: {"ok":true}', { temperature: 0, maxTokens: 20, json: true });
    JSON.parse(raw).ok === true
      ? ok('GROQ_API_KEY', `${groqModel()} answered`)
      : fail('GROQ_API_KEY', `unexpected reply: ${raw.slice(0, 120)}`);
  } catch (err) {
    fail('GROQ_API_KEY', err.message === 'rate_limited' ? 'rate limited (key works, try again later)' : String(err.message).slice(0, 300));
  }
}

async function checkDatabase() {
  if (!process.env.DATABASE_URL) return skip('DATABASE_URL', 'not set (chat still works; events are kept in memory)');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    await pool.query('select 1');
    const { rows } = await pool.query(
      "select to_regclass('public.users') as users, to_regclass('public.calendar_events') as events"
    );
    rows[0].users && rows[0].events
      ? ok('DATABASE_URL', 'connected, tables exist')
      : fail('DATABASE_URL', 'connected, but tables are missing. Run: npm run db:push');
  } catch (err) {
    fail('DATABASE_URL', err.message);
  } finally {
    await pool.end();
  }
}

console.log('\nAI (Groq)');
await checkGroq();

console.log('\nDatabase');
await checkDatabase();

console.log('\nOther settings');
for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'JWT_SECRET', 'FRONTEND_URL']) {
  process.env[name] ? ok(name, 'set') : skip(name, 'not set');
}

console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll configured checks passed.\n');
process.exit(failures ? 1 : 0);
