import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../server/seed.js';
import { dialecten, verseOmgeving, dagenTerug } from './helpers.js';

for (const dialect of dialecten('store')) {
  describe(`store op ${dialect.naam}`, () => {
    let store;
    let db;

    beforeEach(async () => { ({ store, db } = await verseOmgeving(dialect.opties)); });
    after(async () => { await db?.close(); });

    const maak = async (extra = {}) => (await store.createCustomer({ name: 'Testklant', ...extra })).value;

    describe('klanten en hun stip', () => {
      test('een klant met coördinaten staat op de kaart', async () => {
        const k = await maak({ lat: 51.05, lon: 3.72 });
        assert.equal(k.op_kaart, true);
        assert.equal(k.lat, 51.05);
      });

      test('zonder coördinaten geen stip, maar de klant bestaat wel', async () => {
        const k = await maak();
        assert.equal(k.op_kaart, false);
        assert.equal(k.lat, null);
        assert.equal((await store.listCustomers()).length, 1);
      });

      test('provincie volgt uit de postcode', async () => {
        assert.equal((await maak({ postal_code: '8800' })).provincie, 'West-Vlaanderen');
        assert.equal((await maak({ postal_code: '' })).provincie, '');
      });

      test('onbestaande klant geeft null en notFound', async () => {
        assert.equal(await store.getCustomer(9999), null);
        assert.equal((await store.updateCustomer(9999, { city: 'X' })).notFound, true);
        assert.equal(await store.deleteCustomer(9999), false);
      });
    });

    describe('bezoeken bepalen de kleur', () => {
      test('zonder bezoek is een klant rood', async () => {
        assert.equal((await maak()).bucket, 'lang');
      });

      test('de kleur volgt het meest recente bezoek, niet het laatst ingevoerde', async () => {
        const k = await maak();
        await store.addVisit(k.id, { visit_date: dagenTerug(5), notes: 'Recent' });
        await store.addVisit(k.id, { visit_date: dagenTerug(400), notes: 'Oud, later ingevoerd' });
        const dossier = await store.getCustomer(k.id);
        assert.equal(dossier.laatste_bezoek, dagenTerug(5));
        assert.equal(dossier.bucket, 'recent');
        assert.deepEqual(dossier.visits.map((b) => b.notes), ['Recent', 'Oud, later ingevoerd']);
      });

      test('de auteur van een bezoek wordt bewaard', async () => {
        const k = await maak();
        await store.addVisit(k.id, { notes: 'Langsgeweest' }, 'Kobe');
        assert.equal((await store.getCustomer(k.id)).visits[0].author, 'Kobe');
      });

      test('een bezoek verwijderen zet de kleur terug', async () => {
        const k = await maak();
        const b = (await store.addVisit(k.id, { visit_date: dagenTerug(2), notes: 'x' })).value;
        assert.equal((await store.getCustomer(k.id)).bucket, 'recent');
        assert.equal(await store.deleteVisit(b.id), true);
        assert.equal((await store.getCustomer(k.id)).bucket, 'lang');
      });

      test('een klant verwijderen neemt zijn bezoeken mee', async () => {
        const k = await maak();
        await store.addVisit(k.id, { notes: 'x' });
        await store.deleteCustomer(k.id);
        assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM visits')).n), 0);
      });
    });

    describe('zoeken en filteren', () => {
      beforeEach(async () => {
        const a = await maak({ name: 'Hoeve Alfa', city: 'Gent', postal_code: '9000', lat: 51.05, lon: 3.72, tags: ['melkvee'] });
        await store.addVisit(a.id, { visit_date: dagenTerug(5), notes: 'Voorraad besproken' });
        const b = await maak({ name: 'Hoeve Beta', city: 'Hasselt', postal_code: '3500', lat: 50.93, lon: 5.34, tags: ['varkens'] });
        await store.addVisit(b.id, { visit_date: dagenTerug(200), notes: 'Jaaroverzicht' });
        await maak({ name: 'Hoeve Gamma', city: 'Gent', postal_code: '9000' });
      });

      test('zoeken is hoofdletterongevoelig op beide databases', async () => {
        assert.equal((await store.listCustomers({ q: 'ALFA' })).length, 1);
        assert.equal((await store.listCustomers({ q: 'gent' })).length, 2);
        assert.equal((await store.listCustomers({ q: 'HoEvE' })).length, 3);
      });

      test('filtert op kleurgroep, tag en provincie', async () => {
        assert.deepEqual((await store.listCustomers({ bucket: 'recent' })).map((k) => k.name), ['Hoeve Alfa']);
        assert.equal((await store.listCustomers({ tag: 'varkens' }))[0].name, 'Hoeve Beta');
        assert.equal((await store.listCustomers({ provincie: 'Limburg' }))[0].name, 'Hoeve Beta');
        assert.equal((await store.listCustomers({ provincie: 'Limburg', bucket: 'recent' })).length, 0);
      });

      test('sorteert op naam, ongeacht hoofdletters', async () => {
        await maak({ name: 'aardappelbedrijf' });
        assert.equal((await store.listCustomers())[0].name, 'aardappelbedrijf');
      });

      test('tellingen kloppen met de filterknoppen', async () => {
        const t = await store.tellingen();
        assert.equal(t.totaal, 3);
        assert.equal(t.recent, 1);
        assert.equal(t.lang, 2);
        assert.equal(t.zonder_stip, 1);
        assert.deepEqual(t.per_provincie.sort(), [['Limburg', 1], ['Oost-Vlaanderen', 2]].sort());
      });
    });

    describe('voorbeelddata', () => {
      test('seed levert klanten in alle drie de kleurgroepen', async () => {
        assert.equal(await seed(store, { stil: true }), 9);
        const t = await store.tellingen();
        assert.ok(t.recent > 0 && t.tijdje > 0 && t.lang > 0, JSON.stringify(t));
        assert.equal(t.zonder_stip, 1);
      });
    });
  });
}
