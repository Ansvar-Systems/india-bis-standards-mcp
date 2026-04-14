#!/usr/bin/env node

/**
 * India BIS IT Standards MCP — stdio entry point.
 *
 * Provides MCP tools for querying Bureau of Indian Standards (BIS)
 * IS standards catalog metadata, ISO equivalents, and IT Act rules.
 *
 * NOTE: Full standards text requires a BIS subscription.
 * This server provides catalog metadata only.
 *
 * Tool prefix: in_bis_
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

const SERVER_NAME = "india-bis-standards-mcp";

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

function buildMeta(sourceUrl?: string): Record<string, unknown> {
  return {
    disclaimer: DISCLAIMER,
    data_age: "See coverage.json; refresh frequency: quarterly",
    source_url: sourceUrl ?? SOURCE_URL,
  };
}

// --- Server -------------------------------------------------------------------

const server = new Server(
  { name: SERVER_NAME, version: pkgVersion },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

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

        // Try standard/control first
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

        // Try IT Act rule / circular
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
        return textContent({
          categories: frameworks,
          count: frameworks.length,
          _meta: buildMeta(),
        });
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
    return errorContent(
      `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

// --- Start --------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`${SERVER_NAME} v${pkgVersion} running on stdio\n`);
}

main().catch((err) => {
  process.stderr.write(
    `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
