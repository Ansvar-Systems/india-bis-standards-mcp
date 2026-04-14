#!/usr/bin/env node

/**
 * HTTP Server Entry Point for Docker Deployment
 *
 * Provides Streamable HTTP transport for remote MCP clients.
 * Use src/index.ts for local stdio-based usage.
 *
 * Endpoints:
 *   GET  /health  — liveness probe
 *   POST /mcp     — MCP Streamable HTTP (session-aware)
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  searchRegulations,
  searchControls,
  getControl,
  getCircular,
  listFrameworks,
  getStats,
} from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env["PORT"] ?? "9196", 10);
const SERVER_NAME = "india-bis-standards-mcp";

function readFirst(candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      // try next candidate
    }
  }
  return null;
}

let pkgVersion = "0.1.0";
const pkgRaw = readFirst([
  join(__dirname, "..", "package.json"),
  join(__dirname, "..", "..", "package.json"),
  "package.json",
]);
if (pkgRaw) {
  try {
    pkgVersion = (JSON.parse(pkgRaw) as { version: string }).version;
  } catch {
    // keep fallback
  }
}

const sourcesYml =
  readFirst([
    join(__dirname, "..", "sources.yml"),
    join(__dirname, "..", "..", "sources.yml"),
    "sources.yml",
  ]) ?? "";

interface CoverageSourceEntry {
  name: string;
  url: string;
  last_fetched: string | null;
  update_frequency: string;
  item_count: number;
  status: string;
  expected_items?: number;
  measurement_unit?: string;
  verification_method?: string;
  last_verified?: string;
}

interface CoverageDoc {
  generatedAt: string;
  mcp: string;
  version: string;
  sources: CoverageSourceEntry[];
  totals: { frameworks: number; controls: number; circulars: number };
  scope_statement?: string;
  scope_exclusions?: string[];
}

let coverageDoc: CoverageDoc | null = null;
// __dirname is dist/src when running the compiled bundle and src when
// running with tsx. Try both repo-root candidates plus an explicit env
// override so freshness reporting works in dev, in tests, and in the
// Docker image (where data/ sits at /app/data/).
const COVERAGE_CANDIDATES = [
  process.env["BIS_COVERAGE_PATH"],
  join(__dirname, "..", "data", "coverage.json"),
  join(__dirname, "..", "..", "data", "coverage.json"),
  "data/coverage.json",
].filter(Boolean) as string[];
for (const candidate of COVERAGE_CANDIDATES) {
  try {
    const raw = readFileSync(candidate, "utf8");
    coverageDoc = JSON.parse(raw) as CoverageDoc;
    break;
  } catch {
    // try next candidate
  }
}

const FREQUENCY_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 31,
  quarterly: 92,
  annually: 365,
  annual: 365,
};

function freshnessReport(): {
  generated_at: string;
  database_version: string | null;
  sources: Array<{
    name: string;
    last_fetched: string | null;
    update_frequency: string;
    age_days: number | null;
    max_age_days: number;
    status: "Current" | "Due" | "OVERDUE" | "Unknown";
    item_count: number;
  }>;
  any_stale: boolean;
  refresh_instructions: string;
} {
  const sources: ReturnType<typeof freshnessReport>["sources"] = [];
  let anyStale = false;
  if (coverageDoc) {
    const now = Date.now();
    for (const src of coverageDoc.sources) {
      const maxAgeDays = FREQUENCY_DAYS[src.update_frequency.toLowerCase()] ?? 92;
      let ageDays: number | null = null;
      let status: "Current" | "Due" | "OVERDUE" | "Unknown" = "Unknown";
      if (src.last_fetched) {
        const t = new Date(src.last_fetched).getTime();
        if (!Number.isNaN(t)) {
          ageDays = Math.floor((now - t) / (24 * 60 * 60 * 1000));
          if (ageDays > maxAgeDays) {
            status = "OVERDUE";
            anyStale = true;
          } else if (ageDays > maxAgeDays * 0.8) {
            status = "Due";
          } else {
            status = "Current";
          }
        }
      } else {
        status = "OVERDUE";
        anyStale = true;
      }
      sources.push({
        name: src.name,
        last_fetched: src.last_fetched,
        update_frequency: src.update_frequency,
        age_days: ageDays,
        max_age_days: maxAgeDays,
        status,
        item_count: src.item_count,
      });
    }
  }
  return {
    generated_at: coverageDoc?.generatedAt ?? "unknown",
    database_version: coverageDoc?.version ?? null,
    sources,
    any_stale: anyStale,
    refresh_instructions:
      "To trigger a forced ingestion run: " +
      "gh workflow run ingest.yml --repo Ansvar-Systems/india-bis-standards-mcp -f force=true",
  };
}

const DISCLAIMER =
  "This data is provided for informational reference only. It does not constitute legal or professional advice. " +
  "Always verify against official BIS publications at https://www.services.bis.gov.in/. " +
  "BIS IS standards full text is commercial/subscription content — this server provides catalog metadata only. " +
  "For full standards text, obtain a BIS subscription at services.bis.gov.in or via authorized resellers.";

const SOURCE_URL = "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/";

// --- Tool definitions ---------------------------------------------------------

const TOOLS = [
  {
    name: "in_bis_search_standards",
    description:
      "Full-text search across BIS IS standards catalog metadata and IT Act rules. " +
      "Covers IS 16700 (Data Privacy), IS/ISO/IEC 27001 national adoption, IS/ISO/IEC 27002, " +
      "IS/ISO/IEC 27701, and other IS standards relevant to IT and cybersecurity. " +
      "Returns matching standards with IS number, title, category, adoption year, and ISO equivalent. " +
      "Returns standard metadata only — full text requires BIS subscription.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Search query (e.g., 'data privacy', 'information security management', 'access control', 'IS 16700')",
        },
        domain: {
          type: "string",
          description:
            "Filter by category (e.g., 'Data Privacy Standards', 'Information Security Standards', " +
            "'IT Governance Standards'). Optional.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 10, max 50.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "in_bis_get_standard",
    description:
      "Get a specific BIS IS standard or IT Act rule by its reference identifier. " +
      "For IS standards use the IS number (e.g., 'IS-16700', 'IS-ISO-IEC-27001'). " +
      "For IT Act rules use the rule reference (e.g., 'IT-ACT-43A-RSP-2011'). " +
      "Returns standard metadata only — full text requires BIS subscription.",
    inputSchema: {
      type: "object" as const,
      properties: {
        document_id: {
          type: "string",
          description: "IS standard number or IT Act rule reference",
        },
      },
      required: ["document_id"],
    },
  },
  {
    name: "in_bis_search_technical",
    description:
      "Search BIS technical standards specifically. Covers IS standards across categories: " +
      "Data Privacy, Information Security Management, IT Governance, Network Security, " +
      "and Cybersecurity. Returns standard entries with TC (technical committee), status, " +
      "and ISO equivalent cross-reference. Returns metadata only — full text requires BIS subscription.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Search query (e.g., 'encryption', 'vulnerability management', " +
            "'identity management', 'privacy information management')",
        },
        framework: {
          type: "string",
          enum: ["bis-data-privacy", "bis-infosec", "bis-it-governance"],
          description:
            "Filter by category ID. bis-data-privacy=Data Privacy Standards, " +
            "bis-infosec=Information Security Standards, bis-it-governance=IT Governance Standards. Optional.",
        },
        domain: {
          type: "string",
          description:
            "Filter by domain (e.g., 'Data Privacy Standards', 'Information Security Standards'). Optional.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 10, max 50.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "in_bis_list_categories",
    description:
      "List all BIS IS standard categories covered by this server, including standard count " +
      "and coverage domain. " +
      "Use this to understand what regulatory material is available before searching.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "in_bis_about",
    description:
      "Return metadata about this MCP server: version, data sources, coverage summary, " +
      "and list of available tools.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "in_bis_list_sources",
    description:
      "Return data provenance information: which BIS sources are indexed, " +
      "how data is retrieved, update frequency, and licensing terms.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "in_bis_check_data_freshness",
    description:
      "Report per-source data age, expected refresh frequency, and staleness " +
      "status by reading data/coverage.json. Returns OK / Due / OVERDUE per " +
      "source. Use to decide whether to trigger an ingestion run.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// --- Zod schemas --------------------------------------------------------------

const SearchRegulationsArgs = z.object({
  query: z.string().min(1),
  domain: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

const GetStandardArgs = z.object({
  document_id: z.string().min(1),
});

const SearchTechnicalArgs = z.object({
  query: z.string().min(1),
  framework: z.enum(["bis-data-privacy", "bis-infosec", "bis-it-governance"]).optional(),
  domain: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

// --- Helpers ------------------------------------------------------------------

function buildMeta(sourceUrl?: string): Record<string, unknown> {
  // Prefer the date stored in coverage.json so consumers see the actual
  // last-ingest date, not a static "quarterly" placeholder.
  let dataAge = "See coverage.json; refresh frequency: quarterly";
  if (coverageDoc?.generatedAt) {
    dataAge = coverageDoc.generatedAt.slice(0, 10);
  }
  return {
    disclaimer: DISCLAIMER,
    data_age: dataAge,
    availability: "paid (metadata only — full BIS standards text requires subscription)",
    source_url: sourceUrl ?? SOURCE_URL,
  };
}

// --- MCP server factory -------------------------------------------------------

function createMcpServer(): Server {
  const mcpServer = new Server(
    { name: SERVER_NAME, version: pkgVersion },
    { capabilities: { tools: {} } },
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    function textContent(data: unknown) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }

    type ErrorType = "NO_MATCH" | "INVALID_INPUT" | "INTERNAL_ERROR";

    function errorContent(message: string, errorType: ErrorType = "INTERNAL_ERROR") {
      return {
        content: [{ type: "text" as const, text: message }],
        isError: true as const,
        _error_type: errorType,
        _meta: buildMeta(),
      };
    }

    try {
      switch (name) {
        case "in_bis_search_standards": {
          const parsed = SearchRegulationsArgs.parse(args);
          const results = searchRegulations({
            query: parsed.query,
            domain: parsed.domain,
            limit: parsed.limit ?? 10,
          });
          return textContent({
            results,
            count: results.length,
            note: "Returns standard metadata only. Full text requires BIS subscription at services.bis.gov.in.",
            _meta: buildMeta(),
          });
        }

        case "in_bis_get_standard": {
          const parsed = GetStandardArgs.parse(args);
          const docId = parsed.document_id;

          const control = getControl(docId);
          if (control) {
            return textContent({
              ...control,
              note: "Returns standard metadata only. Full text requires BIS subscription at services.bis.gov.in.",
              _citation: {
                canonical_ref: control.control_ref,
                display_text: `BIS ${control.control_ref} — ${control.title} (metadata only; full text requires paid BIS subscription)`,
                aliases: [control.control_ref, control.title.split(" — ")[0] ?? control.control_ref],
                source_url: SOURCE_URL,
                availability: "paid",
                lookup: {
                  tool: "in_bis_get_standard",
                  args: { document_id: control.control_ref },
                },
              },
              _meta: buildMeta(),
            });
          }

          const circular = getCircular(docId);
          if (circular) {
            return textContent({
              ...circular,
              _citation: {
                canonical_ref: circular.reference,
                display_text: `BIS/IT Act ${circular.reference} — ${circular.title}`,
                aliases: [circular.reference],
                source_url: circular.pdf_url ?? SOURCE_URL,
                availability: "public",
                lookup: {
                  tool: "in_bis_get_standard",
                  args: { document_id: circular.reference },
                },
              },
              _meta: buildMeta(circular.pdf_url ?? SOURCE_URL),
            });
          }

          return errorContent(
            `No standard or rule found with reference: ${docId}. ` +
              "Use in_bis_search_standards to find available references.",
            "NO_MATCH",
          );
        }

        case "in_bis_search_technical": {
          const parsed = SearchTechnicalArgs.parse(args);
          const results = searchControls({
            query: parsed.query,
            framework: parsed.framework,
            domain: parsed.domain,
            limit: parsed.limit ?? 10,
          });
          return textContent({
            results,
            count: results.length,
            note: "Returns standard metadata only. Full text requires BIS subscription at services.bis.gov.in.",
            _meta: buildMeta(),
          });
        }

        case "in_bis_list_categories": {
          const frameworks = listFrameworks();
          return textContent({ categories: frameworks, count: frameworks.length, _meta: buildMeta() });
        }

        case "in_bis_about": {
          const stats = getStats();
          return textContent({
            name: SERVER_NAME,
            version: pkgVersion,
            description:
              "Bureau of Indian Standards (BIS) IT Standards MCP server. " +
              "Provides structured access to BIS IS standards catalog metadata, ISO equivalents, " +
              "and IT Act rules relevant to IT and cybersecurity in India. " +
              "Full standards text requires a BIS subscription.",
            data_source: "Bureau of Indian Standards (BIS)",
            source_url: SOURCE_URL,
            coverage: {
              categories: `${stats.frameworks} BIS standard categories`,
              standards: `${stats.controls} IS standards (metadata)`,
              rules: `${stats.circulars} IT Act rules and notifications`,
              jurisdictions: ["India"],
              sectors: ["IT", "Cybersecurity", "Data Privacy", "Telecommunications", "Finance"],
            },
            tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
            _meta: buildMeta(),
          });
        }

        case "in_bis_list_sources": {
          return textContent({
            sources_yml: sourcesYml,
            note: "Data is sourced from the official BIS standards catalog. See sources.yml for full provenance.",
            _meta: buildMeta(),
          });
        }

        case "in_bis_check_data_freshness": {
          const report = freshnessReport();
          return textContent({
            ...report,
            note:
              "Freshness is computed from data/coverage.json. " +
              "Status: Current = within refresh window, Due = within 20% of deadline, " +
              "OVERDUE = past expected refresh date.",
            _meta: buildMeta(),
          });
        }

        default:
          return errorContent(`Unknown tool: ${name}`, "INVALID_INPUT");
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return errorContent(
          `Invalid arguments for ${name}: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
          "INVALID_INPUT",
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      return errorContent(`Error executing ${name}: ${message}`, "INTERNAL_ERROR");
    }
  });

  return mcpServer;
}

// --- HTTP server --------------------------------------------------------------

async function main(): Promise<void> {
  const sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: Server }
  >();

  const httpServer = createServer((req, res) => {
    handleRequest(req, res, sessions).catch((err) => {
      console.error(`[${SERVER_NAME}] Unhandled error:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  });

  async function handleRequest(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
    activeSessions: Map<
      string,
      { transport: StreamableHTTPServerTransport; server: Server }
    >,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ status: "ok", server: SERVER_NAME, version: pkgVersion }),
      );
      return;
    }

    if (url.pathname === "/mcp") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && activeSessions.has(sessionId)) {
        const session = activeSessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        return;
      }

      const mcpServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch with exactOptionalPropertyTypes
      await mcpServer.connect(transport as any);

      transport.onclose = () => {
        if (transport.sessionId) {
          activeSessions.delete(transport.sessionId);
        }
        mcpServer.close().catch(() => {});
      };

      await transport.handleRequest(req, res);

      if (transport.sessionId) {
        activeSessions.set(transport.sessionId, { transport, server: mcpServer });
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  httpServer.listen(PORT, () => {
    console.error(`${SERVER_NAME} v${pkgVersion} (HTTP) listening on port ${PORT}`);
    console.error(`MCP endpoint:  http://localhost:${PORT}/mcp`);
    console.error(`Health check:  http://localhost:${PORT}/health`);
  });

  process.on("SIGTERM", () => {
    console.error("Received SIGTERM, shutting down...");
    httpServer.close(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
