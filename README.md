# India BIS IT Standards MCP

> Structured access to Bureau of Indian Standards (BIS) IS standards catalog metadata for IT, cybersecurity, and data privacy — 3 BIS framework groupings and 139 indexed standard rows (LITD 17 subcommittee plus ISO/IEC IT-security family adoptions), with publicly available IT Act rules and CERT-In / DPDPA linkouts.

[![npm](https://img.shields.io/npm/v/@ansvar/india-bis-standards-mcp)](https://www.npmjs.com/package/@ansvar/india-bis-standards-mcp)
[![License](https://img.shields.io/badge/license-BSL--1.1-blue.svg)](LICENSE)
[![CI](https://github.com/Ansvar-Systems/india-bis-standards-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/india-bis-standards-mcp/actions/workflows/ci.yml)

Part of the [Ansvar](https://ansvar.eu) regulatory intelligence platform.
This MCP server provides the authoritative Ansvar index of Indian IT-
security and data-privacy standards metadata, anchored by the LITD 17
subcommittee output and the national adoption of ISO/IEC 27000-series and
29100-series standards. Standards full text is commercial/subscription
content and is **not** included; this server returns metadata only.

> **Metadata-only.** BIS IS standards full text is commercial/subscription
> content. This server provides catalog metadata only (titles, IS numbers,
> adoption status, ISO equivalents). For full standards text, obtain a BIS
> subscription at
> [services.bis.gov.in](https://www.services.bis.gov.in/) or via authorized
> resellers.

## Quick Start

### Remote (Hetzner)

Use the hosted endpoint — no installation needed:

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "india-bis-standards": {
      "url": "https://mcp.ansvar.eu/in/bis-standards/mcp"
    }
  }
}
```

**Cursor / VS Code** (`.cursor/mcp.json` or `.vscode/mcp.json`):
```json
{
  "servers": {
    "india-bis-standards": {
      "url": "https://mcp.ansvar.eu/in/bis-standards/mcp"
    }
  }
}
```

### Local (npm)

```bash
npx @ansvar/india-bis-standards-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "india-bis-standards": {
      "command": "npx",
      "args": ["-y", "@ansvar/india-bis-standards-mcp"]
    }
  }
}
```

### Docker

```bash
docker pull ghcr.io/ansvar-systems/india-bis-standards-mcp:latest
docker run -p 9196:9196 ghcr.io/ansvar-systems/india-bis-standards-mcp:latest
```

HTTP endpoint: `http://localhost:9196/mcp`. Liveness: `http://localhost:9196/health`.

## What's Included

| Source | Version | Count | Completeness |
|--------|---------|-------|--------------|
| BIS IS Standards Catalog (LITD 17 + ISO/IEC IT-security family) | current | 3 framework groupings, 139 standard rows | Metadata-only snapshot |
| IT Act Section 43A SPDI Rules 2011 | 2011 | Full rule text | Full (publicly available) |
| CERT-In Directions 2022 | 2022 | Full text | Full (publicly available) |
| Digital Personal Data Protection Act 2023 | 2023 | Linkout | Reference only |

BIS framework groupings:

| Framework ID | Name |
|--------------|------|
| `bis-infosec` | BIS Information Security Standards |
| `bis-data-privacy` | BIS Data Privacy Standards |
| `bis-it-governance` | BIS IT Governance Standards |

Standard rows by domain:

| Domain | Count |
|--------|-------|
| Information Security Standards | 95 |
| Data Privacy Standards | 37 |
| IT Governance Standards | 7 |

Notable standards indexed (metadata only):

- IS 16700:2018 — India's national data privacy standard
- IS/ISO/IEC 27001 — ISMS requirements (national adoption)
- IS/ISO/IEC 27002 — Information security controls
- IS/ISO/IEC 27701 — Privacy information management system (PIMS)
- IS/ISO/IEC 27005, 27017, 27018, 27032, 27035, 27037, 27040, 27043
- IS/ISO/IEC 29100, 29101, 29134, 29151 — Privacy framework series

Every `controls` row carries `availability = "paid"` — the MCP will return
the metadata but never the full text.

See [COVERAGE.md](COVERAGE.md) for the full ingestion log.

## What's NOT Included

- **Full BIS IS standards text** — paid/licensed; purchase from
  [services.bis.gov.in](https://www.services.bis.gov.in/) or authorized
  resellers.
- **Restricted-distribution IS standards** — not in the public catalog.
- **Withdrawn standards older than 10 years** — dropped to keep the index
  current.
- **Hindi-only BIS publications** — English focus for v1.
- **Draft standards under public comment** — not stable citations; only
  published standards are indexed.
- **ICS codes on live-scraped rows** — the public BIS search API does not
  expose ICS.
- **BIS standards outside LITD 17 IT-security scope** — alarm systems,
  power systems, climate, medical informatics, agriculture, construction,
  etc. are filtered out by the ingestion gate.

## Installation

### npm (stdio transport)

```bash
npm install @ansvar/india-bis-standards-mcp
```

### Docker (HTTP transport)

```bash
docker pull ghcr.io/ansvar-systems/india-bis-standards-mcp:latest
docker run -p 9196:9196 ghcr.io/ansvar-systems/india-bis-standards-mcp:latest
# MCP endpoint: http://localhost:9196/mcp
# Health:       http://localhost:9196/health
```

### Hosted

- Public MCP: `https://mcp.ansvar.eu/in/bis-standards`
- Gateway (OAuth, multi-MCP):
  [`https://gateway.ansvar.eu`](https://gateway.ansvar.eu)

## Tools

All tools use the `in_bis_` prefix. Every response includes a `_meta` object
with `disclaimer`, `data_age`, and `source_url`. Error responses also include
`_error_type` (`NO_MATCH` | `INVALID_INPUT` | `INTERNAL_ERROR`). Retrieval
tools return a `_citation` object pinned to the BIS catalog URL (or the
publicly available rule / directive URL for full-text items).

| Tool | Description |
|------|-------------|
| `in_bis_search_standards` | Full-text search across IS standards catalog metadata and IT Act rules (optional `category` filter, `limit ≤50`) |
| `in_bis_get_standard` | Look up a specific IS standard or IT Act rule by reference ID |
| `in_bis_search_technical` | Search technical standards with optional category/domain filters |
| `in_bis_list_categories` | List every BIS IS standard category with counts |
| `in_bis_about` | Server metadata, coverage summary, available tools |
| `in_bis_list_sources` | Data provenance: sources, retrieval method, update frequency, licensing |
| `in_bis_check_data_freshness` | Per-source freshness (`current` / `due_soon` / `overdue`) from `data/coverage.json` |

All tools return standards **metadata** only; full text requires a BIS
subscription. See [TOOLS.md](TOOLS.md) for parameter tables, return formats,
and examples.

## Example Queries

```
# Search for ISMS and risk-management standards in the catalog
in_bis_search_standards("information security management system risk")

# Look up IS 16700:2018 (data privacy)
in_bis_get_standard("IS 16700:2018")

# Find privacy-framework standards
in_bis_search_technical("privacy information management", domain="Data Privacy Standards")

# List every BIS category indexed
in_bis_list_categories()

# Check data freshness (quarterly refresh expected)
in_bis_check_data_freshness()
```

## Development

```bash
git clone https://github.com/Ansvar-Systems/india-bis-standards-mcp.git
cd india-bis-standards-mcp
npm install
npm run build        # compile TypeScript
npm test             # run Vitest
npm run dev          # HTTP dev server on port 9196
npm run seed         # create sample DB for offline dev
npm run build:db     # rebuild SQLite from parsed JSON + curated seed
npm run ingest:full  # fetch -> build:db -> coverage update
```

Ingestion hits the public BIS Standard Review portal, scope-gates to the
LITD 17 subcommittee and the explicit ISO/IEC IT-security family numbers,
and merges live rows with a curated seed of 19 known IS standards. Live
rows take precedence. Full text is never fetched or redistributed.

Branching: `feature/* → dev → main`. Direct pushes to `main` are blocked by
branch protection.

## Authority

**Bureau of Indian Standards (BIS)**
Manak Bhawan, 9, Bahadur Shah Zafar Marg, New Delhi 110002, India
https://www.bis.gov.in

BIS is the national standards body established by the BIS Act 2016. IS
standards are voluntary by default but become mandatory through specific
Quality Control Orders (QCOs) issued by Government ministries.

Supplementary authorities referenced in this MCP:

- **MeitY** (Ministry of Electronics and Information Technology) — IT Act
  rules, CERT-In, DPDPA.
- **CERT-In** — Indian Computer Emergency Response Team; 2022 directions on
  incident reporting.

## License

BSL-1.1. See [LICENSE](LICENSE). Converts to Apache-2.0 on 2030-04-13.

## Disclaimer

This server provides informational reference data only. It does not
constitute legal, regulatory, or professional advice. BIS standards full
text is **not** available through this MCP; obtain a BIS subscription for
the authoritative text. Always verify metadata against the official BIS
catalog.

See [DISCLAIMER.md](DISCLAIMER.md) for full terms.
