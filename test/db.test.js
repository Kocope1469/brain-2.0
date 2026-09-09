import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { vindDatabaseUrl, beschrijfOpslag, openDb, naarPostgres } from '../server/db.js';

/**
 * De duurste fout bij het online zetten is dat de app geen database vindt en
 * stilletjes op een tijdelijke schijf schrijft. Deze tests bewaken dat hij
 * elk gangbaar adres oppikt en luid klaagt als er geen is.
 */
describe('welke database wordt gebruikt', () => {
  test('DATABASE_URL heeft voorrang', () => {
    const g = vindDatabaseUrl({ DATABASE_URL: 'postgres://a', POSTGRES_URL: 'postgres://b' });
    assert.deepEqual(g, { url: 'postgres://a', naam: 'DATABASE_URL' });
  });

  test('valt terug op de namen die Vercel en Neon zetten', () => {
    for (const naam of ['POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL', 'NEON_DATABASE_URL']) {
      assert.deepEqual(vindDatabaseUrl({ [naam]: 'postgres://x' }), { url: 'postgres://x', naam }, naam);
    }
  });

  test('een lege of enkel uit spaties bestaande waarde telt niet mee', () => {
    assert.equal(vindDatabaseUrl({ DATABASE_URL: '', POSTGRES_URL: '   ' }), null);
  });

  test('zonder enig adres is er geen Postgres', () => {
    assert.equal(vindDatabaseUrl({}), null);
  });
});

describe('melding bij het opstarten', () => {
  test('noemt de host en onder welke naam hij hem vond', () => {
    const tekst = beschrijfOpslag({ POSTGRES_URL: 'postgres://u:p@ep-koel-1.eu-central-1.aws.neon.tech/db' });
    assert.match(tekst, /ep-koel-1\.eu-central-1\.aws\.neon\.tech/);
    assert.match(tekst, /POSTGRES_URL/);
  });

  test('verklapt het wachtwoord niet', () => {
    const tekst = beschrijfOpslag({ DATABASE_URL: 'postgres://gebruiker:geheim123@host/db' });
    assert.ok(!tekst.includes('geheim123'), 'een wachtwoord hoort niet in de logs');
  });

  test('waarschuwt luid als er op een hostingplatform geen database staat', () => {
    const tekst = beschrijfOpslag({ VERCEL: '1' });
    assert.match(tekst, /GEEN DATABASE INGESTELD/);
    assert.match(tekst, /DATABASE_URL/);
  });

  test('lokaal is een SQLite-bestand gewoon normaal, geen waarschuwing', () => {
    const tekst = beschrijfOpslag({ KLANTENKAART_DB: '/pad/naar/db' });
    assert.match(tekst, /SQLite-bestand \/pad\/naar\/db/);
    assert.ok(!tekst.includes('GEEN DATABASE'));
  });

  test('een onleesbaar adres laat de app niet omvallen', () => {
    assert.match(beschrijfOpslag({ DATABASE_URL: 'dit is geen url' }), /onbekende host/);
  });
});

describe('plaatshouders vertalen', () => {
  test('? wordt $1, $2, …', () => {
    assert.equal(naarPostgres('SELECT * FROM t WHERE a = ? AND b = ?'), 'SELECT * FROM t WHERE a = $1 AND b = $2');
  });
});

if (process.env.TEST_DATABASE_URL) {
  describe('openDb pikt het adres op uit de omgeving', () => {
    test('ook wanneer het onder POSTGRES_URL staat in plaats van DATABASE_URL', async () => {
      const bewaard = { ...process.env };
      delete process.env.DATABASE_URL;
      process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL;
      try {
        const db = await openDb();
        assert.equal(db.dialect, 'postgres', 'de app hoort Postgres te gebruiken, geen tijdelijke SQLite');
        await db.close();
      } finally {
        process.env = bewaard;
      }
    });
  });
}
