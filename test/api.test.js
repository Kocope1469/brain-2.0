import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { Store } from '../server/store.js';
import { createHttpServer } from '../server/index.js';

let server;
let basis;
let store;
const db = openDb(':memory:');

before(async () => {
  store = new Store(db);
  server = createHttpServer(store);
  await new Promise((r) => server.listen(0, r));
  basis = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  for (const t of ['customer_tags', 'tags', 'interactions', 'deals', 'tasks', 'customers']) {
    db.exec(`DELETE FROM ${t}`);
  }
});

async function vraag(pad, opties = {}) {
  const res = await fetch(basis + pad, {
    ...opties,
    headers: opties.body ? { 'content-type': 'application/json' } : {},
    body: opties.body ? JSON.stringify(opties.body) : undefined,
  });
  const tekst = await res.text();
  return { status: res.status, type: res.headers.get('content-type'), body: tekst ? JSON.parse(tekst) : null, tekst };
}

const maakKlant = (extra = {}) =>
  vraag('/api/klanten', { method: 'POST', body: { company_name: 'Testklant', ...extra } });

describe('klanten via de API', () => {
  test('aanmaken geeft 201 en de nieuwe kaart', async () => {
    const r = await maakKlant({ email: 'a@b.be', tags: 'horeca, gent' });
    assert.equal(r.status, 201);
    assert.equal(r.body.email, 'a@b.be');
    assert.deepEqual(r.body.tags, ['gent', 'horeca']);
  });

  test('ongeldige invoer geeft 422 met bruikbare meldingen', async () => {
    const r = await maakKlant({ company_name: '', email: 'fout' });
    assert.equal(r.status, 422);
    assert.equal(r.body.errors.length, 2);
  });

  test('lijst, zoeken en filteren', async () => {
    await maakKlant({ company_name: 'Alfa nv', status: 'actief', tags: 'horeca' });
    await maakKlant({ company_name: 'Beta bv', status: 'prospect' });
    assert.equal((await vraag('/api/klanten')).body.length, 2);
    assert.equal((await vraag('/api/klanten?q=alfa')).body.length, 1);
    assert.equal((await vraag('/api/klanten?status=prospect')).body[0].company_name, 'Beta bv');
    assert.equal((await vraag('/api/klanten?tag=horeca')).body.length, 1);
  });

  test('ophalen, bijwerken en verwijderen van een klant', async () => {
    const { body: k } = await maakKlant();
    assert.equal((await vraag(`/api/klanten/${k.id}`)).body.company_name, 'Testklant');

    const gewijzigd = await vraag(`/api/klanten/${k.id}`, { method: 'PATCH', body: { city: 'Gent' } });
    assert.equal(gewijzigd.body.city, 'Gent');

    assert.equal((await vraag(`/api/klanten/${k.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await vraag(`/api/klanten/${k.id}`)).status, 404);
  });

  test('onbekende klant geeft overal 404, geen crash', async () => {
    assert.equal((await vraag('/api/klanten/9999')).status, 404);
    assert.equal((await vraag('/api/klanten/9999', { method: 'PATCH', body: { city: 'X' } })).status, 404);
    assert.equal((await vraag('/api/klanten/9999', { method: 'DELETE' })).status, 404);
    assert.equal((await vraag('/api/klanten/9999/contact', { method: 'POST', body: { subject: 'x' } })).status, 404);
  });
});

describe('onderdelen van de kaart', () => {
  test('contactmoment, opdracht en taak komen op de kaart terecht', async () => {
    const { body: k } = await maakKlant();
    await vraag(`/api/klanten/${k.id}/contact`, { method: 'POST', body: { type: 'telefoon', subject: 'Gebeld' } });
    await vraag(`/api/klanten/${k.id}/opdrachten`, { method: 'POST', body: { title: 'Site', amount: '1.500,00', status: 'gewonnen' } });
    await vraag(`/api/klanten/${k.id}/taken`, { method: 'POST', body: { title: 'Opvolgen', due_date: '2030-01-01' } });

    const { body: kaart } = await vraag(`/api/klanten/${k.id}`);
    assert.equal(kaart.interactions[0].subject, 'Gebeld');
    assert.equal(kaart.deals[0].amount_cents, 150000);
    assert.equal(kaart.omzet_cents, 150000);
    assert.equal(kaart.tasks[0].title, 'Opvolgen');
  });

  test('een taak afvinken en weer openzetten', async () => {
    const { body: k } = await maakKlant();
    const { body: taak } = await vraag(`/api/klanten/${k.id}/taken`, { method: 'POST', body: { title: 'Bellen' } });
    assert.equal((await vraag('/api/taken')).body.length, 1);

    assert.equal((await vraag(`/api/taken/${taak.id}`, { method: 'PATCH', body: { done: true } })).body.done, 1);
    assert.equal((await vraag('/api/taken')).body.length, 0);
    assert.equal((await vraag(`/api/taken/${taak.id}`, { method: 'PATCH', body: { done: false } })).body.done, 0);
    assert.equal((await vraag('/api/taken/9999', { method: 'PATCH', body: { done: true } })).status, 404);
  });

  test('onderdelen kunnen los verwijderd worden', async () => {
    const { body: k } = await maakKlant();
    const { body: c } = await vraag(`/api/klanten/${k.id}/contact`, { method: 'POST', body: { subject: 'Gebeld' } });
    assert.equal((await vraag(`/api/contact/${c.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await vraag(`/api/contact/${c.id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await vraag(`/api/klanten/${k.id}`)).body.interactions.length, 0);
  });

  test('ongeldig contactmoment geeft 422', async () => {
    const { body: k } = await maakKlant();
    const r = await vraag(`/api/klanten/${k.id}/contact`, { method: 'POST', body: { type: 'duif', subject: '' } });
    assert.equal(r.status, 422);
  });
});

describe('overzichten', () => {
  test('stats levert de dashboardcijfers', async () => {
    const { body: k } = await maakKlant({ status: 'actief' });
    await vraag(`/api/klanten/${k.id}/opdrachten`, { method: 'POST', body: { title: 'A', amount: '1000', status: 'gewonnen' } });
    await vraag(`/api/klanten/${k.id}/opdrachten`, { method: 'POST', body: { title: 'B', amount: '500', status: 'offerte' } });
    await vraag(`/api/klanten/${k.id}/taken`, { method: 'POST', body: { title: 'Te laat', due_date: '2020-01-01' } });

    const { body: s } = await vraag('/api/stats');
    assert.equal(s.klanten, 1);
    assert.equal(s.omzet_totaal_cents, 100000);
    assert.equal(s.openstaande_offertes_cents, 50000);
    assert.equal(s.taken_te_laat, 1);
  });

  test('meta geeft de keuzelijsten voor de interface', async () => {
    await maakKlant({ tags: 'horeca' });
    const { body } = await vraag('/api/meta');
    assert.ok(body.statussen.includes('actief'));
    assert.ok(body.contactsoorten.includes('telefoon'));
    assert.deepEqual(body.tags, [{ name: 'horeca', aantal: 1 }]);
  });
});

describe('import en export', () => {
  test('importeert een CSV en rapporteert wat mislukte', async () => {
    const csv = 'Bedrijf;E-mail;Tags\nAlfa nv;info@alfa.be;horeca\nBeta bv;kapotmail;bouw\n;wees@nergens.be;';
    const { body } = await vraag('/api/klanten/import', { method: 'POST', body: { csv } });
    assert.equal(body.toegevoegd, 1);
    assert.equal(body.mislukt.length, 1);
    assert.equal(body.mislukt[0].naam, 'Beta bv');
    assert.equal((await vraag('/api/klanten')).body.length, 1);
  });

  test('exporteert als CSV-download', async () => {
    await maakKlant({ company_name: 'Alfa nv', city: 'Gent' });
    const res = await fetch(`${basis}/api/klanten/export.csv`);
    const tekst = await res.text();
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="klanten-\d{4}-\d{2}-\d{2}\.csv"/);
    assert.match(tekst, /Bedrijf;Contactpersoon/);
    assert.match(tekst, /Alfa nv;/);
  });
});

describe('robuustheid', () => {
  test('kapotte JSON geeft 400, geen 500', async () => {
    const res = await fetch(`${basis}/api/klanten`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{niet echt json',
    });
    assert.equal(res.status, 400);
  });

  test('onbekend API-pad geeft 404', async () => {
    assert.equal((await vraag('/api/bestaatniet')).status, 404);
  });

  test('verkeerde methode op een bestaand pad geeft 405', async () => {
    const { body: k } = await maakKlant();
    assert.equal((await vraag(`/api/klanten/${k.id}`, { method: 'POST', body: {} })).status, 405);
  });

  test('de app zelf en haar bestanden worden geserveerd', async () => {
    const html = await fetch(basis);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /text\/html/);
    assert.match(await html.text(), /Klantenkaart/);

    const css = await fetch(`${basis}/css/app.css`);
    assert.match(css.headers.get('content-type'), /text\/css/);
  });

  test('onbekende paden vallen terug op de app zelf, zodat diepe links werken', async () => {
    const res = await fetch(`${basis}/klant/1`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>Klantenkaart<\/title>/);
  });

  test('kan niet buiten de publieke map lezen', async () => {
    const res = await fetch(`${basis}/../server/db.js`);
    const tekst = await res.text();
    assert.ok(!tekst.includes('DatabaseSync'), 'serverbestand mag nooit uitgeleverd worden');
  });
});
