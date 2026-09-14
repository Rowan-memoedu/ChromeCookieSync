import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EXPORT_SCHEMA,
  EXPORT_SCHEMA_VERSION,
  buildSnapshot,
  normalizeCookie,
  readCurrentProfile,
  safeReceipt,
  snapshotFilename
} from "../extension/sync-core.js";
import { parseSnapshot, snapshotSummary } from "../lib/snapshot-reader.mjs";

const syntheticCookies = [
  {
    name: "synthetic_session",
    value: "not-a-real-secret",
    domain: ".example.test",
    hostOnly: false,
    path: "/account",
    secure: true,
    httpOnly: true,
    sameSite: "strict",
    session: true,
    storeId: "0"
  },
  {
    name: "synthetic_partitioned",
    value: "not-a-real-token",
    domain: "cdn.example.test",
    hostOnly: true,
    path: "/",
    secure: true,
    httpOnly: false,
    sameSite: "no_restriction",
    session: false,
    expirationDate: 2_000_000_000,
    storeId: "0",
    partitionKey: {
      topLevelSite: "https://top.example",
      hasCrossSiteAncestor: true
    }
  }
];

test("synthetic full-profile read uses the all-partition-keys query", async () => {
  let query;
  const profile = await readCurrentProfile({
    async getAll(details) {
      query = details;
      return syntheticCookies;
    },
    async getAllCookieStores() {
      return [{ id: "0", tabIds: [123] }];
    }
  });
  assert.deepEqual(query, { partitionKey: {} });
  assert.equal(profile.cookies.length, 2);
  assert.deepEqual(profile.storeIds, ["0"]);
});

test("matching attributes and versioned metadata survive JSON round trip", () => {
  const normalized = syntheticCookies.map(normalizeCookie);
  const snapshot = buildSnapshot(normalized, {
    generatedAt: "2026-08-23T00:00:00.000Z",
    snapshotId: "12345678-1234-4123-8123-123456789abc",
    storeIds: ["0"]
  });
  const parsed = parseSnapshot(JSON.stringify(snapshot));
  assert.equal(parsed.schema, EXPORT_SCHEMA);
  assert.equal(parsed.schemaVersion, EXPORT_SCHEMA_VERSION);
  assert.deepEqual(parsed.profile, {
    browser: "Google Chrome",
    scope: "current_regular_profile",
    storeIds: ["0"]
  });
  assert.deepEqual(parsed.cookies, normalized);
  assert.deepEqual(parsed.cookies[0], {
    name: "synthetic_session",
    value: "not-a-real-secret",
    domain: ".example.test",
    hostOnly: false,
    path: "/account",
    secure: true,
    httpOnly: true,
    sameSite: "strict",
    session: true,
    expirationDate: null,
    storeId: "0",
    partitionKey: null
  });
  assert.deepEqual(parsed.cookies[1].partitionKey, {
    topLevelSite: "https://top.example",
    hasCrossSiteAncestor: true
  });
  assert.deepEqual(safeReceipt(parsed), {
    cookieCount: 2,
    domainCount: 2,
    sessionCount: 1,
    partitionedCount: 1
  });
  assert.equal(
    snapshotFilename(parsed),
    "chrome-cookie-snapshot-v1-2026-08-23T00-00-00-000Z-12345678-1234-4123-8123-123456789abc.json"
  );
  assert.deepEqual(snapshotSummary(parsed), {
    schema: EXPORT_SCHEMA,
    schemaVersion: 1,
    generatedAt: "2026-08-23T00:00:00.000Z",
    storeCount: 1,
    cookieCount: 2,
    domainCount: 2,
    sessionCount: 1,
    partitionedCount: 1,
    sensitiveValuesExposed: false
  });
});

test("consumer rejects a version mismatch without reading credential fields", () => {
  const normalized = syntheticCookies.map(normalizeCookie);
  const snapshot = buildSnapshot(normalized, {
    generatedAt: "2026-08-23T00:00:00.000Z",
    snapshotId: "87654321-1234-4123-8123-123456789abc",
    storeIds: ["0"]
  });
  snapshot.schemaVersion = 2;
  assert.throws(() => parseSnapshot(JSON.stringify(snapshot)), /snapshot_schema_version_unsupported/u);
});

test("manual exporter remains independent and extension never writes browser Cookies", async () => {
  const root = new URL("../extension/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const popupHtml = await readFile(new URL("popup.html", root), "utf8");
  const popup = await readFile(new URL("popup.js", root), "utf8");
  const allSource = [
    popup,
    await readFile(new URL("sync-core.js", root), "utf8")
  ].join("\n");

  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.incognito, "not_allowed");
  assert.deepEqual(manifest.permissions, ["cookies", "storage", "alarms"]);
  assert.deepEqual(manifest.host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendNativeMessage/u.test(allSource), false);
  assert.equal(/chrome\.cookies\.(?:set|remove)\s*\(/u.test(allSource), false);
  assert.equal(/addEventListener\s*\(\s*["']click["']/u.test(popup), true);
  assert.equal(/console\./u.test(allSource), false);
  assert.equal(popupHtml.includes("本地敏感凭据文件"), true);
});
