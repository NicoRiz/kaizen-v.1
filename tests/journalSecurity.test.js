import assert from "node:assert/strict";
import test from "node:test";
import { createJournalHandler } from "../api/analyze-journal.js";
import { createJournalLimiter } from "../server/journalSecurity.js";

const env = { VITE_SUPABASE_URL: "https://auth.example.test", VITE_SUPABASE_PUBLISHABLE_KEY: "public-test", OPENAI_API_KEY: "server-only-test", OPENAI_MODEL: "existing-model-test" };
const analysis = { summary: "Test", progress: [], obstacles: [], hypotheses: [], suggestedSteps: [], patterns: [] };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const request = (extra = {}) => ({ method: "POST", headers: { authorization: "Bearer test-session" }, body: { journal: "Test journal" }, ...extra });
function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
}
function setup({ auth = { id: "user-1", role: "authenticated" }, authStatus = 200, provider = () => json({ output_text: JSON.stringify(analysis) }), config = env } = {}) {
  const calls = [];
  const handler = createJournalHandler({ env: config, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) return json(auth, authStatus);
    assert.equal(url, "https://api.openai.com/v1/responses");
    return provider(options);
  } });
  return { calls, run: async (req = request()) => { const res = response(); await handler(req, res); return res; } };
}

test("missing bearer token and wrong method never reach auth or OpenAI", async () => {
  const app = setup();
  assert.equal((await app.run(request({ headers: {} }))).statusCode, 401);
  const res = await app.run(request({ method: "GET" }));
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
  assert.equal(app.calls.length, 0);
});

test("expired, forged and anonymous sessions cannot reach OpenAI", async () => {
  for (const options of [{ authStatus: 401 }, { authStatus: 403 }, { auth: { id: "anon", role: "authenticated", is_anonymous: true } }, { auth: { id: "forged" } }]) {
    const app = setup(options);
    assert.equal((await app.run()).statusCode, 401);
    assert.equal(app.calls.length, 1);
  }
});

test("missing configuration and auth outages fail closed", async () => {
  for (const options of [{ config: {} }, { config: { ...env, OPENAI_API_KEY: "" } }, { authStatus: 500 }]) {
    const app = setup(options);
    assert.equal((await app.run()).statusCode, 503);
    assert.ok(app.calls.every((call) => !call.url.includes("openai.com")));
  }
  const handler = createJournalHandler({ env, fetchImpl: async () => { throw new Error("offline"); } });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 503);
});

test("verified user keeps existing provider, model and structured response; secrets stay server-side", async () => {
  const app = setup();
  const res = await app.run();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.analysis.summary, "Test");
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(app.calls[0].options.headers.Authorization, "Bearer test-session");
  const options = app.calls[1].options;
  assert.equal(options.headers.Authorization, "Bearer server-only-test");
  const input = JSON.parse(options.body);
  assert.equal(input.model, "existing-model-test");
  assert.equal(input.store, false);
  assert.equal(input.max_output_tokens, 1800);
  assert.equal(input.text.format.strict, true);
  assert.ok(options.signal);
  assert.ok(!JSON.stringify(res.body).includes(env.OPENAI_API_KEY));
});

test("invalid and oversized bodies never reach the provider", async () => {
  const app = setup();
  for (const body of [null, "{", { journal: "" }, { journal: "x".repeat(60001) }, "x".repeat(60001)]) {
    assert.ok([400, 413].includes((await app.run(request({ body }))).statusCode));
  }
  assert.ok(app.calls.every((call) => call.url.endsWith("/auth/v1/user")));
});

test("per-user burst limiter rejects the third provider request with retry-after", async () => {
  const app = setup();
  assert.equal((await app.run()).statusCode, 200);
  assert.equal((await app.run()).statusCode, 200);
  const res = await app.run();
  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.headers["Retry-After"]) > 0);
  assert.equal(app.calls.filter((call) => call.url.includes("openai.com")).length, 2);
});

test("limiter isolates users, concurrent requests, hourly cap and expiry", () => {
  let time = 0;
  const limiter = createJournalLimiter({ now: () => time });
  const first = limiter.acquire("a");
  assert.equal(limiter.acquire("a").allowed, false);
  limiter.acquire("b").release();
  first.release();
  for (let i = 1; i < 10; i++) { time += 61000; limiter.acquire("a").release(); }
  time += 61000;
  assert.equal(limiter.acquire("a").allowed, false);
  time = 3600001;
  assert.equal(limiter.acquire("a").allowed, true);
});

test("credit, provider limits, invalid output and timeouts return safe errors without retries", async () => {
  const scenarios = [
    { provider: () => json({ error: { type: "insufficient_quota" } }, 429), status: 503, code: "AI_CREDIT_UNAVAILABLE" },
    { provider: () => json({}, 429), status: 429, code: "AI_RATE_LIMIT" },
    { provider: () => json({}, 401), status: 503 },
    { provider: () => json({}, 500), status: 502 },
    { provider: () => json({ output_text: "invalid" }), status: 502 },
    { provider: () => { throw new DOMException("test timeout", "TimeoutError"); }, status: 504 },
  ];
  for (const item of scenarios) {
    const app = setup(item);
    const res = await app.run();
    assert.equal(res.statusCode, item.status);
    if (item.code) assert.equal(res.body.code, item.code);
    assert.equal(app.calls.length, 2);
    assert.notEqual((await app.run()).body.code, "ANALYSIS_LIMIT", "permit released after failure");
  }
});
