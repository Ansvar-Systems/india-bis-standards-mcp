# Tools — India BIS IT Standards MCP

All tools use the `in_bis_` prefix. Every response includes a `_meta` object with `disclaimer`, `data_age`, and `source_url`. Tools returning standard entries also include a `note` field reminding callers that full text requires a BIS subscription.

---

## in_bis_search_standards

Full-text search across BIS IS standards catalog metadata and IT Act rules.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search query (e.g., "data privacy", "IS 16700", "access control") |
| `domain` | string | No | Filter by category |
| `limit` | number | No | Max results (default 10, max 50) |

### Example Call

```json
{
  "name": "in_bis_search_standards",
  "arguments": {
    "query": "data privacy",
    "limit": 5
  }
}
```

### Example Response

```json
{
  "results": [
    {
      "type": "control",
      "control_ref": "IS-16700",
      "title": "IS 16700:2018 — Data Privacy",
      "domain": "Data Privacy Standards",
      "summary": "IS 16700:2018 provides a framework for personal data protection in India..."
    }
  ],
  "count": 1,
  "note": "Returns standard metadata only. Full text requires BIS subscription at services.bis.gov.in.",
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: quarterly",
    "source_url": "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/"
  }
}
```

---

## in_bis_get_standard

Get a specific BIS IS standard or IT Act rule by its reference identifier.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | IS standard reference (e.g., "IS-16700", "IS-ISO-IEC-27001") or IT Act rule reference (e.g., "IT-ACT-43A-RSP-2011") |

### Example Call

```json
{
  "name": "in_bis_get_standard",
  "arguments": {
    "document_id": "IS-ISO-IEC-27001"
  }
}
```

### Example Response

```json
{
  "control_ref": "IS-ISO-IEC-27001",
  "title": "IS/ISO/IEC 27001:2023 — Information Security Management Systems",
  "domain": "Information Security Standards",
  "maturity_level": "2023",
  "priority": "LITD 17",
  "note": "Returns standard metadata only. Full text requires BIS subscription at services.bis.gov.in.",
  "_citation": {
    "canonical_ref": "IS-ISO-IEC-27001",
    "display_text": "BIS — IS/ISO/IEC 27001:2023 — Information Security Management Systems (IS-ISO-IEC-27001)"
  },
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: quarterly",
    "source_url": "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/"
  }
}
```

Returns an error if the reference is not found, with a suggestion to use `in_bis_search_standards`.

---

## in_bis_search_technical

Search BIS technical standards with optional category and domain filters.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search query (e.g., "encryption", "vulnerability management") |
| `framework` | string | No | Filter by category: `bis-data-privacy`, `bis-infosec`, or `bis-it-governance` |
| `domain` | string | No | Filter by domain |
| `limit` | number | No | Max results (default 10, max 50) |

### Example Call

```json
{
  "name": "in_bis_search_technical",
  "arguments": {
    "query": "privacy information management",
    "framework": "bis-data-privacy",
    "limit": 5
  }
}
```

### Example Response

```json
{
  "results": [
    {
      "control_ref": "IS-ISO-IEC-27701",
      "title": "IS/ISO/IEC 27701:2022 — Privacy Information Management System (PIMS)",
      "domain": "Data Privacy Standards",
      "maturity_level": "2022",
      "priority": "LITD 17"
    }
  ],
  "count": 1,
  "note": "Returns standard metadata only. Full text requires BIS subscription at services.bis.gov.in.",
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: quarterly",
    "source_url": "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/"
  }
}
```

---

## in_bis_list_categories

List all BIS IS standard categories covered by this server.

### Parameters

None.

### Example Call

```json
{
  "name": "in_bis_list_categories",
  "arguments": {}
}
```

### Example Response

```json
{
  "categories": [
    {
      "id": "bis-data-privacy",
      "name": "BIS Data Privacy Standards",
      "domain": "Data Privacy Standards",
      "control_count": 8,
      "effective_date": "2018-01-01"
    },
    {
      "id": "bis-infosec",
      "name": "BIS Information Security Standards",
      "domain": "Information Security Standards",
      "control_count": 14,
      "effective_date": "2014-01-01"
    },
    {
      "id": "bis-it-governance",
      "name": "BIS IT Governance Standards",
      "domain": "IT Governance Standards",
      "control_count": 7,
      "effective_date": "2011-01-01"
    }
  ],
  "count": 3,
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: quarterly",
    "source_url": "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/"
  }
}
```

---

## in_bis_about

Return metadata about this MCP server: version, data sources, coverage summary, and available tools.

### Parameters

None.

### Example Call

```json
{
  "name": "in_bis_about",
  "arguments": {}
}
```

### Example Response

```json
{
  "name": "india-bis-standards-mcp",
  "version": "0.1.0",
  "description": "Bureau of Indian Standards (BIS) IT Standards MCP server...",
  "data_source": "Bureau of Indian Standards (BIS)",
  "source_url": "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/",
  "coverage": {
    "categories": "3 BIS standard categories",
    "standards": "18 IS standards (metadata)",
    "rules": "8 IT Act rules and notifications",
    "jurisdictions": ["India"],
    "sectors": ["IT", "Cybersecurity", "Data Privacy", "Telecommunications", "Finance"]
  },
  "tools": [
    { "name": "in_bis_search_standards", "description": "..." },
    { "name": "in_bis_get_standard", "description": "..." },
    { "name": "in_bis_search_technical", "description": "..." },
    { "name": "in_bis_list_categories", "description": "..." },
    { "name": "in_bis_about", "description": "..." },
    { "name": "in_bis_list_sources", "description": "..." }
  ],
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: quarterly",
    "source_url": "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/"
  }
}
```

---

## in_bis_list_sources

Return data provenance information: which BIS sources are indexed, retrieval method, update frequency, and licensing terms.

### Parameters

None.

### Example Call

```json
{
  "name": "in_bis_list_sources",
  "arguments": {}
}
```

### Example Response

```json
{
  "sources_yml": "schema_version: \"1.0\"\nmcp_name: \"India BIS IT Standards MCP\"\n...",
  "note": "Data is sourced from the official BIS standards catalog. See sources.yml for full provenance.",
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: quarterly",
    "source_url": "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/"
  }
}
```
