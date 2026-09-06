import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { Store } from '../server/store.js';
import { createHttpServer } from '../server/index.js';

let server;
let basis;
const db = openDb(':memory:');

// een geocoder die we in de hand hebben: geen netwerk in de tests
const geocodeAntwoorden = new Map([['Sleepstraat 42, 9000 Gent, BE', { lat: 51.0596, lon: 3.7256, omschrijving: 'Gent' }]]);
const nepGeocode = async (adres) => geocodeAntwoorden.get(adres) ?? null;

before(async () => {
  server = createHttpServer(new Store(db), { geocodeImpl: nepGeocode });
  await new Promise((r) => server.listen(0, r));
  basis = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  for (const t of ['customer_tags', 'tags', 'visits', 'customers']) db.exec(`DELETE FROM ${t}`);
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

const maak = (extra = {}) => vraag('/api/klanten', { method: 'POST', body: { name: 'Testklant', ...extra } });
const dagenTerug = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

describe('klanten', () => {
  test('aanmaken geeft 201 met stip en kleurgroep', async () => {
    const r = await maak({ lat: '51.0596', lon: '3.7256', tags: 'melkvee, gent' });
    assert.equal(r.status, 201);
    assert.equal(r.body.op_kaart, true);
    assert.equal(r.body.bucket, 'lang', 'zonder bezoek is een klant rood');
    assert.deepEqual(r.body.tags, ['gent', 'melkvee']);
  });

  test('ongeldige invoer geeft 422 met bruikbare meldingen', async () => {
    const r = await maak({ name: '', email: 'fout', lat: '999', lon: '3' });
    assert.equal(r.status, 422);
    assert.equal(r.body.errors.length, 3);
  });

  test('zoeken en filteren op kleurgroep', async () => {
    const { body: a } = await maak({ name: 'Hoeve Alfa', city: 'Gent', lat: 51, lon: 3.7 });
    await vraag(`/api/klanten/${a.id}/bezoeken`, { method: 'POST', body: { visit_date: dagenTerug(3), notes: 'Langsgeweest' } });
    await maak({ name: 'Hoeve Beta', city: 'Hasselt', lat: 50.9, lon: 5.3 });

    assert.equal((await vraag('/api/klanten')).body.length, 2);
    assert.equal((await vraag('/api/klanten?q=gent')).body.length, 1);
    assert.equal((await vraag('/api/klanten?bucket=recent')).body[0].name, 'Hoeve Alfa');
    assert.equal((await vraag('/api/klanten?bucket=lang')).body[0].name, 'Hoeve Beta');
  });

  test('stip verplaatsen via een gedeeltelijke update', async () => {
    const { body: k } = await maak();
    assert.equal(k.op_kaart, false);
    const r = await vraag(`/api/klanten/${k.id}`, { method: 'PATCH', body: { lat: '51.2', lon: '4.4' } });
    assert.equal(r.body.op_kaart, true);
    assert.equal(r.body.lat, 51.2);
  });

  test('onbekende klant geeft overal 404', async () => {
    assert.equal((await vraag('/api/klanten/9999')).status, 404);
    assert.equal((await vraag('/api/klanten/9999', { method: 'PATCH', body: { city: 'X' } })).status, 404);
    assert.equal((await vraag('/api/klanten/9999', { method: 'DELETE' })).status, 404);
    assert.equal((await vraag('/api/klanten/9999/bezoeken', { method: 'POST', body: { notes: 'x' } })).status, 404);
  });
});

describe('bezoeken', () => {
  test('een bezoek noteren maakt de klant groen', async () => {
    const { body: k } = await maak();
    const r = await vraag(`/api/klanten/${k.id}/bezoeken`, {
      method: 'POST', body: { visit_date: dagenTerug(2), with_whom: 'Peter', notes: 'Nieuwe Type B voorraad besproken' },
    });
    assert.equal(r.status, 201);
    const { body: dossier } = await vraag(`/api/klanten/${k.id}`);
    assert.equal(dossier.bucket, 'recent');
    assert.equal(dossier.visits[0].with_whom, 'Peter');
    assert.equal(dossier.aantal_bezoeken, 1);
  });

  test('een leeg of toekomstig bezoek wordt geweigerd', async () => {
    const { body: k } = await maak();
    assert.equal((await vraag(`/api/klanten/${k.id}/bezoeken`, { method: 'POST', body: {} })).status, 422);
    assert.equal((await vraag(`/api/klanten/${k.id}/bezoeken`, {
      method: 'POST', body: { notes: 'x', visit_date: '2099-01-01' },
    })).status, 422);
  });

  test('een bezoek verwijderen kan één keer', async () => {
    const { body: k } = await maak();
    const { body: b } = await vraag(`/api/klanten/${k.id}/bezoeken`, { method: 'POST', body: { notes: 'x' } });
    assert.equal((await vraag(`/api/bezoeken/${b.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await vraag(`/api/bezoeken/${b.id}`, { method: 'DELETE' })).status, 404);
  });
});

describe('overzicht en geocoder', () => {
  test('overzicht voedt de filterknoppen', async () => {
    await maak({ tags: 'melkvee' });
    const { body } = await vraag('/api/overzicht');
    assert.deepEqual(body.tellingen, { totaal: 1, recent: 0, tijdje: 0, lang: 1, zonder_stip: 1 });
    assert.deepEqual(body.tags.map((t) => t.name), ['melkvee']);
    assert.equal(body.drempels.recent, 30);
  });

  test('een gevonden adres geeft coördinaten terug', async () => {
    const { body } = await vraag('/api/geocode', { method: 'POST', body: { adres: 'Sleepstraat 42, 9000 Gent, BE' } });
    assert.equal(body.lat, 51.0596);
  });

  test('een onvindbaar adres is geen fout, maar een nette melding', async () => {
    const r = await vraag('/api/geocode', { method: 'POST', body: { adres: 'Nergensstraat 1, Atlantis' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.gevonden, false);
  });

  test('de geocoder kan ook losse adresvelden aan', async () => {
    const { body } = await vraag('/api/geocode', {
      method: 'POST', body: { street: 'Sleepstraat 42', postal_code: '9000', city: 'Gent' },
    });
    assert.equal(body.lat, 51.0596);
  });
});

describe('import en export', () => {
  test('importeert een CSV met coördinaten en rapporteert wat mislukte', async () => {
    const csv = 'Bedrijf;Gemeente;Breedtegraad;Lengtegraad;Tags\nHoeve Alfa;Geel;51.16;5.00;melkvee\nHoeve Beta;Gent;fout;3.7;\n;wees@nergens.be;;;';
    const { body } = await vraag('/api/klanten/import', { method: 'POST', body: { csv } });
    assert.equal(body.toegevoegd, 1);
    assert.equal(body.mislukt.length, 1);
    assert.equal((await vraag('/api/klanten')).body[0].op_kaart, true);
  });

  test('exporteert als CSV met bezoekgegevens', async () => {
    const { body: k } = await maak({ name: 'Hoeve Alfa', lat: 51, lon: 4 });
    await vraag(`/api/klanten/${k.id}/bezoeken`, { method: 'POST', body: { visit_date: dagenTerug(1), notes: 'Langsgeweest' } });
    const res = await fetch(`${basis}/api/klanten/export.csv`);
    const tekst = await res.text();
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(tekst, /Breedtegraad;Lengtegraad/);
    assert.match(tekst, /Laatste bezoek;Aantal bezoeken/);
    assert.match(tekst, new RegExp(dagenTerug(1)));
  });
});

describe('robuustheid', () => {
  test('kapotte JSON geeft 400, geen 500', async () => {
    const res = await fetch(`${basis}/api/klanten`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{niet echt json',
    });
    assert.equal(res.status, 400);
  });

  test('onbekend pad geeft 404 en een foute methode 405', async () => {
    assert.equal((await vraag('/api/bestaatniet')).status, 404);
    const { body: k } = await maak();
    assert.equal((await vraag(`/api/klanten/${k.id}`, { method: 'POST', body: {} })).status, 405);
  });

  test('de app, haar stijl en Leaflet worden geserveerd', async () => {
    assert.match(await (await fetch(basis)).text(), /Zoek klant of stad/);
    assert.match((await fetch(`${basis}/css/app.css`)).headers.get('content-type'), /text\/css/);
    const leaflet = await fetch(`${basis}/vendor/leaflet/leaflet.js`);
    assert.equal(leaflet.status, 200);
    assert.match(leaflet.headers.get('cache-control'), /immutable/);
  });

  test('kan niet buiten de publieke map lezen', async () => {
    const tekst = await (await fetch(`${basis}/../server/db.js`)).text();
    assert.ok(!tekst.includes('DatabaseSync'), 'serverbestand mag nooit uitgeleverd worden');
  });
});
