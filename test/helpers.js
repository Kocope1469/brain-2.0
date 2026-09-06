import { openDb } from '../server/db.js';
import { Store } from '../server/store.js';
import { Auth } from '../server/auth.js';
import { Pogingen } from '../server/beveiliging.js';
import { Instellingen } from '../server/instellingen.js';

/**
 * Elke test draait tegen SQLite en, als TEST_DATABASE_URL gezet is, ook tegen
 * Postgres. Dat is geen luxe: op Vercel draait de app op Postgres, en een
 * verschil tussen de twee dialecten merk je anders pas in productie.
 *
 * Testbestanden draaien parallel en zouden op Postgres elkaars tabellen leegmaken.
 * Daarom krijgt elk bestand zijn eigen schema; SQLite heeft daar geen last van,
 * want die werkt per bestand met een eigen database in het geheugen.
 */
export function dialecten(naamvanhetbestand) {
  const lijst = [{ naam: 'sqlite', opties: { file: ':memory:' } }];
  if (process.env.TEST_DATABASE_URL) {
    const schema = `test_${String(naamvanhetbestand).replace(/\W/g, '_')}`;
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    lijst.push({ naam: 'postgres', opties: { url: url.toString(), schema } });
  }
  return lijst;
}

export async function verseOmgeving({ schema, ...opties }) {
  if (schema) {
    // het schema moet bestaan voor de tabellen erin gemaakt worden
    const zonderSchema = await openDb({ url: process.env.TEST_DATABASE_URL });
    await zonderSchema.exec(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await zonderSchema.close();
  }
  const db = await openDb(opties);
  for (const tabel of ['customer_tags', 'tags', 'visits', 'customers', 'sessions', 'users', 'login_attempts', 'settings']) {
    await db.exec(`DELETE FROM ${tabel}`);
  }
  return {
    db, store: new Store(db), auth: new Auth(db),
    pogingen: new Pogingen(db), instellingen: new Instellingen(db),
  };
}

export const dagenTerug = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
