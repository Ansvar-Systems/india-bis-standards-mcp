/**
 * BIS Standards Catalog Ingestion Fetcher
 *
 * Fetches the BIS standards portal (services.bis.gov.in) and extracts
 * IT/cybersecurity-related IS standard metadata entries.
 *
 * IMPORTANT: Only catalog metadata is publicly accessible from the BIS portal.
 * Full standards text is commercial/subscription content — this fetcher
 * does NOT attempt to download or extract full PDF content from BIS.
 * Do not add logic to fetch full standards text; that would violate BIS
 * commercial terms. Metadata only (IS number, title, TC, ICS, status).
 *
 * For full standards text, users must obtain a BIS subscription at
 * https://www.services.bis.gov.in/ or through authorized BIS resellers.
 *
 * Usage:
 *   npx tsx scripts/ingest-fetch.ts
 *   npx tsx scripts/ingest-fetch.ts --dry-run     # log what would be fetched
 *   npx tsx scripts/ingest-fetch.ts --force        # re-fetch existing entries
 *   npx tsx scripts/ingest-fetch.ts --limit 5      # fetch only first N entries
 */

import * as cheerio from "cheerio";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.services.bis.gov.in";
// Standard review/search portal — publicly accessible catalog metadata
const PORTAL_URL = `${BASE_URL}/php/BIS_2.0/bisconnect/standard_review/`;
const RAW_DIR = "data/raw";
const RATE_LIMIT_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 2000;
const REQUEST_TIMEOUT_MS = 60_000;
const USER_AGENT = "Ansvar-MCP/1.0 (regulatory-metadata-ingestion; https://ansvar.eu)";

// Keywords to identify IT/cybersecurity-relevant IS standards
const IT_KEYWORDS = [
  "information security",
  "cybersecurity",
  "data privacy",
  "data protection",
  "information technology",
  "it security",
  "it governance",
  "privacy",
  "incident management",
  "digital",
  "network security",
  "cloud security",
  "identity management",
  "access control",
  "encryption",
  "cryptography",
  "vulnerability",
  "risk management",
  "business continuity",
  "digital evidence",
  "storage security",
];

// TC codes relevant to IT standards
const IT_TC_CODES = ["LITD 17", "LITD 28", "LITD 01", "LITD 06"];

// CLI flags
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const fetchLimit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] ?? "999", 10) : 999;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StandardEntry {
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
// HTTP helpers
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${url}`);
        }
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const backoff = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
      console.error(
        `  Attempt ${attempt + 1}/${retries} failed for ${url}: ${lastError.message}. ` +
          `Retrying in ${backoff}ms...`,
      );
      if (attempt < retries - 1) await sleep(backoff);
    }
  }
  throw lastError ?? new Error(`All retries failed for ${url}`);
}

// ---------------------------------------------------------------------------
// BIS portal scraping — METADATA ONLY
// ---------------------------------------------------------------------------

function isItRelevant(title: string, tc: string): boolean {
  const lowerTitle = title.toLowerCase();
  const titleMatch = IT_KEYWORDS.some((kw) => lowerTitle.includes(kw));
  const tcMatch = IT_TC_CODES.some((code) => tc.includes(code));
  return titleMatch || tcMatch;
}

async function scrapeCatalog(): Promise<StandardEntry[]> {
  console.log(`Fetching BIS standards catalog: ${PORTAL_URL}`);
  console.log("NOTE: Fetching catalog METADATA only. Full text is not publicly accessible.");

  let html: string;
  try {
    const response = await fetchWithRetry(PORTAL_URL);
    html = await response.text();
  } catch (err) {
    console.warn(
      `  Warning: Could not fetch live BIS portal: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.warn("  BIS portal may require JavaScript or session authentication.");
    console.warn("  Falling back to known IS standards list.");
    return getKnownStandards();
  }

  const $ = cheerio.load(html);
  const entries: StandardEntry[] = [];

  // BIS portal uses a search form and result table — attempt to parse table rows
  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const isNumber = $(cells[0]).text().trim();
    const title = $(cells[1]).text().trim();
    const tc = $(cells[2]).text().trim();
    const ics = $(cells[3] ?? "").text().trim();
    const status = $(cells[4] ?? "").text().trim() || "Current";

    if (!isNumber || !title) return;
    // Real BIS IS standards start with "IS " or "IS/" prefix.
    // Reject noise rows (e.g., TC listing tables with integer-only first column).
    if (!/^IS[\s/]/i.test(isNumber)) return;
    if (!isItRelevant(title, tc)) return;

    // Detect ISO equivalent from title pattern (e.g., "IS/ISO/IEC 27001")
    let isoEquivalent: string | null = null;
    const isoMatch = isNumber.match(/IS\/ISO\/IEC\s+([\d-]+)/i) ??
                     title.match(/ISO\/IEC\s+([\d-]+)/i);
    if (isoMatch) {
      isoEquivalent = `ISO/IEC ${isoMatch[1]}`;
    }

    entries.push({
      is_number: isNumber,
      title,
      tc,
      ics_code: ics,
      status,
      iso_equivalent: isoEquivalent,
      bis_product_code: isNumber,
      catalog_url: PORTAL_URL,
      fetchedAt: new Date().toISOString(),
    });
  });

  if (entries.length === 0) {
    console.warn("  No IS standards found via HTML scraping.");
    console.warn("  BIS portal likely requires JavaScript rendering or session auth.");
    console.warn("  Falling back to known IS standards list.");
    return getKnownStandards();
  }

  return entries;
}

