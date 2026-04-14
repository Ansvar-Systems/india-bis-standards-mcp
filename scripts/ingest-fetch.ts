/**
 * BIS Standards Catalog Ingestion Fetcher — Playwright-driven
 *
 * Scrapes the JavaScript-rendered BIS standards portal at
 * standards.bis.gov.in. A headless Chromium session is launched so the
 * Angular app can issue its own API request to the public search endpoint
 * (review-service/searchStandardsByNumberOrTitle); we then re-issue that
 * same request from within the page context for each configured search
 * term and merge the returned metadata.
 *
 * IMPORTANT — METADATA ONLY: BIS standards full text is paid/licensed
 * content. This fetcher only captures catalog metadata (IS number, title,
 * technical committee, department, publish date, validity). Every row is
 * flagged availability='paid' downstream in build-db.ts. DO NOT add any
 * code that downloads or parses the PDF bodies of BIS standards — that
 * would violate BIS commercial terms. For full standards text, users
 * must obtain a BIS subscription at https://www.services.bis.gov.in/.
 *
 * Usage:
 *   npx tsx scripts/ingest-fetch.ts
 *   npx tsx scripts/ingest-fetch.ts --dry-run     # log what would be fetched
 *   npx tsx scripts/ingest-fetch.ts --force        # re-fetch existing entries
 *   npx tsx scripts/ingest-fetch.ts --limit 5      # limit total merged entries
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORTAL_URL = "https://standards.bis.gov.in/website/published-standards/department-wise";
const SEARCH_API = "https://standardsadmin.bis.gov.in/review-service//searchStandardsByNumberOrTitle";
const LEGACY_PORTAL_URL = "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/";
const RAW_DIR = "data/raw";
const RATE_LIMIT_MS = 5000;
// Real Chrome UA (matches headless Chromium 146 on Linux)
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

// Search terms chosen to cover IT/cybersecurity-relevant LITD committee
// output. Each term is issued as its own API call; results are deduped
// by standardNumber before merge.
const SEARCH_TERMS = [
  "information security",
  "cybersecurity",
  "cyber security",
  "information technology",
  "cryptography",
  "privacy",
  "data protection",
  "risk management",
  "cloud security",
  "network security",
  "biometric",
  "digital evidence",
  "incident management",
  "identity management",
  "encryption",
  "access control",
  "IoT security",
  "secure software",
  "vulnerability",
  "penetration testing",
  "ISO/IEC 27001",
  "ISO/IEC 27002",
  "ISO/IEC 27701",
  "ISO/IEC 15408",
  "ISO/IEC 29100",
];

// CLI flags
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const fetchLimit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] ?? "999", 10) : 999;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BisApiStandard {
  standardId: number;
  standardNumber: string;
  standardName: string;
  standardNameInHindi?: string | null;
  departmentId?: number | null;
  committeeId?: number | null;
  publishedOn?: string | null;
  validUpto?: string | null;
  isStatus?: number | null;
}

interface BisApiResponse {
  status: string;
  statusCode: number;
  msg: string;
  data: BisApiStandard[];
  totalRecords: number;
}

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
  /** Extra fields captured from the live portal (not yet in DB schema) */
  published_on: string | null;
  valid_upto: string | null;
  department_id: number | null;
  committee_id: number | null;
  matched_term: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isStatusLabel(isStatus: number | null | undefined): string {
  // BIS portal uses integer status codes; common values observed:
  //   1 = active/current, 2 = revised/current-revision, 3 = withdrawn
  // Upstream is not public about codes — we render best-effort labels.
  switch (isStatus) {
    case 1:
      return "Current";
    case 2:
      return "Current (Revised)";
    case 3:
      return "Withdrawn";
    default:
      return "Current";
  }
}

