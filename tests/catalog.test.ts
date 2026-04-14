/**
 * Sanity tests for the BIS catalog database.
 *
 * These checks guard the core invariants of the metadata-only catalog:
 *   - The SQLite database exists and has rows.
 *   - Every control row is flagged availability='paid' (BIS full text is
 *     a paid/subscription product — no row should ever be marked free).
 *   - Descriptions mention the BIS subscription requirement.
 *   - No PDF artefacts have leaked into data/raw/.
 */

import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";

const DB_PATH = process.env["BIS_DB_PATH"] ?? "data/bis.db";

describe("BIS catalog database", () => {
  it("database file exists", () => {
    expect(existsSync(DB_PATH)).toBe(true);
  });

  it("has at least 50 controls (metadata only)", () => {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) AS n FROM controls").get() as { n: number };
    expect(row.n).toBeGreaterThanOrEqual(50);
    db.close();
  });

  it("every control row is availability='paid'", () => {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM controls WHERE availability != 'paid'")
      .get() as { n: number };
    expect(row.n).toBe(0);
    db.close();
  });

  it("every control description mentions the BIS subscription requirement", () => {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db
      .prepare(
        "SELECT COUNT(*) AS n FROM controls WHERE description NOT LIKE '%BIS subscription%'",
      )
      .get() as { n: number };
    expect(row.n).toBe(0);
    db.close();
  });

  it("no PDF artefacts have been committed under data/raw/", () => {
    const rawDir = "data/raw";
    if (!existsSync(rawDir)) return;
    const offenders = readdirSync(rawDir).filter((f) => /\.pdf$/i.test(f));
    expect(offenders).toEqual([]);
  });

  it("committed database uses journal_mode=delete (no -shm/-wal sidecars)", () => {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(row.journal_mode.toLowerCase()).toBe("delete");
    db.close();
  });

  it("PRAGMA integrity_check returns ok", () => {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    expect(row.integrity_check).toBe("ok");
    db.close();
  });
});
