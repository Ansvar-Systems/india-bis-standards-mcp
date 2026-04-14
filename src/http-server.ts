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

let pkgVersion = "0.1.0";
try {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  ) as { version: string };
  pkgVersion = pkg.version;
} catch {
  // fallback
}

let sourcesYml = "";
try {
  sourcesYml = readFileSync(join(__dirname, "..", "sources.yml"), "utf8");
} catch {
  // fallback
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
  return {
    disclaimer: DISCLAIMER,
    data_age: "See coverage.json; refresh frequency: quarterly",
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

    function errorContent(message: string) {
      return {
        content: [{ type: "text" as const, text: message }],
        isError: true as const,
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
                display_text: `BIS — ${control.title} (${control.control_ref})`,
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
                display_text: `BIS/IT Act — ${circular.title} (${circular.reference})`,
              },
              _meta: buildMeta(circular.pdf_url ?? SOURCE_URL),
            });
          }

          return errorContent(
            `No standard or rule found with reference: ${docId}. ` +
              "Use in_bis_search_standards to find available references.",
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

        default:
          return errorContent(`Unknown tool: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorContent(`Error executing ${name}: ${message}`);
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
