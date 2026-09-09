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

describe('geen database op een hostingplatform', () => {
  test('openDb weigert te starten in plaats van naar een tijdelijke schijf te schrijven', async () => {
    const bewaard = { ...process.env };
    for (const naam of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING',
      'POSTGRES_PRISMA_URL', 'NEON_DATABASE_URL', 'KLANTENKAART_DB']) delete process.env[naam];
    process.env.VERCEL = '1';
    try {
      await assert.rejects(() => openDb(), (err) => {
        assert.match(err.message, /Geen database ingesteld/);
        assert.match(err.message, /DATABASE_URL/);
        assert.match(err.message, /Deploy daarna opnieuw/);
        return true;
      });
    } finally {
      process.env = bewaard;
    }
  });

  test('lokaal blijft SQLite gewoon werken', async () => {
    const db = await openDb({ file: ':memory:' });
    assert.equal(db.dialect, 'sqlite');
    await db.close();
  });
});

describe('de serverless-ingang', () => {
  test('geeft nette JSON in plaats van een tekstpagina, en probeert het nadien opnieuw', async () => {
    const bewaard = { ...process.env };
    for (const naam of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING',
      'POSTGRES_PRISMA_URL', 'NEON_DATABASE_URL', 'KLANTENKAART_DB']) delete process.env[naam];
    process.env.VERCEL = '1';

    const stille = console.error;
    console.error = () => {};
    try {
      const { default: handler } = await import('../api/index.js');
      const antwoord = async () => {
        let body = '';
        const res = {
          statusCode: 0, headers: {},
          setHeader(k, v) { this.headers[k] = v; },
          end(t) { body = t; return this; },
        };
        await handler({ method: 'GET', url: '/api/klanten', headers: {} }, res);
        return { status: res.statusCode, type: res.headers['content-type'], body };
      };

      const eerste = await antwoord();
      assert.equal(eerste.status, 503);
      assert.match(eerste.type, /application\/json/);
      const gelezen = JSON.parse(eerste.body); // dit is precies wat vroeger stukliep
      assert.match(gelezen.errors[0], /Geen database ingesteld/);
      assert.ok(gelezen.hulp);

      // een tweede aanvraag mag niet blijven hangen op de mislukte eerste
      const tweede = await antwoord();
      assert.equal(tweede.status, 503);
      assert.match(JSON.parse(tweede.body).errors[0], /Geen database ingesteld/);
    } finally {
      console.error = stille;
      process.env = bewaard;
    }
  });
});

/**
 * Hostingplatforms laten je zelf een voorvoegsel kiezen voor de variabelen die ze
 * aanmaken. De app mag daar niet op vastlopen: een Postgres-adres is een
 * Postgres-adres, hoe de variabele ook heet.
 */
describe('een zelfgekozen naam voor de variabele', () => {
  const ADRES = 'postgres://gebruiker:geheim@ep-koel-1.eu-central-1.aws.neon.tech/klanten';

  test('herkent STORAGE_URL, de naam die Vercel standaard voorstelt', () => {
    assert.deepEqual(vindDatabaseUrl({ STORAGE_URL: ADRES }), { url: ADRES, naam: 'STORAGE_URL' });
  });

  test('vindt een adres ook onder een naam die we niet kennen', () => {
    const g = vindDatabaseUrl({ COMSOLTECH_KAART_URL: ADRES });
    assert.deepEqual(g, { url: ADRES, naam: 'COMSOLTECH_KAART_URL' });
  });

  test('bekende namen gaan voor op de zoektocht', () => {
    const g = vindDatabaseUrl({ ZZZ_URL: 'postgres://verkeerd/db', DATABASE_URL: ADRES });
    assert.equal(g.naam, 'DATABASE_URL');
  });

  test('kiest de gepoolde verbinding boven de directe', () => {
    const g = vindDatabaseUrl({ IETS_URL_UNPOOLED: 'postgres://direct/db', IETS_URL: ADRES });
    assert.equal(g.naam, 'IETS_URL');
  });

  test('trapt niet in variabelen die geen adres zijn', () => {
    assert.equal(vindDatabaseUrl({ PATH: '/usr/bin', NODE_ENV: 'production', HOME: '/root' }), null);
    assert.equal(vindDatabaseUrl({ IETS_URL: 'https://example.com' }), null);
    assert.equal(vindDatabaseUrl({ NOTITIE: 'gebruik postgres:// voor de database' }), null);
  });

  test('postgresql:// werkt net zo goed als postgres://', () => {
    const lang = ADRES.replace('postgres://', 'postgresql://');
    assert.equal(vindDatabaseUrl({ MIJN_DB: lang }).url, lang);
  });
});

describe('twee valkuilen die de zoektocht zelf met zich meebracht', () => {
  test('een variabele die voor tests bedoeld is wordt nooit de echte database', () => {
    for (const naam of ['TEST_DATABASE_URL', 'CI_DATABASE_URL', 'SHADOW_DATABASE_URL',
      'MIJN_TEST_URL', 'EXAMPLE_URL']) {
      assert.equal(vindDatabaseUrl({ [naam]: 'postgres://ergens/db' }), null, naam);
    }
  });

  test('een uitdrukkelijk meegegeven bestand wint van de omgeving', async () => {
    const bewaard = { ...process.env };
    process.env.DATABASE_URL = 'postgres://zou-niet-gebruikt-mogen-worden/db';
    try {
      const db = await openDb({ file: ':memory:' });
      assert.equal(db.dialect, 'sqlite', 'wie om een bestand vraagt, wil geen Postgres');
      await db.close();
    } finally {
      process.env = bewaard;
    }
  });
});

/**
 * Een bestand dat pas tijdens het draaien van schijf gelezen wordt, kan op een
 * serverless platform ontbreken. Gebeurt dat bovenaan een module, dan valt de hele
 * functie om vóór enige foutafhandeling draait en zie je een kale 500 zonder uitleg.
 * Dat is één keer gebeurd; deze tests moeten voorkomen dat het terugkomt.
 */
describe('bestand not found mag de app niet stilletjes slopen', () => {
  test('de serverless-ingang laadt de app pas binnen zijn foutafhandeling', async () => {
    const { readFile } = await import('node:fs/promises');
    const bron = await readFile(new URL('../api/index.js', import.meta.url), 'utf8');
    const bovenaan = bron.slice(0, bron.indexOf('export default'));
    assert.ok(!/^import .*server\/index\.js/m.test(bovenaan),
      'de app hoort binnen de handler geladen te worden, niet met een import bovenaan');
    assert.match(bron, /await import\(/);
  });

  test('geen enkele servermodule leest gegevens van schijf bij het laden', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const map = new URL('../server/', import.meta.url);
    const overtreders = [];
    for (const naam of await readdir(map)) {
      if (!naam.endsWith('.js')) continue;
      const bron = await readFile(new URL(naam, map), 'utf8');
      // readFile voor statische bestanden zit binnen een functie en is prima;
      // readFileSync op moduleniveau is dat niet
      if (/^const .*=.*readFileSync\(/m.test(bron)) overtreders.push(naam);
    }
    assert.deepEqual(overtreders, [],
      'zet die gegevens in een .js-module met een export; dan neemt elke bundelaar ze mee');
  });

  test('vercel.json neemt de publieke bestanden mee in de functie', async () => {
    const { readFile } = await import('node:fs/promises');
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    assert.match(config.functions['api/index.js'].includeFiles ?? '', /public/);
  });
});
