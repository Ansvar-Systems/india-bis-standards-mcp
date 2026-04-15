/**
 * Update data/coverage.json with current database statistics.
 *
 * Preserves hand-maintained schema fields (schema_version, mcp_type,
 * scope_statement, scope_exclusions, per-source metadata for sources 2..N,
 * notes, completeness, etc.) and only refreshes the dynamic counts +
 * timestamps for the primary BIS standards source. Runs safely on CI
 * without clobbering docs.
 *
 * Usage:
 *   npx tsx scripts/update-coverage.ts
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env["BIS_DB_PATH"] ?? "data/bis.db";
const COVERAGE_FILE = "data/coverage.json";

async function main(): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    console.error("Run: npm run seed  or  npm run build:db");
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  const frameworks = (db.prepare("SELECT COUNT(*) AS n FROM frameworks").get() as { n: number }).n;
  const controls = (db.prepare("SELECT COUNT(*) AS n FROM controls").get() as { n: number }).n;
  const circulars = (db.prepare("SELECT COUNT(*) AS n FROM circulars").get() as { n: number }).n;

  const existing: Record<string, unknown> = existsSync(COVERAGE_FILE)
    ? JSON.parse(readFileSync(COVERAGE_FILE, "utf8"))
    : {};

  // Only the first source (BIS Standards Portal) tracks the dynamic controls count.
  // Other sources (IT Act, CERT-In directions, DPDPA) are single-document linkouts
  // with hand-maintained item_count: 1.
  const sources =
    Array.isArray(existing["sources"]) && existing["sources"].length > 0
      ? (existing["sources"] as Record<string, unknown>[]).map((s, i) =>
          i === 0
            ? {
                ...s,
                item_count: controls,
                expected_items:
                  typeof s["expected_items"] === "number"
                    ? s["expected_items"]
                    : controls,
              }
            : s,
        )
      : [];

  // total_items is sum of all sources' item_count (preserves the hand-authored 1s)
  const totalItems = sources.reduce((acc, s) => {
    const n = (s as Record<string, unknown>)["item_count"];
    return acc + (typeof n === "number" ? n : 0);
  }, 0);

  const existingSummary =
    (existing["summary"] as Record<string, unknown> | undefined) ?? {};
  const summary = {
    ...existingSummary,
    total_items: totalItems,
    total_sources: sources.length,
  };

  const coverage = {
    ...existing,
    sources,
    totals: { frameworks, controls, circulars },
    summary,
    generatedAt: new Date().toISOString(),
  };

  const dir = dirname(COVERAGE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(COVERAGE_FILE, JSON.stringify(coverage, null, 2) + "\n", "utf8");

  console.log(`Coverage updated: ${COVERAGE_FILE}`);
  console.log(`  Frameworks : ${frameworks}`);
  console.log(`  Controls   : ${controls}`);
  console.log(`  Circulars  : ${circulars}`);
  console.log(
    `  Schema fields preserved: schema_version, mcp_type, scope_exclusions, additional sources, notes`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
