import {
  EXPORT_SCHEMA,
  EXPORT_SCHEMA_VERSION
} from "../extension/sync-core.js";

const COOKIE_FIELDS = [
  "name",
  "value",
  "domain",
  "hostOnly",
  "path",
  "secure",
  "httpOnly",
  "sameSite",
  "session",
  "expirationDate",
  "storeId",
  "partitionKey"
];

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function validateCookie(cookie) {
  assert(cookie && typeof cookie === "object" && !Array.isArray(cookie), "snapshot_cookie_object_required");
  for (const field of COOKIE_FIELDS) {
    assert(Object.hasOwn(cookie, field), `snapshot_cookie_field_missing:${field}`);
  }
  assert(typeof cookie.name === "string", "snapshot_cookie_name_invalid");
  assert(typeof cookie.value === "string", "snapshot_cookie_value_invalid");
  assert(typeof cookie.domain === "string" && cookie.domain.length > 0, "snapshot_cookie_domain_invalid");
  assert(typeof cookie.hostOnly === "boolean", "snapshot_cookie_host_only_invalid");
  assert(typeof cookie.path === "string" && cookie.path.startsWith("/"), "snapshot_cookie_path_invalid");
  assert(typeof cookie.secure === "boolean", "snapshot_cookie_secure_invalid");
  assert(typeof cookie.httpOnly === "boolean", "snapshot_cookie_http_only_invalid");
  assert(["no_restriction", "lax", "strict", "unspecified"].includes(cookie.sameSite), "snapshot_cookie_same_site_invalid");
  assert(typeof cookie.session === "boolean", "snapshot_cookie_session_invalid");
  assert(cookie.session ? cookie.expirationDate === null : Number.isFinite(cookie.expirationDate), "snapshot_cookie_expiration_invalid");
  assert(typeof cookie.storeId === "string", "snapshot_cookie_store_id_invalid");
  assert(cookie.partitionKey === null
    || (typeof cookie.partitionKey === "object" && !Array.isArray(cookie.partitionKey)), "snapshot_cookie_partition_key_invalid");
}

export function parseSnapshot(text) {
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    throw new Error("snapshot_json_invalid");
  }
  assert(snapshot && typeof snapshot === "object" && !Array.isArray(snapshot), "snapshot_root_object_required");
  assert(snapshot.schema === EXPORT_SCHEMA, "snapshot_schema_unsupported");
  assert(snapshot.schemaVersion === EXPORT_SCHEMA_VERSION, "snapshot_schema_version_unsupported");
  assert(snapshot.sensitivity === "local_sensitive_credential", "snapshot_sensitivity_invalid");
  assert(typeof snapshot.snapshotId === "string" && snapshot.snapshotId.length > 0, "snapshot_id_invalid");
  assert(typeof snapshot.generatedAt === "string" && Number.isFinite(Date.parse(snapshot.generatedAt)), "snapshot_generated_at_invalid");
  assert(snapshot.producer?.name === "chrome-cookie-sync-extension", "snapshot_producer_invalid");
  assert(typeof snapshot.producer?.version === "string", "snapshot_producer_version_invalid");
  assert(snapshot.profile?.browser === "Google Chrome", "snapshot_browser_invalid");
  assert(snapshot.profile?.scope === "current_regular_profile", "snapshot_profile_scope_invalid");
  assert(Array.isArray(snapshot.profile?.storeIds)
    && snapshot.profile.storeIds.every((id) => typeof id === "string"), "snapshot_store_ids_invalid");
  assert(Array.isArray(snapshot.cookies), "snapshot_cookies_array_required");
  snapshot.cookies.forEach(validateCookie);
  const declaredStores = new Set(snapshot.profile.storeIds);
  assert(snapshot.cookies.every((cookie) => declaredStores.has(cookie.storeId)), "snapshot_cookie_store_not_declared");
  return snapshot;
}

export function snapshotSummary(snapshot) {
  const domains = new Set(snapshot.cookies.map((cookie) => cookie.domain.replace(/^\./u, "").toLowerCase()));
  return {
    schema: snapshot.schema,
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    storeCount: snapshot.profile.storeIds.length,
    cookieCount: snapshot.cookies.length,
    domainCount: domains.size,
    sessionCount: snapshot.cookies.filter((cookie) => cookie.session).length,
    partitionedCount: snapshot.cookies.filter((cookie) => cookie.partitionKey !== null).length,
    sensitiveValuesExposed: false
  };
}