/**
 * Known IT/cybersecurity-relevant IS standards.
 * Used as fallback when live portal scraping is not possible.
 * These are verified BIS catalog entries as of April 2026.
 * Full text for all entries requires BIS subscription.
 */
function getKnownStandards(): StandardEntry[] {
  const now = new Date().toISOString();
  return [
    { is_number: "IS 16700", title: "Data Privacy", tc: "LITD 17", ics_code: "35.040", status: "Current", iso_equivalent: null, bis_product_code: "IS 16700", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27001", title: "Information Technology — Security Techniques — Information Security Management Systems — Requirements", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27001:2022", bis_product_code: "IS/ISO/IEC 27001", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27002", title: "Information Technology — Information Security Controls", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27002:2022", bis_product_code: "IS/ISO/IEC 27002", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27005", title: "Information Technology — Guidance on Managing Information Security Risks", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27005:2022", bis_product_code: "IS/ISO/IEC 27005", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27017", title: "Information Technology — Code of Practice for Information Security Controls for Cloud Services", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27017:2015", bis_product_code: "IS/ISO/IEC 27017", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27018", title: "Information Technology — Code of Practice for Protection of Personally Identifiable Information in Public Clouds", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27018:2019", bis_product_code: "IS/ISO/IEC 27018", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27032", title: "Cybersecurity — Guidelines for Internet Security", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27032:2023", bis_product_code: "IS/ISO/IEC 27032", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27035-1", title: "Information Technology — Information Security Incident Management — Part 1: Principles and Process", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27035-1:2023", bis_product_code: "IS/ISO/IEC 27035-1", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27037", title: "Information Technology — Guidelines for Identification, Collection, Acquisition and Preservation of Digital Evidence", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27037:2012", bis_product_code: "IS/ISO/IEC 27037", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27040", title: "Information Technology — Storage Security", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27040:2015", bis_product_code: "IS/ISO/IEC 27040", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27043", title: "Information Technology — Incident Investigation Principles and Processes", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27043:2015", bis_product_code: "IS/ISO/IEC 27043", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 27701", title: "Security Techniques — Extension to ISO/IEC 27001 and ISO/IEC 27002 for Privacy Information Management", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 27701:2019", bis_product_code: "IS/ISO/IEC 27701", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 29100", title: "Information Technology — Privacy Framework", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 29100:2011", bis_product_code: "IS/ISO/IEC 29100", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 29101", title: "Information Technology — Privacy Architecture Framework", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 29101:2018", bis_product_code: "IS/ISO/IEC 29101", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 29134", title: "Information Technology — Guidelines for Privacy Impact Assessment", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 29134:2017", bis_product_code: "IS/ISO/IEC 29134", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 29151", title: "Information Technology — Code of Practice for Personally Identifiable Information Protection", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 29151:2017", bis_product_code: "IS/ISO/IEC 29151", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 15408-1", title: "Evaluation Criteria for IT Security — Part 1: Introduction and General Model (Common Criteria)", tc: "LITD 17", ics_code: "35.030", status: "Current", iso_equivalent: "ISO/IEC 15408-1:2022", bis_product_code: "IS/ISO/IEC 15408-1", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 20000-1", title: "Information Technology — Service Management — Part 1: Service Management System Requirements", tc: "LITD 17", ics_code: "35.020", status: "Current", iso_equivalent: "ISO/IEC 20000-1:2018", bis_product_code: "IS/ISO/IEC 20000-1", catalog_url: PORTAL_URL, fetchedAt: now },
    { is_number: "IS/ISO/IEC 38500", title: "Corporate Governance of Information Technology", tc: "LITD 17", ics_code: "35.020", status: "Current", iso_equivalent: "ISO/IEC 38500:2015", bis_product_code: "IS/ISO/IEC 38500", catalog_url: PORTAL_URL, fetchedAt: now },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(RAW_DIR)) {
    mkdirSync(RAW_DIR, { recursive: true });
    console.log(`Created directory: ${RAW_DIR}`);
  }

  let entries = await scrapeCatalog();
  console.log(`Found ${entries.length} IT/cybersecurity-relevant IS standards`);

  if (entries.length > fetchLimit) {
    entries = entries.slice(0, fetchLimit);
    console.log(`Limiting to ${fetchLimit} entries`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const entry of entries) {
      console.log(`  ${entry.is_number} — ${entry.title.slice(0, 60)}...`);
    }
    console.log("\nNOTE: Full text would NOT be fetched — BIS standards text is paid content.");
    return;
  }

  // Write catalog metadata to raw dir (no PDF downloads)
  const metaPath = join(RAW_DIR, "bis-catalog-metadata.json");
  if (!force && existsSync(metaPath)) {
    console.log(`Skipping write (exists, use --force to overwrite): ${metaPath}`);
  } else {
    writeFileSync(metaPath, JSON.stringify(entries, null, 2), "utf8");
    console.log(`Wrote ${entries.length} standard metadata entries to ${metaPath}`);
  }

  const summary = {
    fetchedAt: new Date().toISOString(),
    total: entries.length,
    note: "Catalog metadata only. Full standards text requires BIS subscription.",
    portal: PORTAL_URL,
    standards: entries.map((e) => ({
      is_number: e.is_number,
      title: e.title.slice(0, 80),
      tc: e.tc,
      iso_equivalent: e.iso_equivalent,
    })),
  };

  writeFileSync(join(RAW_DIR, "fetch-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`Summary written to ${join(RAW_DIR, "fetch-summary.json")}`);
  console.log("\nNOTE: Full standards text was NOT fetched — BIS standards are paid/licensed content.");
  console.log(`To access full text, visit: ${PORTAL_URL}`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
