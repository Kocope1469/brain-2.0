import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { Store } from '../server/store.js';
import { seed } from '../server/seed.js';

let store;
beforeEach(() => { store = new Store(openDb(':memory:')); });

const maak = (extra = {}) => store.createCustomer({ company_name: 'Testklant', ...extra }).value;

describe('klanten', () => {
  test('aanmaken geeft de volledige kaart terug', () => {
    const k = maak({ email: 'a@b.be', tags: ['horeca'] });
    assert.equal(k.company_name, 'Testklant');
    assert.deepEqual(k.tags, ['horeca']);
    assert.deepEqual(k.interactions, []);
    assert.equal(k.omzet_cents, 0);
  });

  test('ongeldige invoer maakt niets aan', () => {
    const r = store.createCustomer({ company_name: '' });
    assert.equal(r.ok, false);
    assert.equal(store.listCustomers().length, 0);
  });

  test('gedeeltelijk bijwerken laat andere velden staan', () => {
    const k = maak({ email: 'a@b.be', city: 'Gent' });
    const r = store.updateCustomer(k.id, { city: 'Brugge' });
    assert.equal(r.value.city, 'Brugge');
    assert.equal(r.value.email, 'a@b.be');
  });

  test('bijwerken van een onbestaande klant meldt niet-gevonden', () => {
    assert.equal(store.updateCustomer(999, { city: 'X' }).notFound, true);
    assert.equal(store.getCustomer(999), null);
  });

  test('verwijderen neemt contactmomenten, opdrachten en taken mee', () => {
    const k = maak();
    store.addInteraction(k.id, { subject: 'Gebeld' });
    store.addDeal(k.id, { title: 'Site', amount: '100' });
    store.addTask(k.id, { title: 'Opvolgen' });
    assert.equal(store.deleteCustomer(k.id), true);
    assert.equal(store.openTasks().length, 0);
    assert.equal(store.stats().omzet_totaal_cents, 0);
  });
});

describe('zoeken, filteren en sorteren', () => {
  beforeEach(() => {
    store.createCustomer({ company_name: 'Alfa nv', city: 'Gent', status: 'actief', tags: ['horeca'] });
    store.createCustomer({ company_name: 'Beta bv', city: 'Brugge', status: 'prospect', tags: ['bouw'] });
  });

  test('zoekt over naam, gemeente en e-mail', () => {
    assert.equal(store.listCustomers({ q: 'alfa' }).length, 1);
    assert.equal(store.listCustomers({ q: 'brugge' }).length, 1);
    assert.equal(store.listCustomers({ q: 'zzz' }).length, 0);
  });

  test('filtert op status en op tag', () => {
    assert.equal(store.listCustomers({ status: 'actief' })[0].company_name, 'Alfa nv');
    assert.equal(store.listCustomers({ tag: 'bouw' })[0].company_name, 'Beta bv');
    assert.equal(store.listCustomers({ status: 'actief', tag: 'bouw' }).length, 0);
  });

  test('sorteert op omzet', () => {
    const beta = store.listCustomers({ q: 'beta' })[0];
    store.addDeal(beta.id, { title: 'Groot', amount: '5000', status: 'gewonnen' });
    assert.equal(store.listCustomers({ sort: 'omzet' })[0].company_name, 'Beta bv');
  });

  test('gearchiveerde klanten staan niet in de gewone lijst', () => {
    const alfa = store.listCustomers({ q: 'alfa' })[0];
    store.updateCustomer(alfa.id, { archived: 1 });
    assert.equal(store.listCustomers().length, 1);
    assert.equal(store.listCustomers({ archived: 1 }).length, 1);
  });
});

describe('omzet', () => {
  test('telt enkel gewonnen, gefactureerde en betaalde opdrachten', () => {
    const k = maak();
    store.addDeal(k.id, { title: 'A', amount: '1000', status: 'gewonnen' });
    store.addDeal(k.id, { title: 'B', amount: '2000', status: 'betaald' });
    store.addDeal(k.id, { title: 'C', amount: '9999', status: 'offerte' });
    store.addDeal(k.id, { title: 'D', amount: '8888', status: 'verloren' });
    assert.equal(store.getCustomer(k.id).omzet_cents, 300000);
    assert.equal(store.stats().openstaande_offertes_cents, 999900);
  });
});

describe('taken', () => {
  test('open taken staan chronologisch en verdwijnen na afvinken', () => {
    const k = maak();
    store.addTask(k.id, { title: 'Later', due_date: '2030-01-01' });
    const eerst = store.addTask(k.id, { title: 'Eerst', due_date: '2020-01-01' }).value;
    assert.deepEqual(store.openTasks().map((t) => t.title), ['Eerst', 'Later']);
    store.toggleTask(eerst.id, true);
    assert.deepEqual(store.openTasks().map((t) => t.title), ['Later']);
    assert.equal(store.toggleTask(9999, true), null);
  });

  test('taken over de datum worden geteld', () => {
    const k = maak();
    store.addTask(k.id, { title: 'Te laat', due_date: '2020-01-01' });
    store.addTask(k.id, { title: 'Op tijd', due_date: '2099-01-01' });
    const s = store.stats();
    assert.equal(s.open_taken, 2);
    assert.equal(s.taken_te_laat, 1);
  });
});

describe('tags', () => {
  test('worden gedeeld tussen klanten en opgeruimd als niemand ze nog gebruikt', () => {
    const a = maak({ tags: ['horeca'] });
    store.createCustomer({ company_name: 'Tweede', tags: ['horeca'] });
    assert.deepEqual(store.allTags().map((t) => [t.name, t.aantal]), [['horeca', 2]]);
    store.updateCustomer(a.id, { tags: [] });
    assert.deepEqual(store.allTags().map((t) => [t.name, t.aantal]), [['horeca', 1]]);
    assert.equal(store.deleteCustomer(store.listCustomers({ q: 'Tweede' })[0].id), true);
    store.updateCustomer(a.id, { tags: [] });
    assert.deepEqual(store.allTags(), []);
  });
});

describe('signalering van stille klanten', () => {
  test('toont actieve klanten zonder recent contact, niet de slapende', () => {
    const a = maak({ company_name: 'Stil nv', status: 'actief' });
    store.addInteraction(a.id, { subject: 'Lang geleden', occurred_at: '2020-01-01' });
    const b = maak({ company_name: 'Recent nv', status: 'actief' });
    store.addInteraction(b.id, { subject: 'Net gesproken', occurred_at: new Date().toISOString().slice(0, 10) });
    maak({ company_name: 'Slaapt nv', status: 'slapend' });

    const namen = store.stats().stille_klanten.map((k) => k.company_name);
    assert.ok(namen.includes('Stil nv'));
    assert.ok(!namen.includes('Recent nv'));
    assert.ok(!namen.includes('Slaapt nv'));
  });

  test('een klant zonder enig contact geldt ook als stil', () => {
    maak({ company_name: 'Nooit nv', status: 'prospect' });
    assert.equal(store.stats().stille_klanten[0].company_name, 'Nooit nv');
  });
});

describe('voorbeelddata', () => {
  test('seed levert een consistente, doorzoekbare database', () => {
    assert.equal(seed(store, { stil: true }), 5);
    const s = store.stats();
    assert.equal(s.klanten, 5);
    assert.ok(s.omzet_totaal_cents > 0);
    assert.ok(s.open_taken >= 5);
    assert.equal(store.listCustomers({ q: 'vermeulen' }).length, 1);
  });
});
