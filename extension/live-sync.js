import { readCurrentProfile, buildSnapshot } from "./sync-core.js";

export const SERVICE_ORIGIN = "http://127.0.0.1:37829";
export const SYNC_ALARM = "chrome-cookie-live-sync";
const STATUS_PATH = "/api/browser-import/cookies/status";
const SNAPSHOT_PATH = "/api/browser-import/cookies/snapshot";

function safeFailure(error) {
  const code = String(error?.message || "");
  return /^(?:cookie_sync|chrome_cookie|snapshot)_[a-z0-9_]+$/u.test(code) ? code : "cookie_sync_service_unreachable";
}

export function createLiveSync(api, { fetchImpl = fetch, origin = SERVICE_ORIGIN, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  // The production worker always uses SERVICE_ORIGIN. Injection exists for isolated HTTP tests.
  const target = new URL(origin);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.username || target.password || target.pathname !== "/" || target.search || target.hash) throw new Error("cookie_sync_loopback_target_required");
  let inFlight = null;
  let dirty = false;
  let timer;
  const settings = () => api.storage.local.get(["enabled", "syncStatus"]);
  const saveStatus = syncStatus => api.storage.local.set({ syncStatus });
  async function request(url, options = {}) {
    return fetchImpl(url, { cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(12_000), ...options });
  }
  async function once() {
    if (!(await settings()).enabled) return;
    try {
      const healthResponse = await request(`${target.origin}${STATUS_PATH}`);
      if (!healthResponse.ok) throw new Error("cookie_sync_receiver_unavailable");
      const health = await healthResponse.json();
      if (health.service !== "local-ir-browser-highlight" || health.schema !== "local-ir.chrome-live-sync/v1") throw new Error("cookie_sync_receiver_incompatible");
      if (!health.receiver_enabled) throw new Error("cookie_sync_manual_snapshot_mode");
      const profile = await readCurrentProfile(api.cookies);
      if (!(await settings()).enabled) return;
      const response = await request(`${target.origin}${SNAPSHOT_PATH}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildSnapshot(profile.cookies, { storeIds: profile.storeIds }))
      });
      const receipt = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(safeFailure({ message: receipt.error }));
      if (receipt.status !== "synchronized" || !receipt.loaded || receipt.persistence !== "local_credential_file") throw new Error("cookie_sync_receipt_invalid");
      await saveStatus({ state: "synchronized", at: receipt.last_sync_at, cookieCount: receipt.cookie_count, domainCount: receipt.domain_count });
    } catch (error) {
      await saveStatus({ state: "failed", error: safeFailure(error), attemptedAt: new Date().toISOString() });
    }
  }
  function sync() {
    dirty = true;
    if (!inFlight) inFlight = (async () => {
      do { dirty = false; await once(); } while (dirty);
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  async function ensureAlarm() {
    if ((await settings()).enabled) {
      if (!(await api.alarms.get(SYNC_ALARM))) await api.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
    } else await api.alarms.clear(SYNC_ALARM);
  }
  async function setEnabled(enabled) {
    await api.storage.local.set({ enabled: enabled === true });
    await ensureAlarm();
    if (enabled) await sync();
    else { clearTimer(timer); dirty = false; }
    return settings();
  }
  function changed() {
    clearTimer(timer);
    timer = setTimer(() => { void sync(); }, 1500);
  }
  async function start() { await ensureAlarm(); if ((await settings()).enabled) await sync(); }
  return { sync, changed, start, setEnabled, settings };
}
