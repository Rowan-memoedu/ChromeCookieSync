import test from "node:test";
import assert from "node:assert/strict";
import { createLiveSync, SYNC_ALARM } from "../extension/live-sync.js";

function fixture({ enabled = false, request } = {}) {
  const state = { enabled }; const alarm = new Map(); const requests = []; let reads = 0; let values = [];
  const api = {
    storage: { local: { get: async () => structuredClone(state), set: async value => { Object.assign(state, structuredClone(value)); } } },
    cookies: { getAll: async () => { reads++; return values; }, getAllCookieStores: async () => [{ id: "0" }] },
    alarms: { get: async name => alarm.get(name), create: async (name, info) => alarm.set(name, info), clear: async name => alarm.delete(name) }
  };
  let available = true;
  const sync = createLiveSync(api, { fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (request) await request(url, options);
    if (!available) throw new Error("private-cookie-value-must-not-appear");
    if (options.method !== "POST") return Response.json({ service: "local-ir-browser-highlight", schema: "local-ir.chrome-live-sync/v1", receiver_enabled: true });
    const snapshot = JSON.parse(options.body);
    return Response.json({ status: "synchronized", loaded: true, persistence: "local_credential_file", cookie_count: snapshot.cookies.length, domain_count: 1, last_sync_at: snapshot.generatedAt });
  }});
  return { sync, state, alarm, requests, reads: () => reads, cookies: v => { values = v; }, offline: () => { available = false; }, online: () => { available = true; }, api };
}

test("disabled startup never reads or sends credentials; opt-in creates recovery alarm", async () => {
  const f = fixture(); await f.sync.start(); assert.equal(f.reads(), 0); assert.equal(f.requests.length, 0);
  await f.sync.setEnabled(true); assert.equal(f.reads(), 1); assert.equal(f.alarm.get(SYNC_ALARM).periodInMinutes, 1);
  assert.equal(f.state.syncStatus.state, "synchronized");
  await f.sync.setEnabled(false); await f.sync.sync(); assert.equal(f.reads(), 1); assert.equal(f.alarm.size, 0);
});

test("a failed receiver is retried and its error cannot enter extension storage", async () => {
  const f = fixture({ enabled: true }); f.offline(); await f.sync.start();
  assert.equal(f.reads(), 0); assert.equal(f.state.syncStatus.error, "cookie_sync_service_unreachable");
  assert.ok(!JSON.stringify(f.state).includes("private-cookie-value"));
  f.online(); await f.sync.sync(); assert.equal(f.state.syncStatus.state, "synchronized");
  f.alarm.clear(); await f.sync.start(); assert.ok(f.alarm.has(SYNC_ALARM));
});

test("logout sends an empty full replacement and values never enter persistent extension state", async () => {
  const f = fixture({ enabled: true }); f.cookies([{ name: "session", value: "synthetic-private", storeId: "0" }]);
  await f.sync.start(); f.cookies([]); await f.sync.sync();
  const posted = f.requests.filter(r => r.options.method === "POST");
  assert.equal(JSON.parse(posted[0].options.body).cookies.length, 1);
  assert.equal(JSON.parse(posted[1].options.body).cookies.length, 0);
  assert.ok(!JSON.stringify(f.state).includes("synthetic-private"));
  assert.ok(posted.every(r => r.options.redirect === "error" && r.url.startsWith("http://127.0.0.1:37829/")));
});

test("a Cookie change during an in-flight sync causes another complete read", async () => {
  let release; let signal;
  const entered = new Promise(resolve => { signal = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  let once = true;
  const f = fixture({ enabled: true, request: async (_url, options) => { if (options.method === "POST" && once) { once = false; signal(); await barrier; } } });
  f.cookies([{ name: "first", value: "synthetic", storeId: "0" }]);
  const pending = f.sync.sync(); await entered; f.cookies([]); const changed = f.sync.sync(); release();
  await Promise.all([pending, changed]); assert.equal(f.reads(), 2);
  assert.equal(f.state.syncStatus.cookieCount, 0);
});

test("sync refuses remote, credential-bearing or path-bearing endpoints", () => {
  for (const origin of ["https://example.com", "http://localhost:37829", "http://user@127.0.0.1:37829", "http://127.0.0.1:37829/unexpected"]) {
    assert.throws(() => createLiveSync({}, { origin }), /cookie_sync_loopback_target_required/);
  }
});
