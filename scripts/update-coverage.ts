/**
 * Update data/coverage.json with current database statistics.
 *
 * Reads the SAMA SQLite database and writes a coverage summary file
 * used by the freshness checker, fleet manifest, and the sa_sama_about tool.
 *
 * Usage:
 *   npx tsx scripts/update-coverage.ts
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env["BIS_DB_PATH"] ?? "data/bis.db";
const COVERAGE_FILE = "data/coverage.json";

interface CoverageFile {
  generatedAt: string;
  mcp: string;
  version: string;
  scope_statement: string;
  scope_exclusions: string[];
  sources: CoverageSource[];
  totals: {
    frameworks: number;
    controls: number;
    circulars: number;
  };
  notes: {
    availability: string;
    full_text: string;
  };
}

interface CoverageSource {
  name: string;
  url: string;
  last_fetched: string | null;
  update_frequency: string;
  item_count: number;
  status: "current" | "stale" | "unknown";
  expected_items: number;
  measurement_unit: string;
  verification_method:
    | "api_reconciled"
    | "page_scraped"
    | "manifest_matched"
    | "manual_attestation";
  last_verified: string;
  completeness: "full" | "partial" | "snapshot";
  completeness_note: string;
}

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

  // Get last-inserted date if available
  const latestCircular = db
    .prepare("SELECT date FROM circulars ORDER BY date DESC LIMIT 1")
    .get() as { date: string } | undefined;

  const today = new Date().toISOString().slice(0, 10);
  const coverage: CoverageFile = {
    generatedAt: new Date().toISOString(),
    mcp: "india-bis-standards-mcp",
    version: "0.1.0",
    scope_statement:
      "Catalog metadata for Bureau of Indian Standards (BIS) IS standards " +
      "in IT, cybersecurity, and data privacy (LITD 17 subcommittee plus " +
      "ISO/IEC IT-security family adoptions), plus publicly available IT Act " +
      "rules and CERT-In/RBI/SEBI cybersecurity directives. Full standards " +
      "text is paid/licensed and is NOT included.",
    scope_exclusions: [
      "Full BIS IS standards text (paid/licensed — purchase from services.bis.gov.in)",
      "Restricted-distribution IS standards",
      "Withdrawn standards older than 10 years",
      "Hindi-only BIS publications",
      "Draft standards under public comment",
      "ICS codes for live-scraped rows (the public BIS search API does not expose them)",
      "BIS standards outside the LITD 17 IT-security scope (alarm systems, " +
        "power systems, climate change, medical informatics, agriculture, " +
        "construction, etc. — filtered out by the ingestion gate)",
    ],
    sources: [
      {
        name: "Bureau of Indian Standards — Standard Review Portal",
        url: "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/",
        last_fetched: new Date().toISOString(),
        update_frequency: "quarterly",
        item_count: controls,
        status: "current",
        expected_items: controls,
        measurement_unit: "IS standard catalog metadata rows",
        verification_method: "page_scraped",
        last_verified: today,
        completeness: "snapshot",
        completeness_note:
          "Scope-gated to the LITD 17 IT/cybersecurity subcommittee and " +
          "explicit ISO/IEC IT-security-family numbers. Full text not included " +
          "(paid). Curated seed of 19 known IS standards is merged with the " +
          "live scrape; live rows take precedence.",
      },
    ],
    totals: { frameworks, controls, circulars },
    notes: {
      availability:
        "Every controls row carries availability='paid'. The MCP returns " +
        "metadata only.",
      full_text:
        "Full BIS IS standards text requires a paid subscription at " +
        "https://www.services.bis.gov.in/. This server never fetches or " +
        "redistributes that text.",
    },
  };

  const dir = dirname(COVERAGE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(COVERAGE_FILE, JSON.stringify(coverage, null, 2), "utf8");

  console.log(`Coverage updated: ${COVERAGE_FILE}`);
  console.log(`  Frameworks : ${frameworks}`);
  console.log(`  Controls   : ${controls}`);
  console.log(`  Circulars  : ${circulars}`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
