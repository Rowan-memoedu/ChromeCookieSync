export const EXPORT_SCHEMA = "local.chrome-cookie-snapshot";
export const EXPORT_SCHEMA_VERSION = 1;
export const PRODUCER_NAME = "chrome-cookie-sync-extension";
export const PRODUCER_VERSION = "1.1.0";

const SAME_SITE_VALUES = new Set([
  "no_restriction",
  "lax",
  "strict",
  "unspecified"
]);

function optionalString(value) {
  return typeof value === "string" ? value : undefined;
}

function normalizePartitionKey(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const normalized = {};
  const topLevelSite = optionalString(value.topLevelSite);
  if (topLevelSite !== undefined) normalized.topLevelSite = topLevelSite;
  if (typeof value.hasCrossSiteAncestor === "boolean") {
    normalized.hasCrossSiteAncestor = value.hasCrossSiteAncestor;
  }
  return normalized;
}

export function normalizeCookie(cookie) {
  const session = cookie?.session === true;
  const expirationDate = Number(cookie?.expirationDate);
  return {
    name: String(cookie?.name ?? ""),
    value: String(cookie?.value ?? ""),
    domain: String(cookie?.domain ?? ""),
    hostOnly: cookie?.hostOnly === true,
    path: String(cookie?.path ?? "/"),
    secure: cookie?.secure === true,
    httpOnly: cookie?.httpOnly === true,
    sameSite: SAME_SITE_VALUES.has(cookie?.sameSite)
      ? cookie.sameSite
      : "unspecified",
    session,
    expirationDate: session || !Number.isFinite(expirationDate)
      ? null
      : expirationDate,
    storeId: String(cookie?.storeId ?? ""),
    partitionKey: normalizePartitionKey(cookie?.partitionKey)
  };
}

export async function readAllAccessibleCookies(cookiesApi) {
  if (!cookiesApi || typeof cookiesApi.getAll !== "function") {
    throw new Error("chrome_cookie_api_unavailable");
  }
  const cookies = await cookiesApi.getAll({ partitionKey: {} });
  if (!Array.isArray(cookies)) throw new Error("chrome_cookie_read_invalid");
  return cookies.map(normalizeCookie);
}

export async function readCurrentProfile(cookiesApi) {
  const cookies = await readAllAccessibleCookies(cookiesApi);
  const stores = typeof cookiesApi?.getAllCookieStores === "function"
    ? await cookiesApi.getAllCookieStores()
    : [];
  const storeIds = new Set(cookies.map((cookie) => cookie.storeId));
  for (const store of Array.isArray(stores) ? stores : []) {
    if (typeof store?.id === "string") storeIds.add(store.id);
  }
  return { cookies, storeIds: [...storeIds].sort() };
}

export function buildSnapshot(cookies, options = {}) {
  if (!Array.isArray(cookies)) throw new TypeError("cookies_must_be_array");
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const snapshotId = options.snapshotId ?? crypto.randomUUID();
  const storeIds = Array.isArray(options.storeIds)
    ? [...new Set(options.storeIds.map(String))].sort()
    : [...new Set(cookies.map((cookie) => String(cookie.storeId)))].sort();
  return {
    schema: EXPORT_SCHEMA,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    sensitivity: "local_sensitive_credential",
    snapshotId,
    generatedAt,
    producer: {
      name: PRODUCER_NAME,
      version: PRODUCER_VERSION,
      api: "chrome.cookies.getAll",
      partitionQuery: "all_partition_keys"
    },
    profile: {
      browser: "Google Chrome",
      scope: "current_regular_profile",
      storeIds
    },
    cookies
  };
}

export function safeReceipt(snapshot) {
  const cookies = Array.isArray(snapshot?.cookies) ? snapshot.cookies : [];
  const domainKeys = new Set(
    cookies.map((cookie) => String(cookie.domain || "").replace(/^\./u, "").toLowerCase())
  );
  return {
    cookieCount: cookies.length,
    domainCount: domainKeys.size,
    sessionCount: cookies.filter((cookie) => cookie.session === true).length,
    partitionedCount: cookies.filter((cookie) => cookie.partitionKey !== null).length
  };
}

export function snapshotFilename(snapshot) {
  const safeTimestamp = String(snapshot?.generatedAt || "unknown").replace(/[:.]/gu, "-");
  const safeId = String(snapshot?.snapshotId || "no-id").replace(/[^0-9A-Za-z-]/gu, "");
  return `chrome-cookie-snapshot-v1-${safeTimestamp}-${safeId}.json`;
}