function deriveIsoEquivalent(isNumber: string, title: string): string | null {
  // IS/ISO/IEC 27001 : 2022 -> ISO/IEC 27001:2022
  // IS/ISO 27799 : 2016 -> ISO 27799:2016
  const m1 = isNumber.match(/IS\/ISO\/IEC\s+(\d+(?:\s*\(Part\s*\d+\))?|\d+\s*:\s*Part\s*\d+|\d+(?:-\d+)?)\s*(?:\(Part\s*\d+\))?\s*(?::\s*(\d{4}))?/i);
  if (m1 && m1[1]) {
    const num = m1[1].replace(/\s+/g, "").replace(/:Part/gi, "-Part");
    const year = m1[2] ?? "";
    return year ? `ISO/IEC ${num}:${year}` : `ISO/IEC ${num}`;
  }
  const m2 = isNumber.match(/IS\/ISO\s+(\d+)\s*:\s*(\d{4})/i);
  if (m2) return `ISO ${m2[1]}:${m2[2]}`;
  const m3 = title.match(/ISO\/IEC\s+([\d-]+)(?::(\d{4}))?/i);
  if (m3) return m3[2] ? `ISO/IEC ${m3[1]}:${m3[2]}` : `ISO/IEC ${m3[1]}`;
  return null;
}

function deriveTc(departmentId: number | null | undefined, committeeId: number | null | undefined): string {
  // Department 66 on the new portal maps to LITD (Electronics & Information
  // Technology). Known LITD subcommittees relevant to IT security:
  //   committeeId 234 -> LITD 17 (Information Systems Security)
  //   committeeId 23  -> MHD 17 (Medical Health IT) — also surfaces in search
  // For anything else we emit the department ID as a free-form hint.
  if (departmentId === 66 && committeeId === 234) return "LITD 17";
  if (departmentId === 66) return "LITD";
  if (departmentId === 64 && committeeId === 23) return "MHD 17";
  if (departmentId !== null && departmentId !== undefined) return `DEPT ${departmentId}`;
  return "General";
}

function normaliseTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function looksLikeItStandard(title: string, isNumber: string): boolean {
  // Keep rows that are explicitly about IT security, cybersecurity,
  // privacy, cryptography, IT governance, or service management.
  // Reject medical/health informatics overlap and generic programming /
  // datacomms rows that happen to match the broad "information technology"
  // search term.
  const t = title.toLowerCase();
  const banned = [
    "health informatics",
    "medical devices",
    "medical information systems",
    "medical laboratories",
    "dental",
    "breathing gas",
    "biocompatibility",
    "healthcare appliances",
    "fortran",
    "programming language",
    "programming languages",
    "data communication",
    "data communications",
    "dte/dce",
    "character set",
    "keyboard layout",
    "dtd",
    "office equipment",
    "bar code",
    "barcode",
    "font",
    "fonts",
    "typography",
    "sgml",
    "xml schema",
    "html",
    "open document",
    "opendocument",
    "pdf format",
    "uml",
    "topic maps",
    "smartcard transport",
    "video compression",
    "audio coding",
    "mpeg",
    "jpeg",
    "image coding",
    "test patterns",
    "construction project",
    "lifts escalators",
    "safety of machinery",
    "space systems",
    "integrated ccs",
    "housing and building",
    "survey of housing",
    "smart biometric baton",
    "unmanned aircraft",
    "rail",
    "nuclear",
    "combustible",
    "cement",
    "welding",
    "food",
    "agricultural",
    "agronom",
    "textile",
    "plumbing",
    "concrete",
    "traffic",
    "alarm and electronic security systems",
    "alarm systems",
    "power systems management",
    "wearable electronic",
    "blockchain",
    "distributed ledger",
    "conformance testing methodology for biometric",
    "biometric application programming",
    "video surveillance",
    "use of biometrics in video",
    "smart body area",
    "climate change",
    "adaptation to climate",
    "systems and software engineering",
    "ergonomic",
    "vocabulary",
    "biomechanical",
  ];
  if (banned.some((b) => t.includes(b))) return false;

  // Strong, domain-specific keywords — any of these admits the row.
  const keywords = [
    "information security",
    "cybersecurity",
    "cyber security",
    "privacy",
    "data protection",
    "cryptograph",
    "encryption",
    "hash function",
    "message authentication",
    "digital signature",
    "authentication",
    "access control",
    "identity management",
    "it security",
    "security technique",
    "security evaluation",
    "security controls",
    "security assessment",
    "security audit",
    "security assurance",
    "security requirements",
    "information security risk",
    "it risk management",
    "cyber risk",
    "incident management",
    "incident response",
    "governance of information technology",
    "corporate governance of it",
    "service management",
    "digital evidence",
    "storage security",
    "digital forensic",
    "biometric",
    "key management",
    "lightweight cryptography",
    "cloud security",
    "cloud services security",
    "iot security",
    "internet security",
    "network security",
    "wireless security",
    "firewall",
    "intrusion detection",
    "intrusion prevention",
    "vulnerability",
    "penetration test",
    "malware",
    "pki",
    "public key infrastructure",
    "certificate profile",
    "common criteria",
    "evaluation criteria for it security",
    "isms",
    "information security management",
    "supplier relationship",
    "information security for supplier",
    "time-stamping",
    "timestamp",
    "privacy impact",
    "privacy framework",
    "privacy architecture",
    "privacy information",
    "iso/iec 27",
    "iso/iec 29",
    "iso/iec 15408",
    "iso/iec 11770",
    "iso/iec 18033",
    "iso/iec 19790",
    "iso/iec 19792",
    "iso/iec 19896",
    "iso/iec 20540",
    "iso/iec 24759",
    "iso/iec 24745",
  ];
  if (keywords.some((k) => t.includes(k))) return true;

  // Series-code fallbacks limited to IT security numbering ranges.
  if (/^IS\/ISO\/IEC\s+270\d{2}/i.test(isNumber)) return true;      // 27xxx ISMS family
  if (/^IS\/ISO\/IEC\s+271\d{2}/i.test(isNumber)) return true;      // 271xx
  if (/^IS\/ISO\/IEC\s+29(1\d{2}|100|101|134|151|192)/i.test(isNumber)) return true;
  if (/^IS\/ISO\/IEC\s+15408/i.test(isNumber)) return true;          // Common Criteria
  if (/^IS\/ISO\/IEC\s+15446/i.test(isNumber)) return true;
  if (/^IS\/ISO\/IEC\s+11770/i.test(isNumber)) return true;          // Key management
  if (/^IS\/ISO\/IEC\s+18033/i.test(isNumber)) return true;          // Encryption algorithms
  if (/^IS\/ISO\/IEC\s+18014/i.test(isNumber)) return true;          // Time-stamping
  if (/^IS\/ISO\/IEC\s+1979[02]/i.test(isNumber)) return true;       // 19790, 19792
  if (/^IS\/ISO\/IEC\s+19896/i.test(isNumber)) return true;          // Tester competence
  if (/^IS\/ISO\/IEC\s+20540/i.test(isNumber)) return true;
  if (/^IS\/ISO\/IEC\s+24759/i.test(isNumber)) return true;
  if (/^IS\/ISO\/IEC\s+24745/i.test(isNumber)) return true;          // Biometric info protection
  if (/^IS\/ISO\/IEC\s+24760/i.test(isNumber)) return true;          // Identity management framework
  if (/^IS\/ISO\/IEC\s+38500/i.test(isNumber)) return true;          // IT governance
  if (/^IS\/ISO\/IEC\s+20000/i.test(isNumber)) return true;          // Service management
  if (/^IS\s+16700/i.test(isNumber)) return true;                    // IS 16700 Data Privacy
  return false;
}

// ---------------------------------------------------------------------------
// Playwright-driven search
// ---------------------------------------------------------------------------

async function fetchSearchTerm(page: Page, term: string): Promise<BisApiResponse> {
  // The API accepts an unauthenticated POST; running it from the page
  // context inherits the same-origin referer that the portal uses.
  const result = await page.evaluate(
    async ({ url, body }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return (await res.json()) as unknown;
    },
    {
      url: SEARCH_API,
      body: {
        searchText: term,
        token: null,
        refreshToken: null,
        clientId: null,
        clientSecret: null,
        sub: null,
      },
    },
  );
  return result as BisApiResponse;
}

