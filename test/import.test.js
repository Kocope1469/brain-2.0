import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { csvToCustomers } from '../server/csv.js';
import { dialecten, verseOmgeving, dagenTerug } from './helpers.js';

/**
 * De import moet je zonder nadenken opnieuw kunnen draaien. Deze tests bewaken
 * dat: geen dubbels, en bezoekverslagen blijven altijd staan.
 */
for (const dialect of dialecten('import')) {
  describe(`CSV-import op ${dialect.naam}`, () => {
    let store;
    let db;

    beforeEach(async () => { ({ store, db } = await verseOmgeving(dialect.opties)); });
    after(async () => { await db?.close(); });

    const importeerCsv = (csv) => store.importeer(csvToCustomers(csv).customers);

    const EXPORT = [
      'CRM-id;Bedrijf;Contactpersoon;Telefoon;Postcode;Gemeente;BTW',
      'CRM-1001;Demagro;Peter Vandriessche;051 26 03 30;8800;Roeselare;',
      'CRM-1002;Hoeve Peeters;Tom Peeters;011 45 67 89;3500;Hasselt;BE0456789133',
    ].join('\n');

    test('eerste import maakt alles nieuw aan', async () => {
      const r = await importeerCsv(EXPORT);
      assert.deepEqual([r.nieuw, r.bijgewerkt, r.ongewijzigd, r.mislukt.length], [2, 0, 0, 0]);
      assert.equal((await store.listCustomers()).length, 2);
    });

    test('dezelfde import opnieuw draaien maakt geen dubbels', async () => {
      await importeerCsv(EXPORT);
      const r = await importeerCsv(EXPORT);
      assert.deepEqual([r.nieuw, r.bijgewerkt, r.ongewijzigd], [0, 0, 2]);
      assert.equal((await store.listCustomers()).length, 2, 'er mogen geen dubbele klanten bijkomen');
    });

    test('gewijzigde gegevens in het CRM worden overgenomen', async () => {
      await importeerCsv(EXPORT);
      const r = await importeerCsv(EXPORT.replace('051 26 03 30', '051 99 99 99'));
      assert.deepEqual([r.nieuw, r.bijgewerkt, r.ongewijzigd], [0, 1, 1]);
      assert.equal((await store.listCustomers({ q: 'demagro' }))[0].phone, '051 99 99 99');
    });

    test('bezoekverslagen overleven een herimport — dit is de hele reden', async () => {
      await importeerCsv(EXPORT);
      const klant = (await store.listCustomers({ q: 'demagro' }))[0];
      await store.addVisit(klant.id, {
        visit_date: dagenTerug(10), with_whom: 'Peter', notes: 'Nieuwe Type B voorraad besproken',
      }, 'Kobe');

      await importeerCsv(EXPORT.replace('Peter Vandriessche', 'Peter V.'));

      const na = await store.getCustomer(klant.id);
      assert.equal(na.id, klant.id, 'het moet dezelfde klant blijven');
      assert.equal(na.visits.length, 1);
      assert.equal(na.visits[0].notes, 'Nieuwe Type B voorraad besproken');
      assert.equal(na.visits[0].author, 'Kobe');
      assert.equal(na.bucket, 'recent', 'de kleur mag niet terugvallen naar rood');
      assert.equal(na.contact_name, 'Peter V.', 'de contactpersoon is wél bijgewerkt');
    });

    test('eigen notities, tags en stip blijven van de import gevrijwaard', async () => {
      await importeerCsv(EXPORT);
      const klant = (await store.listCustomers({ q: 'demagro' }))[0];
      await store.updateCustomer(klant.id, {
        notes: 'Bellen liefst na 14u.', tags: ['voeders'], lat: 50.9556, lon: 3.1256,
      });

      await importeerCsv(EXPORT);

      const na = await store.getCustomer(klant.id);
      assert.equal(na.notes, 'Bellen liefst na 14u.');
      assert.deepEqual(na.tags, ['voeders']);
      assert.equal(na.lat, 50.9556, 'een zelf geplaatste stip mag niet verspringen');
    });

    test('een klant zonder CRM-id wordt herkend aan zijn BTW-nummer', async () => {
      await store.createCustomer({ name: 'Andere naam bv', vat_number: 'BE0456789133', postal_code: '3500' });
      const r = await importeerCsv(EXPORT);
      assert.equal(r.nieuw, 1, 'alleen Demagro is echt nieuw');
      assert.equal(r.bijgewerkt, 1);
      assert.equal((await store.listCustomers()).length, 2);
      assert.equal((await store.listCustomers({ q: 'peeters' }))[0].name, 'Hoeve Peeters');
    });

    test('zonder CRM-id en BTW valt hij terug op naam plus postcode', async () => {
      await store.createCustomer({ name: 'Demagro', postal_code: '8800' });
      const r = await importeerCsv(EXPORT);
      assert.equal(r.nieuw, 1);
      assert.equal((await store.listCustomers({ q: 'demagro' })).length, 1);
    });

    test('een leeg CRM-id wordt bij de eerste match aangevuld', async () => {
      await store.createCustomer({ name: 'Demagro', postal_code: '8800' });
      await importeerCsv(EXPORT);
      assert.equal((await store.listCustomers({ q: 'demagro' }))[0].external_id, 'CRM-1001');
    });

    test('lege cellen in de export wissen geen bestaande gegevens', async () => {
      await importeerCsv(EXPORT);
      const zonderTelefoon = EXPORT.replace('051 26 03 30', '');
      await importeerCsv(zonderTelefoon);
      assert.equal((await store.listCustomers({ q: 'demagro' }))[0].phone, '051 26 03 30');
    });

    test('foute rijen worden overgeslagen, de rest gaat door', async () => {
      const csv = 'CRM-id;Bedrijf;BTW\nCRM-1;Goede nv;BE0123456749\nCRM-2;Foute nv;BE0123456748';
      const r = await importeerCsv(csv);
      assert.equal(r.nieuw, 1);
      assert.equal(r.mislukt.length, 1);
      assert.equal(r.mislukt[0].naam, 'Foute nv');
      assert.match(r.mislukt[0].fouten[0], /BTW/);
    });

    test('twee klanten met dezelfde naam in verschillende gemeenten blijven apart', async () => {
      const csv = 'Bedrijf;Postcode;Gemeente\nHoeve Janssens;8800;Roeselare\nHoeve Janssens;3500;Hasselt';
      const r = await importeerCsv(csv);
      assert.equal(r.nieuw, 2);
      assert.equal((await importeerCsv(csv)).ongewijzigd, 2);
      assert.equal((await store.listCustomers()).length, 2);
    });
  });
}

