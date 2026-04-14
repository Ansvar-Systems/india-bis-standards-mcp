# Coverage — India BIS IT Standards MCP

> Last verified: 2026-04-14 | Database version: 0.1.0

## Coverage Scope: Metadata Only

BIS standards full text requires paid subscription at services.bis.gov.in. This MCP provides ONLY metadata (title, IS number, TC, status, ICS code). For full standards text, purchase from BIS directly.

## What's Included

| Source | Items | Version | Completeness | Refresh |
|--------|-------|---------|-------------|---------|
| IS 16700 (Data Privacy) | 1 standard | 2018 (under review for DPDPA 2023) | Metadata | Quarterly |
| IS/ISO/IEC 27xxx ISMS & security series | 40+ standards | 2017–2024 adoptions | Metadata | Quarterly |
| IS/ISO/IEC 29xxx privacy series (29100/29101/29134/29151/29192) | 8+ standards | Various | Metadata | Quarterly |
| IS/ISO/IEC 15408 & 15446 (Common Criteria / protection profiles) | 8+ standards | 2022–2024 | Metadata | Quarterly |
| IS/ISO/IEC 11770 (key management) | 6 standards | Various | Metadata | Quarterly |
| IS/ISO/IEC 18033 / 18014 / 18031 (encryption, time-stamping, RBG) | 10+ standards | Various | Metadata | Quarterly |
| IS/ISO/IEC 19790 / 19792 / 19896 / 20540 / 24759 (crypto module testing) | 6+ standards | 2018–2025 | Metadata | Quarterly |
| IS/ISO/IEC 24745 / 24760 (biometric info protection, identity mgmt) | 2+ standards | Various | Metadata | Quarterly |
| IS/ISO/IEC 20000-1 (IT Service Management) | 1 standard | 2019 adoption | Metadata | Quarterly |
| IS/ISO/IEC 38500 (IT Governance) | 1 standard | 2016 adoption | Metadata | Quarterly |
| IS 14990 (Common Criteria — Indian parts 1–5) | 5 standards | 2024 | Metadata | Quarterly |
| IS 17428 (Data Privacy Assurance, Indian-origin) | 2 standards | 2020 | Metadata | Quarterly |
| IT Act Section 43A SPDI Rules 2011 | 1 rule | 2011 | Full text | Quarterly |
| CERT-In Directions 2022 | 1 direction | 2022 | Full text | Quarterly |
| DPDPA 2023 framework summary | 1 entry | 2023 | Summary | Quarterly |
| Intermediary Guidelines 2021 | 1 rule | 2021 | Full text | Quarterly |
| RBI NBFC Cybersecurity Framework 2022 | 1 framework | 2022 | Summary | Quarterly |
| SEBI Cybersecurity Framework 2023 | 1 circular | 2023 | Summary | Quarterly |
| BIS Product Certification (IT/Electronics) | 1 scheme | Current | Summary | Quarterly |

**Total:** 6 tools, 139 IS standards (metadata, scraped from standards.bis.gov.in via Playwright) + ~8 IT Act rules and regulatory frameworks

## What's NOT Included

| Gap | Reason | Planned? |
|-----|--------|----------|
| **Full standards text** | Paid/licensed from BIS; available via subscription at services.bis.gov.in | No — commercial content |
| Restricted distribution standards | Not publicly accessible | No |
| Withdrawn standards older than 10 years | Out of scope | No |
| Hindi-medium standards (where no English version exists) | English focus for v1 | Yes v2 |
| Draft standards under public comment | Not yet adopted | On release |
| Standards from other TCs (non-LITD 17) except where explicitly listed | Scope limited to IT/security | Possible v2 |

## Limitations

- BIS IS standards full text is commercial/subscription content. This MCP provides metadata only.
- The BIS portal (standards.bis.gov.in) is JavaScript-rendered; catalog ingestion uses Playwright (headless Chromium) to reach the same search endpoint the Angular UI calls (`review-service/searchStandardsByNumberOrTitle`). If the upstream portal changes shape, the fetcher falls back to a curated seed list of 19 known entries.
- Coverage is scoped to the LITD 17 Information Systems Security subcommittee (departmentId 66, committeeId 234) plus explicit ISO/IEC IT-security-family numbers (27xxx, 29xxx privacy, 15408 Common Criteria, 11770 key management, 18033 encryption, etc.). Rows outside that scope (alarm systems, power systems, climate change, medical informatics, agriculture, construction) are filtered out even when keywords match.
- ICS codes are not exposed on the live search payload and are left blank for scraped rows. Curated seed rows retain their ICS codes.
- IS 16700 is under review to align with the Digital Personal Data Protection Act 2023 (DPDPA); the revised version may carry a different IS number.
- Some IS adoptions of ISO standards may lag official ISO releases by 1–3 years.

## Data Freshness

| Source | Refresh Schedule | Last Refresh | Next Expected |
|--------|-----------------|-------------|---------------|
| BIS Catalog Metadata | Quarterly | 2026-04-13 | 2026-07-13 |
| IT Act Rules | Quarterly | 2026-04-13 | 2026-07-13 |

To check freshness programmatically, call the `in_bis_about` tool.

## BIS Subscription

Full standards text is available via:
- **Online purchase:** https://www.services.bis.gov.in/
- **BIS sales offices:** Available in major Indian cities
- **Authorized resellers:** Contact BIS for current reseller list
