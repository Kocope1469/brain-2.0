import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name  TEXT NOT NULL,
  contact_name  TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  website       TEXT NOT NULL DEFAULT '',
  vat_number    TEXT NOT NULL DEFAULT '',
  street        TEXT NOT NULL DEFAULT '',
  postal_code   TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT 'BE',
  source        TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS customer_tags (
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_name);
CREATE INDEX IF NOT EXISTS idx_customers_city    ON customers(city);
`;

/**
 * Opent (en initialiseert) de database.
 * @param {string} [file] pad naar het db-bestand, of ':memory:' voor tests
 */
export function openDb(file = process.env.KLANTENKAART_DB || join(ROOT, 'data', 'klantenkaart.db')) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}