/**
 * Een import die per klant een handvol losse vragen aan de database stelt, duurt
 * bij een gehoste database te lang en wordt door een serverless platform afgekapt.
 * Deze test bewaakt dat het bulk blijft: hij telt de vragen.
 */
for (const dialect of dialecten('import-snelheid')) {
  describe(`hoeveel de import de database lastigvalt op ${dialect.naam}`, () => {
    let store;
    let db;
    let vragen = 0;

    beforeEach(async () => {
      ({ store, db } = await verseOmgeving(dialect.opties));
      for (const methode of ['all', 'get', 'run', 'insert']) {
        const origineel = db[methode].bind(db);
        db[methode] = (...args) => { vragen++; return origineel(...args); };
      }
    });
    after(async () => { await db?.close(); });

    const rijen = (aantal) => Array.from({ length: aantal }, (_, i) => ({
      name: `Bedrijf ${i}`, postal_code: String(2000 + i), city: 'Gemeente',
      email: `info${i}@bedrijf.be`, tags: 'elektro, klant',
    }));

    test('nieuwe klanten kosten ongeveer één schrijfactie per klant, niet tien', async () => {
      vragen = 0;
      const r = await store.importeer(rijen(100));
      assert.equal(r.nieuw, 100);
      assert.ok(vragen <= 110, `100 nieuwe klanten kostten ${vragen} vragen; dat hoort rond de 100 te liggen`);
    });

    test('een herimport zonder wijzigingen kost bijna niets', async () => {
      await store.importeer(rijen(100));
      vragen = 0;
      const r = await store.importeer(rijen(100));
      assert.equal(r.ongewijzigd, 100);
      assert.ok(vragen <= 3, `een herimport kostte ${vragen} vragen; dat hoort er 1 à 2 te zijn`);
    });

    test('enkel de gewijzigde klanten worden weggeschreven', async () => {
      await store.importeer(rijen(100));
      const gewijzigd = rijen(100).map((r, i) => (i < 5 ? { ...r, phone: '011 22 33 44' } : r));
      vragen = 0;
      const r = await store.importeer(gewijzigd);
      assert.equal(r.bijgewerkt, 5);
      assert.equal(r.ongewijzigd, 95);
      assert.ok(vragen <= 8, `5 wijzigingen kostten ${vragen} vragen`);
    });

    test('tags komen er wel degelijk op te staan', async () => {
      await store.importeer(rijen(20));
      const klant = (await store.listCustomers({ q: 'Bedrijf 7' }))[0];
      assert.deepEqual(klant.tags.sort(), ['elektro', 'klant']);
    });

    test('twee identieke rijen in hetzelfde bestand geven één klant', async () => {
      const dubbel = [...rijen(3), ...rijen(3)];
      const r = await store.importeer(dubbel);
      assert.equal(r.nieuw, 3);
      assert.equal(r.ongewijzigd, 3, 'de tweede keer is het dezelfde klant, geen nieuwe');
      assert.equal((await store.listCustomers()).length, 3);
    });
  });
}
