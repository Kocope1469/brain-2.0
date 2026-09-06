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
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  website       TEXT NOT NULL DEFAULT '',
  vat_number    TEXT NOT NULL DEFAULT '',
  street        TEXT NOT NULL DEFAULT '',
  postal_code   TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT 'BE',
  status        TEXT NOT NULL DEFAULT 'prospect',
  source        TEXT NOT NULL DEFAULT '',
  intro         TEXT NOT NULL DEFAULT '',
  archived      INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS interactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'notitie',
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL DEFAULT (date('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'offerte',
  deal_date   TEXT NOT NULL DEFAULT (date('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  due_date    TEXT NOT NULL DEFAULT (date('now')),
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_status   ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_company  ON customers(company_name);
CREATE INDEX IF NOT EXISTS idx_interactions_cust  ON interactions(customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_cust         ON deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_open         ON tasks(done, due_date);
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
