# Assistant evals

Runs fixed chat messages against a frozen calendar and grades what the assistant returns.
Use it to compare engines (`agent`, `prompt-v1`, `prompt-v0`) and models (Claude or Groq).

## What's measured

- **Calendar:** `fixtures/calendar.js` has about 75 Google-shaped events in America/Los_Angeles, with "now" frozen at Tue 2026-11-10 17:27. It includes recurring gym and lecture instances, all-day events, "Busy" blocks and the DST change on Nov 1. The raw order is per calendar, not chronological, the same way the v0 prompt received it.
- **Cases:** `cases.js` has 37 cases in these categories: `next`, `last`, `now`, `keyword` (synonyms such as doctor → Dr. Patel), `range` (tomorrow, last weekend), `none`, `typo`, `create`, `delete`, `intent` (a question must not turn into a create).
- **Grading:** `grade.js` grades the structured result, not the answer text:
  - questions: the right event ids are cited (`includes`), wrong ones are not (`excludes`), or no ids are cited (`none`);
  - creates: same number of events, and each one matches on date, start time, end time when given, and a title regex;
  - deletes: exactly the expected set of ids.
- **Report:** pass/total per category for each engine, overall accuracy, average latency, total tokens and LLM calls, and a list of failures (expected vs. got, with the ids resolved to titles and times). The full JSON goes to `results/<engine>-<model>-<timestamp>.json`.

## Run

```bash
node evals/run.js --dry                    # validate cases + fixture, no network
node evals/run.js --self-test              # offline: grader + expected answers vs. deterministic search
node evals/run.js                          # agent engine on the configured provider (Groq first, Claude fallback, as in production)
node evals/run.js --engine all             # agent, prompt-v1, prompt-v0
node evals/run.js --model claude-haiku-5-5 --category next,last --verbose
node evals/run.js --model openai/gpt-oss-120b      # any Groq model id
node evals/run.js --only next-anything,last-dentist
```

`--model claude-*` runs on Claude and any other id on Groq; without `--model` the run uses whichever provider is configured. Real runs need `ANTHROPIC_API_KEY` and/or `GROQ_API_KEY` in `client/.env`. Cases run one after another, and rate limits are retried for up to 60 s, so a full `--engine all` run on the Groq free tier takes a few minutes. Real runs always exit 0 because the output is a report, not a gate.

## Add a case

1. Add an entry to `cases.js`: `{ id, category, message, now?, expect }`. `now` is local time `YYYY-MM-DDTHH:MM` and defaults to `DEFAULT_NOW`. See the comment at the top of the file for the `expect` shapes. Create expectations need an `example` title that the regex accepts.
2. If the case needs new events, add rows to `fixtures/calendar.js` with readable, stable ids. Be careful about existing questions: for example, adding events to Fri 11-13 or tomorrow changes what "What's on Friday?" should cite, and engines return at most 3 ids.
3. Run `node evals/run.js --dry` and `--self-test`. For a time-sensitive question, also add a matching check to the `checks` list in `selfTest()` so the expected answer stays consistent with `searchEvents`.

## Suites and flags

- **Two suites.** `core` is the original 37 cases, kept unchanged so results stay comparable over time.
  `extended` is 20 harder cases (follow-ups with history, several events in one message, overnight events,
  relative dates, ambiguous deletes, prompt injection in an event title, a non-US time zone, a 300-event
  calendar). They are reported separately.
- `--suite core|extended` runs one suite. `--runs N` repeats and reports the mean and min–max.
- `--engine agent|prompt-v1|prompt-v0|all` picks the version; `--model <id>` picks the model
  (`claude-haiku-5-5`, or a Groq id such as `openai/gpt-oss-120b`).
- Requests are paced to the provider's tokens-per-minute limit (`--tpm`). A rate limit that outlasts the
  retries reruns the case; waiting time is reported separately from latency.
- **Groq's free tier allows 200,000 tokens per model per day.** A full run uses about 150,000, so plan on one
  full Groq run per model per day. A case that could not run is marked `R` and is not graded.
- Some cases also check the answer text (`answerMatches`). For the core suite that is reported as a separate
  "answer text" figure, so the main pass rate still means what it did before.
