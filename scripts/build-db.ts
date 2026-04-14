/**
 * Build the India BIS SQLite database from fetched catalog metadata.
 *
 * Reads data/raw/bis-catalog-metadata.json (produced by ingest-fetch.ts)
 * and inserts standards metadata into the controls table. Full standards
 * text is NOT ingested — it requires a paid BIS subscription. Every row
 * is flagged availability='paid' and description references the upstream
 * subscription portal.
 *
 * Usage:
 *   npx tsx scripts/build-db.ts
 *   npx tsx scripts/build-db.ts --force    # drop and rebuild database
 *   npx tsx scripts/build-db.ts --dry-run  # log what would be inserted
 */

import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { SCHEMA_SQL } from "../src/db.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DB_PATH = process.env["BIS_DB_PATH"] ?? "data/bis.db";
const RAW_DIR = "data/raw";
const METADATA_FILE = join(RAW_DIR, "bis-catalog-metadata.json");

const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StandardMetadata {
  is_number: string;
  title: string;
  tc: string;
  ics_code: string;
  status: string;
  iso_equivalent: string | null;
  bis_product_code: string | null;
  catalog_url: string;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Classification — group IS standards into logical BIS frameworks
// ---------------------------------------------------------------------------

interface FrameworkGroup {
  id: string;
  name: string;
  domain: string;
  description: string;
}

const FRAMEWORKS: FrameworkGroup[] = [
  {
    id: "bis-data-privacy",
    name: "BIS Data Privacy Standards",
    domain: "Data Privacy Standards",
    description:
      "Indian adoptions of ISO/IEC privacy frameworks (IS 16700, IS/ISO/IEC 27701, 29100, 29101, 29134, 29151). Full text requires BIS subscription.",
  },
  {
    id: "bis-infosec",
    name: "BIS Information Security Standards",
    domain: "Information Security Standards",
    description:
      "Indian adoptions of ISO/IEC 27xxx information security standards (IS/ISO/IEC 27001, 27002, 27005, 27017, 27018, 27032, 27035, 27037, 27040, 27043). Full text requires BIS subscription.",
  },
  {
    id: "bis-it-governance",
    name: "BIS IT Governance Standards",
    domain: "IT Governance Standards",
    description:
      "IT service management, governance, and evaluation criteria (IS/ISO/IEC 15408, 20000, 38500). Full text requires BIS subscription.",
  },
];

function classifyFramework(std: StandardMetadata): string {
  const n = std.is_number;
  const t = std.title.toLowerCase();
  // Privacy standards (27701, 29100, 29101, 29134, 29151, IS 16700)
  if (
    n.includes("27701") ||
    n.includes("29100") ||
    n.includes("29101") ||
    n.includes("29134") ||
    n.includes("29151") ||
    n.includes("16700") ||
    t.includes("privacy")
  ) {
    return "bis-data-privacy";
  }
  // IT governance / service management / evaluation criteria
  if (
    n.includes("15408") ||
    n.includes("20000") ||
    n.includes("38500") ||
    t.includes("governance") ||
    t.includes("service management")
  ) {
    return "bis-it-governance";
  }
  // Default bucket: information security (27001, 27002, 27005, 27017, 27018, 27032, 27035, 27037, 27040, 27043, etc.)
  return "bis-infosec";
}

function toControlRef(isNumber: string): string {
  // IS/ISO/IEC 27001 -> IS-ISO-IEC-27001
  return isNumber.trim().replace(/[\s/]+/g, "-").replace(/[^A-Z0-9-]/gi, "").toUpperCase();
}

function buildDescription(std: StandardMetadata): string {
  const parts: string[] = [];
  parts.push(`${std.is_number} — ${std.title}.`);
  if (std.iso_equivalent) {
    parts.push(`Indian adoption of ${std.iso_equivalent}.`);
  }
  if (std.tc) {
    parts.push(`Technical Committee: ${std.tc}.`);
  }
  if (std.ics_code) {
    parts.push(`ICS code: ${std.ics_code}.`);
  }
  parts.push(`Status: ${std.status}.`);
  parts.push(
    "Full text requires BIS subscription. Purchase from " +
      "https://www.services.bis.gov.in/ or authorised BIS resellers.",
  );
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(METADATA_FILE)) {
    console.error(`Catalog metadata not found: ${METADATA_FILE}`);
    console.error("Run: npm run ingest:fetch");
    process.exit(1);
  }

  const standards: StandardMetadata[] = JSON.parse(
    readFileSync(METADATA_FILE, "utf8"),
  );
  console.log(`Loaded ${standards.length} standard metadata entries from ${METADATA_FILE}`);

  if (dryRun) {
    for (const std of standards) {
      const fw = classifyFramework(std);
      console.log(`  [${fw}] ${std.is_number} — ${std.title.slice(0, 70)}`);
    }
    return;
  }

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (force && existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
    console.log(`Deleted ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  // Wipe existing rows (force clean rebuild of catalog-derived data)
  if (!force) {
    db.exec("DELETE FROM controls; DELETE FROM frameworks;");
  }

  // Insert frameworks
  const insertFramework = db.prepare(
    "INSERT OR REPLACE INTO frameworks (id, name, version, domain, description, control_count, effective_date, pdf_url) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const fw of FRAMEWORKS) {
    insertFramework.run(
      fw.id,
      fw.name,
      null,
      fw.domain,
      fw.description,
      0,
      null,
      "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/",
    );
  }

  // Insert standards as controls, availability='paid' on every row
  const insertControl = db.prepare(
    "INSERT OR REPLACE INTO controls " +
      "(framework_id, control_ref, domain, subdomain, title, description, maturity_level, priority, availability) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );

  let controlsInserted = 0;
  for (const std of standards) {
    const frameworkId = classifyFramework(std);
    const fw = FRAMEWORKS.find((f) => f.id === frameworkId)!;
    const controlRef = toControlRef(std.is_number);
    const result = insertControl.run(
      frameworkId,
      controlRef,
      fw.domain,
      std.tc || "General",
      `${std.is_number} — ${std.title}`,
      buildDescription(std),
      null,
      "Mandatory",
      "paid",
    );
    if (result.changes > 0) controlsInserted++;
  }

  // Update framework control_count
  const updateCount = db.prepare(
    "UPDATE frameworks SET control_count = (SELECT COUNT(*) FROM controls WHERE framework_id = frameworks.id)",
  );
  updateCount.run();

  db.pragma("journal_mode = WAL");
  db.pragma("vacuum");

  console.log(`
Build complete:
  Frameworks  : ${FRAMEWORKS.length} inserted
  Controls    : ${controlsInserted} inserted (all availability='paid')

Database: ${DB_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
