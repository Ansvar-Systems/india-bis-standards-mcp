/**
 * Seed the BIS database with sample standard categories, IS standards metadata,
 * and IT Act rules.
 *
 * NOTE: Only catalog metadata is seeded here. Full standards text is
 * commercial/subscription content from BIS. This seed file contains IS number,
 * title, TC (technical committee), adoption year, status, ISO equivalent, and
 * BIS product code — not the full standard text.
 *
 * Usage:
 *   npx tsx scripts/seed-sample.ts
 *   npx tsx scripts/seed-sample.ts --force
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "../src/db.js";

const DB_PATH = process.env["BIS_DB_PATH"] ?? "data/bis.db";
const force = process.argv.includes("--force");

const dir = dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
if (force && existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
  console.log(`Deleted ${DB_PATH}`);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(SCHEMA_SQL);
console.log(`Database initialised at ${DB_PATH}`);

// --- Standard Categories (frameworks table) ------------------------------------

interface FrameworkRow {
  id: string;
  name: string;
  version: string;
  domain: string;
  description: string;
  control_count: number;
  effective_date: string;
  pdf_url: string;
}

const frameworks: FrameworkRow[] = [
  {
    id: "bis-data-privacy",
    name: "BIS Data Privacy Standards",
    version: "Current catalog",
    domain: "Data Privacy Standards",
    description:
      "BIS IS standards addressing personal data protection, privacy information management, " +
      "and related requirements for Indian organizations. Includes IS 16700 (Data Privacy) and " +
      "IS/ISO/IEC 27701 (Privacy Information Management System). " +
      "Full text requires BIS subscription at services.bis.gov.in.",
    control_count: 8,
    effective_date: "2018-01-01",
    pdf_url: "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/",
  },
  {
    id: "bis-infosec",
    name: "BIS Information Security Standards",
    version: "Current catalog",
    domain: "Information Security Standards",
    description:
      "BIS IS standards for information security management, controls, and assurance. " +
      "Includes national adoptions of ISO/IEC 27001, 27002, 27005, 27017, 27018, and related series. " +
      "These are identical or technically equivalent adoptions of ISO/IEC standards. " +
      "Full text requires BIS subscription at services.bis.gov.in.",
    control_count: 14,
    effective_date: "2014-01-01",
    pdf_url: "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/",
  },
  {
    id: "bis-it-governance",
    name: "BIS IT Governance Standards",
    version: "Current catalog",
    domain: "IT Governance Standards",
    description:
      "BIS IS standards for IT service management, IT governance, and related frameworks. " +
      "Includes national adoptions of ISO/IEC 20000, ISO/IEC 38500, and IT Act Section 43A " +
      "Reasonable Security Practices and Procedures Rules 2011. " +
      "Full text requires BIS subscription at services.bis.gov.in.",
    control_count: 7,
    effective_date: "2011-01-01",
    pdf_url: "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/",
  },
];

const insertFramework = db.prepare(
  "INSERT OR IGNORE INTO frameworks (id, name, version, domain, description, control_count, effective_date, pdf_url) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const f of frameworks) {
  insertFramework.run(
    f.id, f.name, f.version, f.domain, f.description, f.control_count, f.effective_date, f.pdf_url,
  );
}
console.log(`Inserted ${frameworks.length} standard categories`);

// --- IS Standards (controls table) --------------------------------------------
// Each entry represents one IS standard. Description contains metadata
// (IS number, TC, ICS code, status, ISO equivalent, BIS product code)
// but NOT the full standard text, which is paid/licensed content.

interface ControlRow {
  framework_id: string;
  control_ref: string;
  domain: string;
  subdomain: string;
  title: string;
  description: string;
  maturity_level: string;  // Used for: adoption year
  priority: string;        // Used for: TC (technical committee)
}

const controls: ControlRow[] = [
  // --- Data Privacy Standards ---
  {
    framework_id: "bis-data-privacy",
    control_ref: "IS-16700",
    domain: "Data Privacy Standards",
    subdomain: "Personal Data Protection",
    title: "IS 16700:2018 — Data Privacy",
    description:
      "IS 16700:2018 provides a framework for personal data protection in India. " +
      "Scope: Guidelines for organizations collecting, processing, storing, and sharing personal data. " +
      "TC: LITD 17 (Information Technology). ICS: 35.040. Status: Current. " +
      "ISO equivalent: None (India-specific standard). BIS product code: IS 16700. " +
      "This standard predates the Digital Personal Data Protection Act 2023 and covers " +
      "principles of data minimization, purpose limitation, consent, and data subject rights. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2018",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-data-privacy",
    control_ref: "IS-ISO-IEC-27701",
    domain: "Data Privacy Standards",
    subdomain: "Privacy Information Management",
    title: "IS/ISO/IEC 27701:2022 — Privacy Information Management System (PIMS)",
    description:
      "IS/ISO/IEC 27701:2022 is the BIS national adoption of ISO/IEC 27701:2019. " +
      "Scope: Extension to ISO/IEC 27001 and 27002 for privacy information management. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27701:2019 (technically equivalent). BIS product code: IS/ISO/IEC 27701. " +
      "Specifies requirements and guidance for establishing, implementing, and maintaining a PIMS " +
      "as an extension of ISO 27001, covering PII controllers and processors. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2022",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-data-privacy",
    control_ref: "IS-ISO-IEC-29100",
    domain: "Data Privacy Standards",
    subdomain: "Privacy Framework",
    title: "IS/ISO/IEC 29100:2022 — Privacy Framework",
    description:
      "IS/ISO/IEC 29100:2022 is the BIS national adoption of ISO/IEC 29100:2011+AMD1:2018. " +
      "Scope: High-level framework for the protection of personally identifiable information (PII). " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 29100:2011 (technically equivalent). BIS product code: IS/ISO/IEC 29100. " +
      "Defines privacy terminology, actors, roles, and safeguarding requirements for PII in ICT systems. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2022",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-data-privacy",
    control_ref: "IS-ISO-IEC-29134",
    domain: "Data Privacy Standards",
    subdomain: "Privacy Impact Assessment",
    title: "IS/ISO/IEC 29134:2023 — Privacy Impact Assessment Guidelines",
    description:
      "IS/ISO/IEC 29134:2023 is the BIS national adoption of ISO/IEC 29134:2017. " +
      "Scope: Guidelines and process for privacy impact assessment (PIA). " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 29134:2017 (technically equivalent). BIS product code: IS/ISO/IEC 29134. " +
      "Provides methodology for identifying and treating privacy risks in information systems, " +
      "products and services, and in processes involving PII. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2023",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-data-privacy",
    control_ref: "IS-ISO-IEC-29151",
    domain: "Data Privacy Standards",
    subdomain: "PII Protection",
    title: "IS/ISO/IEC 29151:2021 — Code of Practice for PII Protection",
    description:
      "IS/ISO/IEC 29151:2021 is the BIS national adoption of ISO/IEC 29151:2017. " +
      "Scope: Code of practice for protection of personally identifiable information. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 29151:2017 (technically equivalent). BIS product code: IS/ISO/IEC 29151. " +
      "Establishes control objectives, controls, and guidelines for implementing PII protection in " +
      "information security management systems. Supplements IS/ISO/IEC 27002. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2021",
    priority: "LITD 17",
  },

  // --- Information Security Standards ---
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27001",
    domain: "Information Security Standards",
    subdomain: "ISMS",
    title: "IS/ISO/IEC 27001:2023 — Information Security Management Systems",
    description:
      "IS/ISO/IEC 27001:2023 is the BIS national adoption of ISO/IEC 27001:2022. " +
      "Scope: Requirements for establishing, implementing, maintaining, and continually improving an ISMS. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27001:2022 (technically equivalent). BIS product code: IS/ISO/IEC 27001. " +
      "This is the primary information security management standard for India. Organizations seeking " +
      "compliance with IT Act Section 43A Reasonable Security Practices Rules typically reference ISO 27001. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2023",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27002",
    domain: "Information Security Standards",
    subdomain: "Security Controls",
    title: "IS/ISO/IEC 27002:2022 — Information Security Controls",
    description:
      "IS/ISO/IEC 27002:2022 is the BIS national adoption of ISO/IEC 27002:2022. " +
      "Scope: Reference set of information security controls including implementation guidance. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27002:2022 (technically equivalent). BIS product code: IS/ISO/IEC 27002. " +
      "Provides 93 controls across 4 themes: Organizational, People, Physical, and Technological. " +
      "Companion to IS/ISO/IEC 27001 — provides implementation guidance for Annex A controls. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2022",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27005",
    domain: "Information Security Standards",
    subdomain: "Risk Management",
    title: "IS/ISO/IEC 27005:2022 — Information Security Risk Management",
    description:
      "IS/ISO/IEC 27005:2022 is the BIS national adoption of ISO/IEC 27005:2022. " +
      "Scope: Guidelines for information security risk management to support ISO 27001 implementation. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27005:2022 (technically equivalent). BIS product code: IS/ISO/IEC 27005. " +
      "Provides guidance on risk identification, analysis, evaluation, treatment, and monitoring processes. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2022",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27017",
    domain: "Information Security Standards",
    subdomain: "Cloud Security",
    title: "IS/ISO/IEC 27017:2016 — Security Controls for Cloud Services",
    description:
      "IS/ISO/IEC 27017:2016 is the BIS national adoption of ISO/IEC 27017:2015. " +
      "Scope: Code of practice for information security controls for cloud computing services. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27017:2015 (technically equivalent). BIS product code: IS/ISO/IEC 27017. " +
      "Provides cloud-specific controls and implementation guidance for cloud service providers and customers. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2016",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27018",
    domain: "Information Security Standards",
    subdomain: "Cloud PII",
    title: "IS/ISO/IEC 27018:2020 — Protection of PII in Public Clouds",
    description:
      "IS/ISO/IEC 27018:2020 is the BIS national adoption of ISO/IEC 27018:2019. " +
      "Scope: Code of practice for protection of PII acting as PII processor in public cloud services. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27018:2019 (technically equivalent). BIS product code: IS/ISO/IEC 27018. " +
      "Specifies controls for cloud PII processors to protect personal data in public cloud environments. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2020",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27032",
    domain: "Information Security Standards",
    subdomain: "Cybersecurity",
    title: "IS/ISO/IEC 27032:2023 — Cybersecurity Guidelines",
    description:
      "IS/ISO/IEC 27032:2023 is the BIS national adoption of ISO/IEC 27032:2023. " +
      "Scope: Guidelines for cybersecurity, addressing gaps between network, internet, information, " +
      "and ICT security. TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27032:2023 (technically equivalent). BIS product code: IS/ISO/IEC 27032. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2023",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27035-1",
    domain: "Information Security Standards",
    subdomain: "Incident Management",
    title: "IS/ISO/IEC 27035-1:2023 — Incident Management Principles",
    description:
      "IS/ISO/IEC 27035-1:2023 is the BIS national adoption of ISO/IEC 27035-1:2023. " +
      "Scope: Principles and process for information security incident management. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27035-1:2023 (technically equivalent). BIS product code: IS/ISO/IEC 27035-1. " +
      "Part 1 of a multi-part standard covering the information security incident management lifecycle. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2023",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27037",
    domain: "Information Security Standards",
    subdomain: "Digital Evidence",
    title: "IS/ISO/IEC 27037:2014 — Digital Evidence Guidelines",
    description:
      "IS/ISO/IEC 27037:2014 is the BIS national adoption of ISO/IEC 27037:2012. " +
      "Scope: Guidelines for identification, collection, acquisition, and preservation of digital evidence. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27037:2012 (technically equivalent). BIS product code: IS/ISO/IEC 27037. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2014",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27040",
    domain: "Information Security Standards",
    subdomain: "Storage Security",
    title: "IS/ISO/IEC 27040:2015 — Storage Security",
    description:
      "IS/ISO/IEC 27040:2015 is the BIS national adoption of ISO/IEC 27040:2015. " +
      "Scope: Guidelines and controls for securing data storage systems and ecosystems. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27040:2015 (technically equivalent). BIS product code: IS/ISO/IEC 27040. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2015",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-infosec",
    control_ref: "IS-ISO-IEC-27043",
    domain: "Information Security Standards",
    subdomain: "Incident Investigation",
    title: "IS/ISO/IEC 27043:2015 — Incident Investigation Principles",
    description:
      "IS/ISO/IEC 27043:2015 is the BIS national adoption of ISO/IEC 27043:2015. " +
      "Scope: Guidelines for incident investigation processes across IT and OT environments. " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 27043:2015 (technically equivalent). BIS product code: IS/ISO/IEC 27043. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2015",
    priority: "LITD 17",
  },

  // --- IT Governance Standards ---
  {
    framework_id: "bis-it-governance",
    control_ref: "IS-ISO-IEC-20000-1",
    domain: "IT Governance Standards",
    subdomain: "IT Service Management",
    title: "IS/ISO/IEC 20000-1:2019 — IT Service Management System",
    description:
      "IS/ISO/IEC 20000-1:2019 is the BIS national adoption of ISO/IEC 20000-1:2018. " +
      "Scope: Requirements for an IT service management system (SMS). " +
      "TC: LITD 17 (Information Technology). ICS: 35.020. Status: Current. " +
      "ISO equivalent: ISO/IEC 20000-1:2018 (technically equivalent). BIS product code: IS/ISO/IEC 20000-1. " +
      "Specifies requirements for organizations to deliver managed services to internal and external customers. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2019",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-it-governance",
    control_ref: "IS-ISO-IEC-38500",
    domain: "IT Governance Standards",
    subdomain: "Corporate IT Governance",
    title: "IS/ISO/IEC 38500:2016 — Corporate Governance of IT",
    description:
      "IS/ISO/IEC 38500:2016 is the BIS national adoption of ISO/IEC 38500:2015. " +
      "Scope: Principles and model for governing the use of IT in organizations. " +
      "TC: LITD 17 (Information Technology). ICS: 35.020. Status: Current. " +
      "ISO equivalent: ISO/IEC 38500:2015 (technically equivalent). BIS product code: IS/ISO/IEC 38500. " +
      "Provides guiding principles for directors and senior management responsible for IT governance. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2016",
    priority: "LITD 17",
  },
  {
    framework_id: "bis-it-governance",
    control_ref: "IS-ISO-IEC-15408-1",
    domain: "IT Governance Standards",
    subdomain: "IT Security Evaluation",
    title: "IS/ISO/IEC 15408-1:2022 — Common Criteria (Evaluation Criteria for IT Security)",
    description:
      "IS/ISO/IEC 15408-1:2022 is the BIS national adoption of ISO/IEC 15408-1:2022. " +
      "Scope: Introduction and general model for evaluation criteria for IT security (Common Criteria). " +
      "TC: LITD 17 (Information Technology). ICS: 35.030. Status: Current. " +
      "ISO equivalent: ISO/IEC 15408-1:2022 (technically equivalent). BIS product code: IS/ISO/IEC 15408-1. " +
      "Referenced by Indian government IT product procurement for security evaluation requirements. " +
      "FULL TEXT IS PAID CONTENT — available via BIS subscription at services.bis.gov.in.",
    maturity_level: "2022",
    priority: "LITD 17",
  },
];

const insertControl = db.prepare(
  "INSERT OR IGNORE INTO controls " +
    "(framework_id, control_ref, domain, subdomain, title, description, maturity_level, priority) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const c of controls) {
  insertControl.run(
    c.framework_id, c.control_ref, c.domain, c.subdomain, c.title,
    c.description, c.maturity_level, c.priority,
  );
}
console.log(`Inserted ${controls.length} IS standards`);

// --- IT Act Rules and BIS Notifications (circulars table) ---------------------

interface CircularRow {
  reference: string;
  title: string;
  date: string;
  category: string;
  summary: string;
  full_text: string;
  pdf_url: string;
  status: string;
}

const circulars: CircularRow[] = [
  {
    reference: "IT-ACT-43A-RSP-2011",
    title: "IT Act Section 43A — Reasonable Security Practices and Procedures Rules 2011",
    date: "2011-04-11",
    category: "IT Act Rules",
    summary:
      "Rules under Section 43A of the Information Technology Act 2000 prescribing reasonable " +
      "security practices and procedures for body corporates handling sensitive personal data. " +
      "ISO/IEC 27001 is one of the prescribed frameworks for compliance.",
    full_text:
      "Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011. " +
      "Issued under Section 43A of the Information Technology Act, 2000. Notified: 11 April 2011. " +
      "Scope: Applicable to body corporates (companies and firms) in India that possess, deal with, or handle " +
      "sensitive personal data or information (SPDI). " +
      "Definition of SPDI: Passwords; financial information (bank account, credit/debit card details); " +
      "physical, physiological, and mental health conditions; sexual orientation; medical records; biometric information. " +
      "Reasonable Security Practices: Body corporates must implement reasonable security practices. " +
      "The Rules prescribe ISO/IEC 27001 as one of the standards for compliance. " +
      "Organizations may also comply with any other security standard approved by the Central Government. " +
      "Body corporates certified under IS/ISO/IEC 27001 are deemed compliant with the reasonable security practices requirement. " +
      "Privacy Policy: Body corporates must publish a privacy policy covering: type of information collected; " +
      "purpose of collection and usage; disclosure practices; reasonable security practices. " +
      "Consent: Information must be collected with knowledge and consent of the information provider. " +
      "Disclosure to Third Parties: SPDI may be disclosed to third parties only with prior permission, " +
      "unless required by law or under a contract. " +
      "Grievance Officer: A Grievance Officer must be designated to address information provider complaints within one month. " +
      "Transfer of SPDI: Transfer to a third party or located in any other country is permitted if the transferee " +
      "ensures the same level of data protection and the transfer is necessary for performance of a lawful contract.",
    pdf_url: "https://meity.gov.in/writereaddata/files/GSR313E_10511(1).pdf",
    status: "active",
  },
  {
    reference: "IT-ACT-CERT-IN-DIRECTION-2022",
    title: "CERT-In Directions on Cyber Incident Reporting — April 2022",
    date: "2022-04-28",
    category: "Cyber Incident Reporting",
    summary:
      "CERT-In directions under Section 70B of the IT Act requiring service providers, intermediaries, " +
      "data centres, government organisations, and body corporates to report cyber incidents within 6 hours " +
      "and maintain logs for 180 days.",
    full_text:
      "Indian Computer Emergency Response Team (CERT-In) Directions under Section 70B(6) of the " +
      "Information Technology Act, 2000. Issued: 28 April 2022. Effective: 28 June 2022. " +
      "Entities Covered: All service providers, intermediaries, data centres, body corporates, and government entities. " +
      "Mandatory Incident Reporting: The following incidents must be reported to CERT-In within 6 hours of detection: " +
      "Compromise of critical systems; data breaches and leakage; attacks on critical infrastructure; " +
      "DDoS attacks; malware attacks; ransomware; phishing/social engineering; identity theft; " +
      "attacks on Internet of Things (IoT) devices; attacks on critical sectors. " +
      "Log Retention: ICT system logs must be maintained securely within India for a rolling period of 180 days. " +
      "Logs must be provided to CERT-In on demand. " +
      "Time Synchronization: ICT systems must synchronize their clocks with the NIC or STQC NTP server. " +
      "Virtual Asset Service Providers: Exchanges and custodian wallet providers must maintain KYC records " +
      "and financial transaction records for 5 years. " +
      "VPN Providers: VPN service providers must maintain subscriber names, email addresses, IP addresses, " +
      "and usage patterns for 5 years. " +
      "Non-compliance: May attract penalties under Section 70B of the IT Act.",
    pdf_url: "https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf",
    status: "active",
  },
  {
    reference: "BIS-NOTIFICATION-IS16700-2018",
    title: "BIS Notification — IS 16700:2018 Data Privacy Standard Published",
    date: "2018-07-01",
    category: "BIS Standard Publication",
    summary:
      "BIS formal notification of the publication of IS 16700:2018, India's national standard " +
      "for data privacy. Covers scope, TC authorship (LITD 17), and availability for purchase.",
    full_text:
      "Bureau of Indian Standards notification of IS 16700:2018. " +
      "Standard Title: Data Privacy. IS Number: IS 16700. Year of Publication: 2018. " +
      "Technical Committee: LITD 17 (Information Technology, Software and Services). " +
      "ICS Code: 35.040. " +
      "Scope: This standard specifies a comprehensive framework for data privacy applicable to organizations " +
      "in India that collect, process, store, and share personal data. It addresses principles of data " +
      "protection including data minimization, purpose limitation, consent management, data subject rights, " +
      "and accountability. The standard draws on international privacy frameworks while incorporating " +
      "India-specific legal and regulatory context. " +
      "Availability: Standard is available for purchase from BIS sales offices and online at " +
      "services.bis.gov.in. Full text is paid/licensed content. " +
      "Relationship to IT Act: The standard complements the IT (Reasonable Security Practices) Rules 2011 " +
      "and may be referenced alongside ISO/IEC 27001 for comprehensive data protection compliance. " +
      "Revision Status: Under review to align with Digital Personal Data Protection Act 2023.",
    pdf_url: "https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/standard_review/",
    status: "active",
  },
  {
    reference: "MEITY-DPDPA-2023-FRAMEWORK",
    title: "Digital Personal Data Protection Act 2023 — IT Act Interface",
    date: "2023-08-11",
    category: "Data Protection Law",
    summary:
      "The Digital Personal Data Protection Act 2023 (DPDPA) supersedes and replaces IT Act Section 43A " +
      "for personal data protection. IS 16700 and IS/ISO/IEC 27701 are relevant standards for DPDPA compliance.",
    full_text:
      "The Digital Personal Data Protection Act, 2023 (Act No. 22 of 2023). " +
      "Royal Assent: 11 August 2023. Published in the Gazette of India. " +
      "Scope: Applies to processing of digital personal data within India, and processing outside India " +
      "if it involves offering goods or services to data principals in India. " +
      "Relationship to IT Act Section 43A: The DPDPA supersedes Section 43A and the IT (SPDI) Rules 2011 " +
      "for personal data protection. Section 43A and the SPDI Rules remain in force until formally repealed. " +
      "Key Obligations for Data Fiduciaries: " +
      "Purpose limitation — personal data may be processed only for a specified, clear, and lawful purpose. " +
      "Consent — must be free, specific, informed, unconditional, and unambiguous. " +
      "Data minimisation — personal data collected must not exceed what is necessary. " +
      "Data accuracy — reasonable efforts to maintain accuracy. " +
      "Storage limitation — personal data to be erased upon withdrawal of consent or fulfilment of purpose. " +
      "Security safeguards — reasonable security practices to prevent data breach. " +
      "Relevant BIS Standards for Compliance: " +
      "IS/ISO/IEC 27001 — ISMS requirements; IS/ISO/IEC 27701 — privacy information management; " +
      "IS/ISO/IEC 27005 — information security risk management; IS 16700 — data privacy framework. " +
      "Data Protection Board of India: Established under the Act to adjudicate complaints and impose penalties. " +
      "Penalties: Up to INR 250 crore per breach instance depending on category.",
    pdf_url: "https://meity.gov.in/writereaddata/files/Digital%20Personal%20Data%20Protection%20Act%202023.pdf",
    status: "active",
  },
  {
    reference: "IT-ACT-INTERMEDIARY-GUIDELINES-2021",
    title: "IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021",
    date: "2021-02-25",
    category: "IT Act Rules",
    summary:
      "Rules under the IT Act prescribing due diligence obligations for intermediaries, including " +
      "information security practices, grievance redressal, and content moderation. Significant " +
      "intermediaries must appoint a Chief Compliance Officer, Nodal Contact, and Grievance Officer.",
    full_text:
      "Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021. " +
      "Issued under Sections 69A, 79, and 87 of the Information Technology Act, 2000. Notified: 25 February 2021. " +
      "Due Diligence Obligations for All Intermediaries: " +
      "Publish privacy policy and user agreement covering prohibited content and user obligations. " +
      "Designate a Grievance Officer (Indian resident) to receive and acknowledge complaints within 24 hours " +
      "and resolve within 15 days. " +
      "Remove or disable access to unlawful content within 36 hours of government or court order. " +
      "Retain records of users for at least 180 days even after account termination. " +
      "Additional Obligations for Significant Social Media Intermediaries (SSMIs) (>5 million registered users): " +
      "Appoint Chief Compliance Officer (CCO) responsible for ensuring compliance. " +
      "Appoint Nodal Contact Person for 24x7 coordination with law enforcement. " +
      "Appoint Resident Grievance Officer in India. " +
      "Publish monthly compliance reports. " +
      "Enable traceability of message originator on court order. " +
      "Proactively deploy automated tools for detecting child sexual abuse material. " +
      "Information Security Relevance: " +
      "Rules require intermediaries to implement information security best practices. " +
      "Relevant standards: IS/ISO/IEC 27001 for ISMS; IS/ISO/IEC 27035 for incident management; " +
      "IS 16700 and DPDPA 2023 for personal data protection.",
    pdf_url: "https://meity.gov.in/writereaddata/files/Intermediary_Guidelines_and_Digital_Media_Ethics_Code_Rules-2021.pdf",
    status: "active",
  },
  {
    reference: "RBI-CYBERSECURITY-FRAMEWORK-NBFC-2022",
    title: "RBI Master Direction on IT Governance and Cybersecurity for NBFCs 2022",
    date: "2022-11-03",
    category: "Financial Sector Cybersecurity",
    summary:
      "RBI Master Direction prescribing IT governance, cybersecurity framework, and business continuity " +
      "requirements for non-banking financial companies. References IS/ISO/IEC 27001 as a recommended standard.",
    full_text:
      "Reserve Bank of India — Master Direction on Information Technology Governance, Risk, Controls and " +
      "Assurance Practices for Non-Banking Financial Companies (NBFCs). Issued: 3 November 2022. " +
      "Applicability: Upper Layer and Middle Layer NBFCs as classified by RBI. " +
      "IT Governance Requirements: " +
      "Board-approved IT strategy aligned with business strategy. " +
      "IT Steering Committee at senior management level. " +
      "Chief Information Security Officer (CISO) independent of IT operations. " +
      "Cybersecurity Framework: " +
      "NBFCs must implement a cybersecurity framework based on internationally recognized standards. " +
      "IS/ISO/IEC 27001 is specifically referenced as the recommended framework for ISMS. " +
      "Annual cybersecurity risk assessment required. " +
      "Incident response plan with CERT-In reporting obligations. " +
      "Penetration testing of internet-facing applications annually. " +
      "Vendor Risk Management: " +
      "Third-party service provider risk assessment mandatory. " +
      "Cloud outsourcing requires RBI prior approval for critical data. " +
      "Business Continuity: " +
      "Business Continuity Plan (BCP) with defined RTO and RPO. " +
      "DR drill at least annually. " +
      "Relevant BIS Standards: IS/ISO/IEC 27001, IS/ISO/IEC 27002, IS/ISO/IEC 27005, IS/ISO/IEC 27035.",
    pdf_url: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12293",
    status: "active",
  },
  {
    reference: "SEBI-CYBERSECURITY-CIRCULAR-2023",
    title: "SEBI Circular on Cybersecurity and Cyber Resilience Framework 2023",
    date: "2023-06-27",
    category: "Financial Sector Cybersecurity",
    summary:
      "SEBI circular prescribing cybersecurity and cyber resilience framework for market infrastructure " +
      "institutions and regulated entities. Mandates IS/ISO/IEC 27001 certification for critical entities.",
    full_text:
      "Securities and Exchange Board of India (SEBI) Circular on Cybersecurity and Cyber Resilience Framework " +
      "for SEBI Regulated Entities. Reference: SEBI/HO/ITD-1/ITD_CSC_EXT/P/CIR/2023/006. Issued: 27 June 2023. " +
      "Applicability: Stock exchanges, depositories, clearing corporations, brokers, investment advisers, " +
      "and other SEBI-regulated entities (tiered requirements based on size). " +
      "IS/ISO/IEC 27001 Certification: " +
      "Category A entities (market infrastructure institutions): Must obtain IS/ISO/IEC 27001 certification. " +
      "Category B entities (large intermediaries): IS/ISO/IEC 27001 certification or equivalent strongly recommended. " +
      "Certification scope must cover critical IT systems. " +
      "Cybersecurity Framework Requirements: " +
      "Inventory of critical IT assets. " +
      "Vulnerability assessment and penetration testing: quarterly for internet-facing systems, annually for internal. " +
      "Security Operations Centre (SOC) for Category A entities. " +
      "CERT-In empanelled auditor for cybersecurity audits. " +
      "Incident Reporting: " +
      "Cyber incidents to be reported to SEBI within 6 hours of detection. " +
      "Concurrent reporting to CERT-In as required by CERT-In Directions 2022. " +
      "Data Localization: Critical data of Indian securities market participants must be stored within India. " +
      "Relevant BIS Standards: IS/ISO/IEC 27001 (mandatory for Category A); IS/ISO/IEC 27002; " +
      "IS/ISO/IEC 27005; IS/ISO/IEC 27035; IS/ISO/IEC 27701.",
    pdf_url: "https://www.sebi.gov.in/legal/circulars/jun-2023/cybersecurity-and-cyber-resilience-framework_72032.html",
    status: "active",
  },
  {
    reference: "BIS-PRODUCT-CERTIFICATION-IT-SCHEME",
    title: "BIS Mandatory Product Certification for IT and Electronic Products",
    date: "2021-09-01",
    category: "BIS Product Certification",
    summary:
      "BIS compulsory registration and certification scheme for IT products including laptops, tablets, " +
      "servers, and storage equipment sold in India. Ensures products meet relevant IS quality and safety standards.",
    full_text:
      "BIS Compulsory Registration Scheme (CRS) and Bureau of Indian Standards (Conformity Assessment) " +
      "Regulations 2018 — IT and Electronics Products. " +
      "Regulatory Basis: Electronics and Information Technology Goods (Requirements for Compulsory Registration) " +
      "Order, 2012 (amended 2021). Administered by: Ministry of Electronics and Information Technology (MeitY) " +
      "through BIS. " +
      "Covered Products (IT/Electronics): " +
      "Laptops, notebooks, tablets, mobile phones, printers, scanners, servers, storage products, " +
      "set-top boxes, LED lights, power adapters, and similar IT/electronic products. " +
      "Requirements: " +
      "Products must be tested by BIS-recognized laboratories. " +
      "Products must meet applicable IS standards for safety (IS 13252 series) and electromagnetic compatibility. " +
      "BIS Registration (R-number) must be displayed on the product and packaging. " +
      "Imported products must obtain registration before import. " +
      "Cybersecurity Relevance: " +
      "BIS is developing cybersecurity standards for IoT devices and smart products under CRS. " +
      "Proposed requirements include minimum security baseline for connected devices. " +
      "Relevant TC: LITD 17 (Information Technology); LITD 28 (IoT). " +
      "Relevant Standards: IS/ISO/IEC 27001 for ISMS of certification bodies; BIS IoT security standards under development.",
    pdf_url: "https://www.bis.gov.in/index.php/home/product-certification",
    status: "active",
  },
];

const insertCircular = db.prepare(
  "INSERT OR IGNORE INTO circulars (reference, title, date, category, summary, full_text, pdf_url, status) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const c of circulars) {
  insertCircular.run(
    c.reference, c.title, c.date, c.category, c.summary, c.full_text, c.pdf_url, c.status,
  );
}
console.log(`Inserted ${circulars.length} IT Act rules and notifications`);

// --- Summary ------------------------------------------------------------------

const fc = (db.prepare("SELECT COUNT(*) AS n FROM frameworks").get() as { n: number }).n;
const cc = (db.prepare("SELECT COUNT(*) AS n FROM controls").get() as { n: number }).n;
const circ = (db.prepare("SELECT COUNT(*) AS n FROM circulars").get() as { n: number }).n;

console.log(`
Database summary:
  Categories (frameworks) : ${fc}
  IS Standards (controls) : ${cc}
  IT Act rules / notifs   : ${circ}

Seed complete.`);
