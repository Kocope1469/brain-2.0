import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { Store } from '../server/store.js';
import { createHttpServer } from '../server/index.js';

let server;
let basis;
const db = openDb(':memory:');

before(async () => {
  server = createHttpServer(new Store(db));
  await new Promise((r) => server.listen(0, r));
  basis = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  for (const t of ['customer_tags', 'tags', 'customers']) db.exec(`DELETE FROM ${t}`);
});

async function vraag(pad, opties = {}) {
  const res = await fetch(basis + pad, {
    ...opties,
    headers: opties.body ? { 'content-type': 'application/json' } : {},
    body: opties.body ? JSON.stringify(opties.body) : undefined,
  });
  const tekst = await res.text();
  return { status: res.status, body: tekst ? JSON.parse(tekst) : null };
}

const maak = (extra = {}) => vraag('/api/klanten', { method: 'POST', body: { company_name: 'Testklant', ...extra } });

describe('kaarten via de API', () => {
  test('aanmaken geeft 201 en de nieuwe kaart', async () => {
    const r = await maak({ email: 'a@b.be', role: 'Zaakvoerder', tags: 'horeca, gent' });
    assert.equal(r.status, 201);
    assert.equal(r.body.role, 'Zaakvoerder');
    assert.deepEqual(r.body.tags, ['gent', 'horeca']);
  });

  test('ongeldige invoer geeft 422 met bruikbare meldingen', async () => {
    const r = await maak({ company_name: '', email: 'fout' });
    assert.equal(r.status, 422);
    assert.equal(r.body.errors.length, 2);
  });

  test('lijst, zoeken en filteren op tag', async () => {
    await maak({ company_name: 'Alfa nv', city: 'Gent', tags: 'horeca' });
    await maak({ company_name: 'Beta bv', city: 'Brugge' });
    assert.equal((await vraag('/api/klanten')).body.length, 2);
    assert.equal((await vraag('/api/klanten?q=alfa')).body.length, 1);
    assert.equal((await vraag('/api/klanten?tag=horeca')).body[0].company_name, 'Alfa nv');
    assert.equal((await vraag('/api/klanten?sort=gemeente')).body[0].city, 'Brugge');
  });

  test('ophalen, bijwerken en verwijderen van een kaart', async () => {
    const { body: k } = await maak({ notes: 'Belangrijk.' });
    assert.equal((await vraag(`/api/klanten/${k.id}`)).body.notes, 'Belangrijk.');
    assert.equal((await vraag(`/api/klanten/${k.id}`, { method: 'PATCH', body: { city: 'Gent' } })).body.city, 'Gent');
    assert.equal((await vraag(`/api/klanten/${k.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await vraag(`/api/klanten/${k.id}`)).status, 404);
  });

  test('onbekende kaart geeft overal 404, geen crash', async () => {
    assert.equal((await vraag('/api/klanten/9999')).status, 404);
    assert.equal((await vraag('/api/klanten/9999', { method: 'PATCH', body: { city: 'X' } })).status, 404);
    assert.equal((await vraag('/api/klanten/9999', { method: 'DELETE' })).status, 404);
  });

  test('tags-eindpunt voedt het filter', async () => {
    await maak({ tags: 'horeca' });
    assert.deepEqual((await vraag('/api/tags')).body.map((t) => [t.name, t.aantal]), [['horeca', 1]]);
  });
});

describe('import en export', () => {
  test('importeert een CSV en rapporteert wat mislukte', async () => {
    const csv = 'Bedrijf;E-mail;Functie;Tags\nAlfa nv;info@alfa.be;Zaakvoerder;horeca\nBeta bv;kapotmail;;bouw\n;wees@nergens.be;;';
    const { body } = await vraag('/api/klanten/import', { method: 'POST', body: { csv } });
    assert.equal(body.toegevoegd, 1);
    assert.equal(body.mislukt.length, 1);
    assert.equal(body.mislukt[0].naam, 'Beta bv');
    assert.equal((await vraag('/api/klanten')).body[0].role, 'Zaakvoerder');
  });

  test('exporteert als CSV-download, inclusief notities', async () => {
    await maak({ company_name: 'Alfa nv', city: 'Gent', notes: 'Levert aan scholen.' });
    const res = await fetch(`${basis}/api/klanten/export.csv`);
    const tekst = await res.text();
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="klantenkaarten-\d{4}-\d{2}-\d{2}\.csv"/);
    assert.match(tekst, /Naam;Contactpersoon;Functie/);
    assert.match(tekst, /Levert aan scholen\./);
  });
});

describe('robuustheid', () => {
  test('kapotte JSON geeft 400, geen 500', async () => {
    const res = await fetch(`${basis}/api/klanten`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{niet echt json',
    });
    assert.equal(res.status, 400);
  });

  test('onbekend API-pad geeft 404 en een foute methode 405', async () => {
    assert.equal((await vraag('/api/bestaatniet')).status, 404);
    const { body: k } = await maak();
    assert.equal((await vraag(`/api/klanten/${k.id}`, { method: 'POST', body: {} })).status, 405);
  });

  test('de app en haar bestanden worden geserveerd', async () => {
    const html = await fetch(basis);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Klantenkaart/);
    assert.match((await fetch(`${basis}/css/app.css`)).headers.get('content-type'), /text\/css/);
  });

  test('diepe links vallen terug op de app zelf', async () => {
    const res = await fetch(`${basis}/kaart/1`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>Klantenkaart<\/title>/);
  });

  test('kan niet buiten de publieke map lezen', async () => {
    const tekst = await (await fetch(`${basis}/../server/db.js`)).text();
    assert.ok(!tekst.includes('DatabaseSync'), 'serverbestand mag nooit uitgeleverd worden');
  });
});
