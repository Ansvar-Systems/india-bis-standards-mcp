# India BIS IT Standards MCP

MCP server for querying Bureau of Indian Standards (BIS) IS standards catalog metadata for IT and cybersecurity. Part of the [Ansvar](https://ansvar.eu) regulatory intelligence platform.

**Important:** BIS IS standards full text is commercial/subscription content. This server provides catalog metadata only (titles, IS numbers, adoption status, ISO equivalents). For full standards text, obtain a BIS subscription at [services.bis.gov.in](https://www.services.bis.gov.in/) or via authorized resellers.

## What's Included

- **IS 16700:2018 — Data Privacy** — India's national data privacy standard (metadata)
- **IS/ISO/IEC 27001** national adoption — ISMS requirements (metadata)
- **IS/ISO/IEC 27002** — Information security controls (metadata)
- **IS/ISO/IEC 27701** — Privacy information management system (metadata)
- **IS/ISO/IEC 27005, 27017, 27018, 27032, 27035, 27037, 27040, 27043** — metadata for each
- **IS/ISO/IEC 29100, 29101, 29134, 29151** — Privacy framework series (metadata)
- **IT Act Section 43A Reasonable Security Practices Rules 2011** — full rule text (publicly available)
- **CERT-In Directions 2022, DPDPA 2023, RBI/SEBI cybersecurity frameworks** — publicly available text

For full coverage details, see [COVERAGE.md](COVERAGE.md). For tool specifications, see [TOOLS.md](TOOLS.md).

## What's NOT Included

- Full standards text (paid/licensed from BIS)
- Restricted distribution standards
- Withdrawn standards older than 10 years

## Installation

### npm (stdio transport)

```bash
npm install @ansvar/india-bis-standards-mcp
```

### Docker (HTTP transport)

```bash
docker pull ghcr.io/ansvar-systems/india-bis-standards-mcp:latest
docker run -p 9196:9196 ghcr.io/ansvar-systems/india-bis-standards-mcp:latest
```

## Usage

### stdio (Claude Desktop, Cursor, etc.)

Add to your MCP client configuration:

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

### HTTP (Streamable HTTP)

```bash
docker run -p 9196:9196 ghcr.io/ansvar-systems/india-bis-standards-mcp:latest
# Server available at http://localhost:9196/mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `in_bis_search_standards` | Full-text search across IS standards catalog metadata and IT Act rules |
| `in_bis_get_standard` | Get a specific IS standard or IT Act rule by reference ID |
| `in_bis_search_technical` | Search technical standards with optional category/domain filters |
| `in_bis_list_categories` | List all BIS IS standard categories with counts |
| `in_bis_about` | Server metadata, version, and coverage summary |
| `in_bis_list_sources` | Data provenance: sources, retrieval method, licensing |
| `in_bis_check_data_freshness` | Per-source data age, refresh frequency, OK / Due / OVERDUE status |

All tools return standard metadata. Full text requires BIS subscription. See [TOOLS.md](TOOLS.md) for parameters, return formats, and examples.

## Data Sources

- [BIS Standards Portal](https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/) — catalog metadata (public)
- [IT Act Section 43A SPDI Rules 2011](https://meity.gov.in/writereaddata/files/GSR313E_10511(1).pdf) — full text (public)
- [CERT-In Directions 2022](https://www.cert-in.org.in/) — full text (public)
- [Digital Personal Data Protection Act 2023](https://meity.gov.in/) — full text (public)

See [sources.yml](sources.yml) for full provenance details.

## Development

```bash
git clone https://github.com/Ansvar-Systems/india-bis-standards-mcp.git
cd india-bis-standards-mcp
npm install
npm run seed        # Create sample database
npm run build       # Compile TypeScript
npm test            # Run tests
npm run dev         # Start HTTP dev server with hot reload
```

## Disclaimer

This server provides informational reference data only. It does not constitute legal or regulatory advice. Always verify against official BIS publications. See [DISCLAIMER.md](DISCLAIMER.md) for full terms.

## License

[BSL-1.1](LICENSE) — Ansvar Systems AB. Converts to Apache-2.0 on 2030-04-13.
