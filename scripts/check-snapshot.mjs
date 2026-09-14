import { readFile } from "node:fs/promises";
import { parseSnapshot, snapshotSummary } from "../lib/snapshot-reader.mjs";

const [snapshotPath] = process.argv.slice(2);
if (!snapshotPath) {
  process.stderr.write("usage: npm run check-snapshot -- <absolute-snapshot-path>\n");
  process.exit(2);
}

try {
  const snapshot = parseSnapshot(await readFile(snapshotPath, "utf8"));
  process.stdout.write(`${JSON.stringify(snapshotSummary(snapshot), null, 2)}\n`);
} catch {
  process.stderr.write("snapshot validation failed; no credential fields were printed\n");
  process.exit(1);
}
