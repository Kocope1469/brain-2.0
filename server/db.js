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

CREATE TABLE IF NOT EXISTS settings (
  sleutel    TEXT PRIMARY KEY,
  waarde     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
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
  locatie_bron  TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  functie     TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS settings (
  sleutel    TEXT PRIMARY KEY,
  waarde     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
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
  locatie_bron  TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  functie     TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
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

/**
 * Aanpassingen aan tabellen die al bestaan. CREATE TABLE IF NOT EXISTS voegt geen
 * kolommen toe aan een database die er al staat, dus die gaan hier apart. Elke regel
 * moet je zonder gevaar opnieuw kunnen draaien: bestaat de kolom al, dan geeft de
 * database een fout die we negeren.
 */
const MIGRATIES = [
  "ALTER TABLE customers ADD COLUMN locatie_bron TEXT NOT NULL DEFAULT ''",
];

const INDEXEN = [
  'CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city)',
  'CREATE INDEX IF NOT EXISTS idx_customers_ext ON customers(external_id)',
  'CREATE INDEX IF NOT EXISTS idx_customers_vat ON customers(vat_number)',
  'CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id, visit_date DESC)',
  'CREATE INDEX IF NOT EXISTS idx_contacts_customer ON contacts(customer_id)',
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
/**
 * Namen waaronder een Postgres-adres kan binnenkomen, op volgorde. Vercel zet bij
 * een Neon-koppeling niet altijd DATABASE_URL maar soms alleen POSTGRES_URL; door
 * die allemaal te aanvaarden kan de app niet per ongeluk terugvallen op een
 * tijdelijke SQLite-schijf waar je data bij elke aanvraag verdwijnt.
 */
const URL_NAMEN = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING',
  'POSTGRES_PRISMA_URL', 'NEON_DATABASE_URL', 'STORAGE_URL'];

/** Ziet een waarde eruit als een Postgres-adres? */
const isPostgresAdres = (waarde) => /^postgres(ql)?:\/\/\S+$/i.test(String(waarde ?? '').trim());

/**
 * Zoekt het adres van de database. Eerst de namen die we kennen, in vaste volgorde.
 * Vindt hij die niet, dan kijkt hij of er érgens in de omgeving een Postgres-adres
 * staat — hostingplatforms laten je vaak zelf een voorvoegsel kiezen, en dan heet de
 * variabele bijvoorbeeld MIJNDB_URL. Liever die vinden dan de app laten falen op een
 * naam.
 *
 * @returns {{url: string, naam: string} | null}
 */
export function vindDatabaseUrl(omgeving = process.env) {
  for (const naam of URL_NAMEN) {
    const waarde = String(omgeving[naam] ?? '').trim();
    if (waarde) return { url: waarde, naam };
  }

  // laatste redmiddel: elke variabele met een Postgres-adres, alfabetisch zodat de
  // keuze voorspelbaar blijft als er meerdere staan. Wat expliciet voor tests of
  // scripts bedoeld is, blijft buiten beschouwing — dat mag nooit stilletjes je
  // echte database worden.
  const overige = Object.keys(omgeving).sort()
    .filter((naam) => !/^(TEST|CI|EXAMPLE|SAMPLE|DUMMY|SHADOW|MIGRATE)[_A-Z]*$|_TEST_/i.test(naam))
    .filter((naam) => isPostgresAdres(omgeving[naam]));
  if (overige.length) {
    // een niet-gepoolde verbinding is de mindere keuze wanneer er ook een gewone is
    const voorkeur = overige.find((n) => !/UNPOOLED|NON_POOLING|DIRECT/i.test(n)) ?? overige[0];
    return { url: String(omgeving[voorkeur]).trim(), naam: voorkeur };
  }
  return null;
}

/** Waar de gegevens terechtkomen, in één zin. Wordt bij het opstarten gelogd. */
export function beschrijfOpslag(omgeving = process.env) {
  const gevonden = vindDatabaseUrl(omgeving);
  if (gevonden) {
    const host = (() => {
      try { return new URL(gevonden.url).host; } catch { return 'onbekende host'; }
    })();
    return `Postgres op ${host} (via ${gevonden.naam})`;
  }
  const pad = omgeving.KLANTENKAART_DB || join(ROOT, 'data', 'klantenkaart.db');
  const vluchtig = !!(omgeving.VERCEL || omgeving.AWS_LAMBDA_FUNCTION_NAME);
  return vluchtig
    ? `⚠ GEEN DATABASE INGESTELD — de gegevens gaan naar een tijdelijk bestand (${pad}) `
      + `en zijn bij de volgende aanvraag weg. Zet ${URL_NAMEN[0]} in de instellingen van je hosting.`
    : `SQLite-bestand ${pad}`;
}

/** Draaien we op een platform met een tijdelijke, niet-schrijfbare schijf? */
export const isServerless = (omgeving = process.env) =>
  !!(omgeving.VERCEL || omgeving.AWS_LAMBDA_FUNCTION_NAME || omgeving.NETLIFY);

/**
 * Opent de database. Een uitdrukkelijk meegegeven `file` wint altijd van wat er in
 * de omgeving staat: wie om een bestand vraagt, wil geen Postgres.
 */
export async function openDb({ url, file } = {}) {
  // pas hier bepalen: in de parameterlijst bestaat `file` nog niet
  url ??= file ? undefined : vindDatabaseUrl()?.url;
  // zonder database op een serverless platform is er geen zinnige uitweg: de schijf
  // is niet schrijfbaar, en wél schrijven zou betekenen dat alles stil verdwijnt
  if (!url && !file && isServerless()) {
    throw new Error(
      'Geen database ingesteld. Koppel een Postgres-database (Storage → Create Database → Neon) '
      + `en zet het adres onder een van deze namen: ${URL_NAMEN.join(', ')}. `
      + 'Deploy daarna opnieuw.',
    );
  }
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
  for (const migratie of MIGRATIES) {
    try {
      await db.exec(migratie);
    } catch (err) {
      // "duplicate column" betekent gewoon dat de aanpassing er al is
      if (!/duplicate|already exists|bestaat al/i.test(err.message)) throw err;
    }
  }
  for (const index of INDEXEN) await db.exec(index);
  return db;
}

/** ISO-tijdstempel; in beide databases bewaren we tijd als tekst. */
export const nu = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
