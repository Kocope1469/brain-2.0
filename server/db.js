import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * De app draait op twee databases: SQLite als je hem lokaal start (geen installatie
 * nodig, Node 22 heeft hem ingebouwd) en Postgres wanneer DATABASE_URL gezet is,
 * zoals op Vercel. Alle queries staan één keer geschreven met ?-plaatshouders;
 * deze laag vertaalt ze.
 *
 * Bewust dialectvrij gehouden:
 * - tijdstempels worden in JavaScript gemaakt, niet met datetime('now') of now()
 * - hoofdletterongevoelig zoeken gebeurt met LOWER(), niet met ILIKE of COLLATE
 * - er staan geen booleans in het schema, alleen getallen en tekst
 */

const DDL_SQLITE = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  ip    TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id   TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  contact_name  TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  street        TEXT NOT NULL DEFAULT '',
  postal_code   TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT 'BE',
  vat_number    TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  lat           REAL,
  lon           REAL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visit_date  TEXT NOT NULL,
  with_whom   TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  author      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS customer_tags (
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);
`;

const DDL_POSTGRES = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip    TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_id   TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  contact_name  TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  street        TEXT NOT NULL DEFAULT '',
  postal_code   TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT 'BE',
  vat_number    TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  lat           DOUBLE PRECISION,
  lon           DOUBLE PRECISION,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visit_date  TEXT NOT NULL,
  with_whom   TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  author      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS customer_tags (
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);
`;

const INDEXEN = [
  'CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city)',
  'CREATE INDEX IF NOT EXISTS idx_customers_ext ON customers(external_id)',
  'CREATE INDEX IF NOT EXISTS idx_customers_vat ON customers(vat_number)',
  'CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id, visit_date DESC)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_pogingen_email ON login_attempts(email, at)',
  'CREATE INDEX IF NOT EXISTS idx_pogingen_ip ON login_attempts(ip, at)',
];

/** ?-plaatshouders omzetten naar $1, $2, … voor Postgres. */
export function naarPostgres(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

class SqliteDb {
  dialect = 'sqlite';

  constructor(db) {
    this.db = db;
  }

  async all(sql, params = []) {
    return this.db.prepare(sql).all(...params).map((r) => ({ ...r }));
  }

  async get(sql, params = []) {
    const rij = this.db.prepare(sql).get(...params);
    return rij ? { ...rij } : null;
  }

  async run(sql, params = []) {
    const res = this.db.prepare(sql).run(...params);
    return { changes: res.changes };
  }

  /** Voegt in en geeft het nieuwe id terug. */
  async insert(sql, params = []) {
    return Number(this.db.prepare(sql).run(...params).lastInsertRowid);
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  async close() {
    this.db.close();
  }
}

class PostgresDb {
  dialect = 'postgres';

  constructor(pool) {
    this.pool = pool;
  }

  async all(sql, params = []) {
    return (await this.pool.query(naarPostgres(sql), params)).rows;
  }

  async get(sql, params = []) {
    return (await this.pool.query(naarPostgres(sql), params)).rows[0] ?? null;
  }

  async run(sql, params = []) {
    return { changes: (await this.pool.query(naarPostgres(sql), params)).rowCount };
  }

  async insert(sql, params = []) {
    const res = await this.pool.query(`${naarPostgres(sql)} RETURNING id`, params);
    return Number(res.rows[0].id);
  }

  async exec(sql) {
    await this.pool.query(sql);
  }

  async close() {
    await this.pool.end();
  }
}

/**
 * Opent de database. Zonder DATABASE_URL wordt het SQLite in een bestand
 * (of ':memory:' voor tests), anders Postgres.
 */
export async function openDb({ url = process.env.DATABASE_URL, file } = {}) {
  let db;
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PGPOOL_MAX) || 3, // serverless: klein houden
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    });
    db = new PostgresDb(pool);
    await db.exec(DDL_POSTGRES);
  } else {
    const pad = file || process.env.KLANTENKAART_DB || join(ROOT, 'data', 'klantenkaart.db');
    if (pad !== ':memory:') mkdirSync(dirname(pad), { recursive: true });
    const { DatabaseSync } = await import('node:sqlite');
    db = new SqliteDb(new DatabaseSync(pad));
    await db.exec(DDL_SQLITE);
  }
  for (const index of INDEXEN) await db.exec(index);
  return db;
}

/** ISO-tijdstempel; in beide databases bewaren we tijd als tekst. */
export const nu = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
