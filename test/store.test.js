import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { Store } from '../server/store.js';
import { seed } from '../server/seed.js';

let store;
beforeEach(() => { store = new Store(openDb(':memory:')); });

const maak = (extra = {}) => store.createCustomer({ name: 'Testklant', ...extra }).value;
const dagenTerug = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

describe('klanten en hun stip', () => {
  test('een klant met coördinaten staat op de kaart', () => {
    const k = maak({ lat: 51.05, lon: 3.72 });
    assert.equal(k.op_kaart, true);
    assert.equal(k.lat, 51.05);
  });

  test('een klant zonder coördinaten staat er niet op, maar bestaat wel', () => {
    const k = maak();
    assert.equal(k.op_kaart, false);
    assert.equal(k.lat, null);
    assert.equal(store.listCustomers().length, 1);
  });

  test('een stip kan achteraf geplaatst worden', () => {
    const k = maak();
    const r = store.updateCustomer(k.id, { lat: '51,05', lon: '3,72' });
    assert.equal(r.value.op_kaart, true);
    assert.equal(r.value.lat, 51.05);
  });

  test('alleen klanten met een stip opvragen', () => {
    maak({ name: 'Met stip', lat: 51, lon: 4 });
    maak({ name: 'Zonder stip' });
    assert.equal(store.listCustomers().length, 2);
    assert.equal(store.listCustomers({ alleenOpKaart: true }).length, 1);
  });

  test('onbestaande klant geeft null en notFound, geen crash', () => {
    assert.equal(store.getCustomer(999), null);
    assert.equal(store.updateCustomer(999, { city: 'X' }).notFound, true);
    assert.equal(store.deleteCustomer(999), false);
  });
});

describe('bezoeken bepalen de kleur', () => {
  test('een verse klant zonder bezoek is rood', () => {
    assert.equal(maak().bucket, 'lang');
  });

  test('een bezoek van vorige week maakt de stip groen', () => {
    const k = maak();
    store.addVisit(k.id, { visit_date: dagenTerug(7), notes: 'Langsgeweest' });
    assert.equal(store.getCustomer(k.id).bucket, 'recent');
  });

  test('de kleur volgt het meest recente bezoek, niet het laatst ingevoerde', () => {
    const k = maak();
    store.addVisit(k.id, { visit_date: dagenTerug(5), notes: 'Recent' });
    store.addVisit(k.id, { visit_date: dagenTerug(400), notes: 'Oud, later ingevoerd' });
    const kaart = store.getCustomer(k.id);
    assert.equal(kaart.laatste_bezoek, dagenTerug(5));
    assert.equal(kaart.bucket, 'recent');
  });

  test('bezoeken staan van recent naar oud', () => {
    const k = maak();
    store.addVisit(k.id, { visit_date: dagenTerug(100), notes: 'Oud' });
    store.addVisit(k.id, { visit_date: dagenTerug(3), notes: 'Nieuw' });
    assert.deepEqual(store.getCustomer(k.id).visits.map((b) => b.notes), ['Nieuw', 'Oud']);
  });

  test('een bezoek verwijderen zet de kleur terug', () => {
    const k = maak();
    const b = store.addVisit(k.id, { visit_date: dagenTerug(2), notes: 'Langsgeweest' }).value;
    assert.equal(store.getCustomer(k.id).bucket, 'recent');
    assert.equal(store.deleteVisit(b.id), true);
    assert.equal(store.getCustomer(k.id).bucket, 'lang');
    assert.equal(store.deleteVisit(b.id), false);
  });

  test('bezoeken bij een onbestaande klant worden geweigerd', () => {
    assert.equal(store.addVisit(999, { notes: 'x' }).notFound, true);
  });

  test('een klant verwijderen neemt zijn bezoeken mee', () => {
    const k = maak();
    store.addVisit(k.id, { notes: 'Langsgeweest' });
    store.deleteCustomer(k.id);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM visits').get().n, 0);
  });
});

describe('zoeken en filteren', () => {
  beforeEach(() => {
    const a = maak({ name: 'Hoeve Alfa', city: 'Gent', postal_code: '9000', lat: 51.05, lon: 3.72, tags: ['melkvee'] });
    store.addVisit(a.id, { visit_date: dagenTerug(5), notes: 'Voorraad besproken' });
    const b = maak({ name: 'Hoeve Beta', city: 'Hasselt', postal_code: '3500', lat: 50.93, lon: 5.34, tags: ['varkens'] });
    store.addVisit(b.id, { visit_date: dagenTerug(200), notes: 'Jaaroverzicht' });
    maak({ name: 'Hoeve Gamma', city: 'Gent', postal_code: '9000' });
  });

  test('zoekt op naam, gemeente en postcode', () => {
    assert.equal(store.listCustomers({ q: 'alfa' }).length, 1);
    assert.equal(store.listCustomers({ q: 'Gent' }).length, 2);
    assert.equal(store.listCustomers({ q: '3500' }).length, 1);
  });

  test('filtert op kleurgroep', () => {
    assert.deepEqual(store.listCustomers({ bucket: 'recent' }).map((k) => k.name), ['Hoeve Alfa']);
    assert.deepEqual(store.listCustomers({ bucket: 'lang' }).map((k) => k.name), ['Hoeve Beta', 'Hoeve Gamma']);
  });

  test('filtert op tag, ook samen met zoeken', () => {
    assert.equal(store.listCustomers({ tag: 'varkens' })[0].name, 'Hoeve Beta');
    assert.equal(store.listCustomers({ q: 'alfa', tag: 'varkens' }).length, 0);
  });

  test('tellingen kloppen met de filterknoppen', () => {
    const t = store.tellingen();
    assert.deepEqual(t, { totaal: 3, recent: 1, tijdje: 0, lang: 2, zonder_stip: 1 });
  });
});

describe('voorbeelddata', () => {
  test('seed levert klanten in alle drie de kleurgroepen', () => {
    assert.equal(seed(store, { stil: true }), 9);
    const t = store.tellingen();
    assert.ok(t.recent > 0 && t.tijdje > 0 && t.lang > 0, JSON.stringify(t));
    assert.equal(t.zonder_stip, 1, 'één klant staat bewust nog niet op de kaart');
    assert.ok(store.listCustomers().filter((k) => k.op_kaart).every((k) => k.lat > 49 && k.lat < 52 && k.lon > 2 && k.lon < 7),
      'alle stippen liggen in België');
  });
});