async function scrapeCatalog(): Promise<StandardEntry[]> {
  console.log(`Launching Playwright (chromium) against ${PORTAL_URL}`);
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Let the Angular app finish bootstrapping so subsequent fetch() calls
    // pick up the same referer/CORS context as a real user session.
    await page.waitForTimeout(5_000);

    const byNumber = new Map<string, StandardEntry>();
    const now = new Date().toISOString();

    for (let i = 0; i < SEARCH_TERMS.length; i++) {
      const term = SEARCH_TERMS[i]!;
      if (i > 0) {
        // 5s polite rate limit between search requests
        await sleep(RATE_LIMIT_MS);
      }
      console.log(`[${i + 1}/${SEARCH_TERMS.length}] Searching "${term}"...`);
      let resp: BisApiResponse;
      try {
        resp = await fetchSearchTerm(page, term);
      } catch (err) {
        console.warn(
          `  warn: "${term}" failed (${err instanceof Error ? err.message : String(err)}). skipping.`,
        );
        continue;
      }
      if (resp.status !== "SUCCESS" || !Array.isArray(resp.data)) {
        console.warn(`  warn: "${term}" returned non-success: ${resp.status} / ${resp.msg}`);
        continue;
      }
      console.log(`  got ${resp.data.length} rows (totalRecords=${resp.totalRecords})`);

      for (const raw of resp.data) {
        const isNumber = normaliseTitle(raw.standardNumber);
        if (!isNumber) continue;
        if (!/^IS[\s/]/i.test(isNumber)) continue;
        const title = normaliseTitle(raw.standardName);
        if (!title) continue;
        if (!looksLikeItStandard(title, isNumber)) continue;

        // Dedupe — first match wins, but remember the matched term
        if (byNumber.has(isNumber)) continue;

        // Scope gate: keep rows from the LITD 17 Information Systems
        // Security subcommittee (departmentId 66 + committeeId 234) OR
        // explicit ISO/IEC IT-security-family numbers. This cuts out
        // alarm-systems, power-systems, climate change, and
        // biometric-hardware rows that happen to match keywords but
        // aren't LITD 17.
        const isLitd17 = raw.departmentId === 66 && raw.committeeId === 234;
        const isItSecuritySeries =
          /^IS\/ISO\/IEC\s+(270\d{2}|271\d{2}|29(1\d{2}|100|101|134|151|192)|15408|15446|11770|18033|18014|1979[02]|19896|20540|24759|24745|24760|38500|20000)/i.test(
            isNumber,
          ) || /^IS\s+16700\b/i.test(isNumber) || /^IS\s+17428/i.test(isNumber);
        if (!isLitd17 && !isItSecuritySeries) continue;

        const tc = deriveTc(raw.departmentId ?? null, raw.committeeId ?? null);
        const isoEquivalent = deriveIsoEquivalent(isNumber, title);
        const status = isStatusLabel(raw.isStatus ?? null);

        byNumber.set(isNumber, {
          is_number: isNumber,
          title,
          tc,
          // Live portal does not expose the ICS code on the search payload;
          // leave blank rather than fabricate.
          ics_code: "",
          status,
          iso_equivalent: isoEquivalent,
          bis_product_code: isNumber,
          catalog_url: PORTAL_URL,
          fetchedAt: now,
          published_on: raw.publishedOn ?? null,
          valid_upto: raw.validUpto ?? null,
          department_id: raw.departmentId ?? null,
          committee_id: raw.committeeId ?? null,
          matched_term: term,
        });
      }
    }

    await context.close();
    return Array.from(byNumber.values());
  } finally {
    if (browser) await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Curated seed rows — retained as a floor even if the live scrape fails.
// These 19 rows correspond to the original content-addressed catalog. They
// are merged with the live-scraped set; live rows with the same IS number
// take precedence.
// ---------------------------------------------------------------------------

function getCuratedSeed(): StandardEntry[] {
  const now = new Date().toISOString();
  const base = {
    ics_code: "35.030",
    status: "Current",
    catalog_url: LEGACY_PORTAL_URL,
    fetchedAt: now,
    published_on: null as string | null,
    valid_upto: null as string | null,
    department_id: 66 as number | null,
    committee_id: 234 as number | null,
    matched_term: "curated",
  };
  return [
    { is_number: "IS 16700", title: "Data Privacy", tc: "LITD 17", iso_equivalent: null, bis_product_code: "IS 16700", ...base, ics_code: "35.040" },
    { is_number: "IS/ISO/IEC 27001", title: "Information Technology — Security Techniques — Information Security Management Systems — Requirements", tc: "LITD 17", iso_equivalent: "ISO/IEC 27001:2022", bis_product_code: "IS/ISO/IEC 27001", ...base },
    { is_number: "IS/ISO/IEC 27002", title: "Information Technology — Information Security Controls", tc: "LITD 17", iso_equivalent: "ISO/IEC 27002:2022", bis_product_code: "IS/ISO/IEC 27002", ...base },
    { is_number: "IS/ISO/IEC 27005", title: "Information Technology — Guidance on Managing Information Security Risks", tc: "LITD 17", iso_equivalent: "ISO/IEC 27005:2022", bis_product_code: "IS/ISO/IEC 27005", ...base },
    { is_number: "IS/ISO/IEC 27017", title: "Information Technology — Code of Practice for Information Security Controls for Cloud Services", tc: "LITD 17", iso_equivalent: "ISO/IEC 27017:2015", bis_product_code: "IS/ISO/IEC 27017", ...base },
    { is_number: "IS/ISO/IEC 27018", title: "Information Technology — Code of Practice for Protection of Personally Identifiable Information in Public Clouds", tc: "LITD 17", iso_equivalent: "ISO/IEC 27018:2019", bis_product_code: "IS/ISO/IEC 27018", ...base },
    { is_number: "IS/ISO/IEC 27032", title: "Cybersecurity — Guidelines for Internet Security", tc: "LITD 17", iso_equivalent: "ISO/IEC 27032:2023", bis_product_code: "IS/ISO/IEC 27032", ...base },
    { is_number: "IS/ISO/IEC 27035-1", title: "Information Technology — Information Security Incident Management — Part 1: Principles and Process", tc: "LITD 17", iso_equivalent: "ISO/IEC 27035-1:2023", bis_product_code: "IS/ISO/IEC 27035-1", ...base },
    { is_number: "IS/ISO/IEC 27037", title: "Information Technology — Guidelines for Identification, Collection, Acquisition and Preservation of Digital Evidence", tc: "LITD 17", iso_equivalent: "ISO/IEC 27037:2012", bis_product_code: "IS/ISO/IEC 27037", ...base },
    { is_number: "IS/ISO/IEC 27040", title: "Information Technology — Storage Security", tc: "LITD 17", iso_equivalent: "ISO/IEC 27040:2015", bis_product_code: "IS/ISO/IEC 27040", ...base },
    { is_number: "IS/ISO/IEC 27043", title: "Information Technology — Incident Investigation Principles and Processes", tc: "LITD 17", iso_equivalent: "ISO/IEC 27043:2015", bis_product_code: "IS/ISO/IEC 27043", ...base },
    { is_number: "IS/ISO/IEC 27701", title: "Security Techniques — Extension to ISO/IEC 27001 and ISO/IEC 27002 for Privacy Information Management", tc: "LITD 17", iso_equivalent: "ISO/IEC 27701:2019", bis_product_code: "IS/ISO/IEC 27701", ...base },
    { is_number: "IS/ISO/IEC 29100", title: "Information Technology — Privacy Framework", tc: "LITD 17", iso_equivalent: "ISO/IEC 29100:2011", bis_product_code: "IS/ISO/IEC 29100", ...base },
    { is_number: "IS/ISO/IEC 29101", title: "Information Technology — Privacy Architecture Framework", tc: "LITD 17", iso_equivalent: "ISO/IEC 29101:2018", bis_product_code: "IS/ISO/IEC 29101", ...base },
    { is_number: "IS/ISO/IEC 29134", title: "Information Technology — Guidelines for Privacy Impact Assessment", tc: "LITD 17", iso_equivalent: "ISO/IEC 29134:2017", bis_product_code: "IS/ISO/IEC 29134", ...base },
    { is_number: "IS/ISO/IEC 29151", title: "Information Technology — Code of Practice for Personally Identifiable Information Protection", tc: "LITD 17", iso_equivalent: "ISO/IEC 29151:2017", bis_product_code: "IS/ISO/IEC 29151", ...base },
    { is_number: "IS/ISO/IEC 15408-1", title: "Evaluation Criteria for IT Security — Part 1: Introduction and General Model (Common Criteria)", tc: "LITD 17", iso_equivalent: "ISO/IEC 15408-1:2022", bis_product_code: "IS/ISO/IEC 15408-1", ...base },
    { is_number: "IS/ISO/IEC 20000-1", title: "Information Technology — Service Management — Part 1: Service Management System Requirements", tc: "LITD 17", iso_equivalent: "ISO/IEC 20000-1:2018", bis_product_code: "IS/ISO/IEC 20000-1", ...base, ics_code: "35.020" },
    { is_number: "IS/ISO/IEC 38500", title: "Corporate Governance of Information Technology", tc: "LITD 17", iso_equivalent: "ISO/IEC 38500:2015", bis_product_code: "IS/ISO/IEC 38500", ...base, ics_code: "35.020" },
  ];
}

function mergeWithSeed(live: StandardEntry[]): StandardEntry[] {
  const byNumber = new Map<string, StandardEntry>();
  for (const row of getCuratedSeed()) byNumber.set(row.is_number, row);
  for (const row of live) {
    // Live row takes precedence (richer metadata: publishedOn, validUpto).
    byNumber.set(row.is_number, row);
  }
  return Array.from(byNumber.values()).sort((a, b) => a.is_number.localeCompare(b.is_number));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(RAW_DIR)) {
    mkdirSync(RAW_DIR, { recursive: true });
    console.log(`Created directory: ${RAW_DIR}`);
  }

  let live: StandardEntry[] = [];
  try {
    live = await scrapeCatalog();
    console.log(`Live scrape returned ${live.length} IT/security-relevant standards`);
  } catch (err) {
    console.warn(
      `Live scrape failed: ${err instanceof Error ? err.message : String(err)}. Using curated seed only.`,
    );
  }

  let entries = mergeWithSeed(live);
  console.log(`Merged with curated seed: ${entries.length} total standards`);

  if (entries.length > fetchLimit) {
    entries = entries.slice(0, fetchLimit);
    console.log(`Limiting to ${fetchLimit} entries`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const entry of entries.slice(0, 30)) {
      console.log(
        `  ${entry.is_number.padEnd(40)} ${entry.title.slice(0, 70)}`,
      );
    }
    if (entries.length > 30) console.log(`  ... and ${entries.length - 30} more`);
    console.log(
      "\nNOTE: Full text NOT fetched. BIS standards text is paid content.",
    );
    return;
  }

  // Write catalog metadata to raw dir — NO PDF downloads, metadata only.
  const metaPath = join(RAW_DIR, "bis-catalog-metadata.json");
  if (!force && existsSync(metaPath)) {
    console.log(
      `Skipping write (exists, use --force to overwrite): ${metaPath}`,
    );
  } else {
    writeFileSync(metaPath, JSON.stringify(entries, null, 2), "utf8");
    console.log(
      `Wrote ${entries.length} standard metadata entries to ${metaPath}`,
    );
  }

  const summary = {
    fetchedAt: new Date().toISOString(),
    total: entries.length,
    note: "Catalog metadata only. Full standards text requires BIS subscription.",
    portal: PORTAL_URL,
    legacy_portal: LEGACY_PORTAL_URL,
    playwright: true,
    search_terms: SEARCH_TERMS,
    standards: entries.map((e) => ({
      is_number: e.is_number,
      title: e.title.slice(0, 80),
      tc: e.tc,
      iso_equivalent: e.iso_equivalent,
      published_on: e.published_on,
      matched_term: e.matched_term,
    })),
  };

  writeFileSync(
    join(RAW_DIR, "fetch-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
  console.log(`Summary written to ${join(RAW_DIR, "fetch-summary.json")}`);
  console.log(
    "\nNOTE: Full standards text was NOT fetched — BIS standards are paid/licensed content.",
  );
  console.log(`To access full text, visit: ${LEGACY_PORTAL_URL}`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
