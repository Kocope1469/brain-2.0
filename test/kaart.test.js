import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { Store } from '../server/store.js';
import { seed } from '../server/seed.js';

let store;
beforeEach(() => { store = new Store(openDb(':memory:')); });

const maak = (extra = {}) => store.createCustomer({ company_name: 'Testklant', ...extra }).value;

describe('kaarten aanmaken en tonen', () => {
  test('een nieuwe kaart komt volledig terug', () => {
    const k = maak({ contact_name: 'Lieve', role: 'Zaakvoerder', email: 'a@b.be', tags: ['horeca'], notes: 'Twee vestigingen.' });
    assert.equal(k.company_name, 'Testklant');
    assert.equal(k.role, 'Zaakvoerder');
    assert.equal(k.notes, 'Twee vestigingen.');
    assert.deepEqual(k.tags, ['horeca']);
  });

  test('ongeldige invoer maakt geen kaart aan', () => {
    assert.equal(store.createCustomer({ company_name: '' }).ok, false);
    assert.equal(store.listCustomers().length, 0);
  });

  test('een onbestaande kaart geeft null, geen crash', () => {
    assert.equal(store.getCustomer(999), null);
    assert.equal(store.updateCustomer(999, { city: 'X' }).notFound, true);
    assert.equal(store.deleteCustomer(999), false);
  });

  test('bijwerken laat velden staan die je niet meestuurt', () => {
    const k = maak({ email: 'a@b.be', city: 'Gent', notes: 'Blijft staan.' });
    const r = store.updateCustomer(k.id, { city: 'Brugge' });
    assert.equal(r.value.city, 'Brugge');
    assert.equal(r.value.email, 'a@b.be');
    assert.equal(r.value.notes, 'Blijft staan.');
  });

  test('bijwerken zet een gewijzigd-tijdstip', () => {
    const k = maak();
    const r = store.updateCustomer(k.id, { city: 'Gent' });
    assert.ok(r.value.updated_at >= k.created_at);
  });

  test('verwijderen ruimt ook de tagkoppelingen op', () => {
    const k = maak({ tags: ['uniek'] });
    assert.equal(store.deleteCustomer(k.id), true);
    assert.deepEqual(store.allTags(), []);
  });
});

describe('zoeken in de kaartenbak', () => {
  beforeEach(() => {
    store.createCustomer({ company_name: 'Alfa nv', city: 'Gent', tags: ['horeca'], notes: 'Levert aan scholen.' });
    store.createCustomer({ company_name: 'Beta bv', city: 'Brugge', tags: ['bouw'], phone: '050 11 22 33' });
  });

  test('zoekt over naam, gemeente en telefoon', () => {
    assert.equal(store.listCustomers({ q: 'alfa' }).length, 1);
    assert.equal(store.listCustomers({ q: 'brugge' }).length, 1);
    assert.equal(store.listCustomers({ q: '050 11' }).length, 1);
    assert.equal(store.listCustomers({ q: 'zzz' }).length, 0);
  });

  test('zoekt ook in de notities — daar staat wat je je niet herinnert', () => {
    assert.equal(store.listCustomers({ q: 'scholen' })[0].company_name, 'Alfa nv');
  });

  test('filtert op tag, ook in combinatie met zoeken', () => {
    assert.equal(store.listCustomers({ tag: 'bouw' })[0].company_name, 'Beta bv');
    assert.equal(store.listCustomers({ q: 'alfa', tag: 'bouw' }).length, 0);
  });

  test('sorteert op naam, gemeente en laatst gewijzigd', () => {
    assert.deepEqual(store.listCustomers({ sort: 'naam' }).map((k) => k.company_name), ['Alfa nv', 'Beta bv']);
    assert.deepEqual(store.listCustomers({ sort: 'gemeente' }).map((k) => k.city), ['Brugge', 'Gent']);
    const alfa = store.listCustomers({ q: 'alfa' })[0];
    store.updateCustomer(alfa.id, { city: 'Gent' });
    assert.equal(store.listCustomers({ sort: 'gewijzigd' })[0].company_name, 'Alfa nv');
  });
});

describe('tags', () => {
  test('worden gedeeld en opgeruimd als niemand ze nog gebruikt', () => {
    const a = maak({ tags: ['horeca'] });
    store.createCustomer({ company_name: 'Tweede', tags: ['horeca'] });
    assert.deepEqual(store.allTags().map((t) => [t.name, t.aantal]), [['horeca', 2]]);
    store.updateCustomer(a.id, { tags: [] });
    assert.deepEqual(store.allTags().map((t) => [t.name, t.aantal]), [['horeca', 1]]);
  });
});

describe('voorbeeldkaarten', () => {
  test('seed levert vijf ingevulde, doorzoekbare kaarten', () => {
    assert.equal(seed(store, { stil: true }), 5);
    assert.equal(store.listCustomers().length, 5);
    assert.equal(store.listCustomers({ q: 'vermeulen' }).length, 1);
    assert.ok(store.listCustomers().every((k) => k.notes.length > 0));
  });
});
