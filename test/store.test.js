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

    describe('contactpersonen', () => {
      test('een bedrijf kan er meerdere hebben, op naam gesorteerd', async () => {
        const k = await maak({ contact_name: 'Johan Dewaegeneer', email: 'johan@jandenul.com' });
        await store.addContact(k.id, { name: 'Piet Janssens', functie: 'technieker', phone: '0470 11 22 33' });
        await store.addContact(k.id, { name: 'An De Clercq', functie: 'boekhouding' });

        const dossier = await store.getCustomer(k.id);
        assert.deepEqual(dossier.contacten.map((c) => c.name), ['An De Clercq', 'Piet Janssens']);
        assert.equal(dossier.contact_name, 'Johan Dewaegeneer',
          'het hoofdcontact uit het CRM blijft waar het stond');
      });

      test('alleen de naam is verplicht', async () => {
        const k = await maak();
        assert.equal((await store.addContact(k.id, { name: 'Piet' })).ok, true);
        const leeg = await store.addContact(k.id, { name: '  ', phone: '0470' });
        assert.equal(leeg.ok, false);
        assert.match(leeg.errors[0], /verplicht/);
      });

      test('een ongeldig e-mailadres wordt geweigerd', async () => {
        const k = await maak();
        const r = await store.addContact(k.id, { name: 'Piet', email: 'geen adres' });
        assert.equal(r.ok, false);
        assert.equal((await store.getCustomer(k.id)).contacten.length, 0);
      });

      test('bijwerken raakt alleen aan wat je meestuurt', async () => {
        const k = await maak();
        const c = (await store.addContact(k.id,
          { name: 'Piet Janssens', functie: 'technieker', phone: '0470 11 22 33' })).value;

        await store.updateContact(c.id, { phone: '0470 99 88 77' });
        const [na] = (await store.getCustomer(k.id)).contacten;
        assert.equal(na.phone, '0470 99 88 77');
        assert.equal(na.functie, 'technieker', 'wat je niet meestuurt hoort te blijven staan');
        assert.equal(na.id, c.id);
      });

      test('verwijderen laat de klant en de andere contacten met rust', async () => {
        const k = await maak();
        const a = (await store.addContact(k.id, { name: 'Piet' })).value;
        await store.addContact(k.id, { name: 'An' });
        assert.equal(await store.deleteContact(a.id), true);
        assert.deepEqual((await store.getCustomer(k.id)).contacten.map((c) => c.name), ['An']);
        assert.equal(await store.deleteContact(a.id), false, 'twee keer verwijderen is geen fout');
      });

      test('een klant verwijderen neemt zijn contactpersonen mee', async () => {
        const k = await maak();
        await store.addContact(k.id, { name: 'Piet' });
        await store.deleteCustomer(k.id);
        assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM contacts')).n), 0);
      });

      test('zoeken vindt een klant op de naam of functie van een contactpersoon', async () => {
        const k = await maak({ name: 'Jan De Nul nv', city: 'Aalst' });
        await maak({ name: 'Andere Firma', city: 'Gent' });
        await store.addContact(k.id, { name: 'Piet Janssens', functie: 'technieker' });

        assert.deepEqual((await store.listCustomers({ q: 'janssens' })).map((c) => c.name), ['Jan De Nul nv']);
        assert.deepEqual((await store.listCustomers({ q: 'TECHNIEKER' })).map((c) => c.name), ['Jan De Nul nv']);
        assert.equal((await store.listCustomers({ q: 'bestaatniet' })).length, 0);
      });
    });

    describe('bezoeken bepalen de kleur', () => {
      test('zonder bezoek is een klant blauw, niet rood', async () => {
        assert.equal((await maak()).bucket, 'nieuw');
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

      test('kiest het formulier een collega, dan wint die van wie ingelogd is', async () => {
        const k = await maak();
        await store.addVisit(k.id, { notes: 'Ik werk de week van mijn collega bij', author: 'Wim' }, 'Kobe');
        assert.equal((await store.getCustomer(k.id)).visits[0].author, 'Wim');
      });

      describe('een genoteerd bezoek rechtzetten', () => {
        test('past aan wat je meestuurt en laat de rest staan', async () => {
          const k = await maak();
          const b = (await store.addVisit(k.id,
            { visit_date: dagenTerug(7), with_whom: 'EGD', notes: 'Type B besporken' }, 'Kobe')).value;

          const r = await store.updateVisit(b.id, { notes: 'Type B besproken' }, 'Kobe');
          assert.equal(r.ok, true);
          const na = (await store.getCustomer(k.id)).visits[0];
          assert.equal(na.notes, 'Type B besproken');
          assert.equal(na.with_whom, 'EGD', 'wat je niet meestuurt hoort te blijven staan');
          assert.equal(na.visit_date, dagenTerug(7));
          assert.equal(na.author, 'Kobe');
          assert.equal(na.id, b.id, 'het bezoek hoort hetzelfde bezoek te blijven');
        });

        test('een verbeterde datum verandert meteen de kleur van de klant', async () => {
          const k = await maak();
          const b = (await store.addVisit(k.id, { visit_date: dagenTerug(400), notes: 'x' })).value;
          assert.equal((await store.getCustomer(k.id)).bucket, 'lang');
          await store.updateVisit(b.id, { visit_date: dagenTerug(3) });
          assert.equal((await store.getCustomer(k.id)).bucket, 'recent');
        });

        test('kan de collega rechtzetten die er geweest is', async () => {
          const k = await maak();
          const b = (await store.addVisit(k.id, { notes: 'x' }, 'Kobe')).value;
          await store.updateVisit(b.id, { author: 'Wim' }, 'Kobe');
          assert.equal((await store.getCustomer(k.id)).visits[0].author, 'Wim');
        });

        test('weigert een bezoek in de toekomst en laat het oude staan', async () => {
          const k = await maak();
          const b = (await store.addVisit(k.id, { visit_date: dagenTerug(7), notes: 'x' })).value;
          const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
          const r = await store.updateVisit(b.id, { visit_date: morgen });
          assert.equal(r.ok, false);
          assert.equal((await store.getCustomer(k.id)).visits[0].visit_date, dagenTerug(7),
            'een geweigerde wijziging hoort niets te veranderen');
        });

        test('een bezoek dat niet bestaat geeft notFound, geen stille mislukking', async () => {
          const r = await store.updateVisit(999999, { notes: 'x' });
          assert.equal(r.notFound, true);
          assert.ok(!r.ok);
        });

        test('verhuist het bezoek niet naar een andere klant', async () => {
          const a = await maak({ name: 'Hoeve A' });
          const b2 = await maak({ name: 'Hoeve B' });
          const bez = (await store.addVisit(a.id, { notes: 'bij A' })).value;
          await store.updateVisit(bez.id, { notes: 'nog steeds bij A', customer_id: b2.id });
          assert.equal((await store.getCustomer(a.id)).visits.length, 1);
          assert.equal((await store.getCustomer(b2.id)).visits.length, 0);
        });
      });

      test('een bezoek verwijderen zet de kleur terug', async () => {
        const k = await maak();
        const b = (await store.addVisit(k.id, { visit_date: dagenTerug(2), notes: 'x' })).value;
        assert.equal((await store.getCustomer(k.id)).bucket, 'recent');
        assert.equal(await store.deleteVisit(b.id), true);
        assert.equal((await store.getCustomer(k.id)).bucket, 'nieuw',
          'zonder bezoeken valt een klant terug naar de nieuw-groep');
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
        assert.deepEqual((await store.listCustomers({ bucket: 'nieuw' })).map((k) => k.name), ['Hoeve Gamma']);
        assert.deepEqual((await store.listCustomers({ bucket: 'lang' })).map((k) => k.name), ['Hoeve Beta']);
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
        assert.equal(t.nieuw, 1, 'Hoeve Gamma is nooit bezocht');
        assert.equal(t.recent, 1);
        assert.equal(t.lang, 1, 'Hoeve Beta is lang geleden bezocht');
        assert.equal(t.zonder_stip, 1);
        assert.deepEqual(t.per_provincie.sort(), [['Limburg', 1], ['Oost-Vlaanderen', 2]].sort());
      });
    });

    describe('voorbeelddata', () => {
      test('seed levert klanten in alle vier de kleurgroepen', async () => {
        assert.equal(await seed(store, { stil: true }), 9);
        const t = await store.tellingen();
        assert.ok(t.nieuw > 0 && t.recent > 0 && t.tijdje > 0 && t.lang > 0, JSON.stringify(t));
        assert.equal(t.zonder_stip, 1);
      });
    });
  });
}

/**
 * Nooit bezocht is iets anders dan lang niet bezocht. Een klant die vorige week uit
 * het CRM kwam verdient geen rode vlag; een klant waar je in twee jaar niet geweest
 * bent wel. Deze tests bewaken dat onderscheid.
 */
for (const dialect of dialecten('nieuwe-klanten')) {
  describe(`nooit bezocht als eigen groep op ${dialect.naam}`, () => {
    let store;
    let db;
    beforeEach(async () => { ({ store, db } = await verseOmgeving(dialect.opties)); });
    after(async () => { await db?.close(); });

    const maak = async (naam) => (await store.createCustomer({ name: naam })).value;

    test('een verse klant is blauw, een verwaarloosde rood', async () => {
      const vers = await maak('Vers');
      const oud = await maak('Oud');
      await store.addVisit(oud.id, { visit_date: dagenTerug(500), notes: 'Lang geleden' });

      assert.equal((await store.getCustomer(vers.id)).bucket, 'nieuw');
      assert.equal((await store.getCustomer(oud.id)).bucket, 'lang');
    });

    test('het eerste bezoek haalt een klant uit de blauwe groep', async () => {
      const k = await maak('Alfa');
      assert.equal((await store.getCustomer(k.id)).bucket, 'nieuw');
      await store.addVisit(k.id, { visit_date: dagenTerug(2), notes: 'Eerste bezoek' });
      assert.equal((await store.getCustomer(k.id)).bucket, 'recent');
    });

    test('het laatste bezoek wissen zet een klant terug op blauw', async () => {
      const k = await maak('Alfa');
      const b = (await store.addVisit(k.id, { visit_date: dagenTerug(2), notes: 'x' })).value;
      await store.deleteVisit(b.id);
      assert.equal((await store.getCustomer(k.id)).bucket, 'nieuw');
    });

    test('een oud bezoek houdt de klant rood, ook al is er maar één', async () => {
      const k = await maak('Alfa');
      await store.addVisit(k.id, { visit_date: dagenTerug(400), notes: 'Ooit' });
      assert.equal((await store.getCustomer(k.id)).bucket, 'lang');
    });

    test('de blauwe groep is apart te filteren en te tellen', async () => {
      await maak('Nooit een');
      await maak('Nooit twee');
      const bezocht = await maak('Wel bezocht');
      await store.addVisit(bezocht.id, { visit_date: dagenTerug(1), notes: 'x' });

      assert.deepEqual((await store.listCustomers({ bucket: 'nieuw' })).map((k) => k.name).sort(),
        ['Nooit een', 'Nooit twee']);
      const t = await store.tellingen();
      assert.equal(t.nieuw, 2);
      assert.equal(t.recent, 1);
      assert.equal(t.lang, 0, 'niemand is hier verwaarloosd');
    });

    test('de kleurgrenzen veranderen niets aan wie nooit bezocht is', async () => {
      await maak('Nooit');
      for (const grenzen of [{ drempel_recent: 7, drempel_tijdje: 14 },
        { drempel_recent: 300, drempel_tijdje: 3000 }]) {
        await store.instellingen.zet(grenzen);
        assert.equal((await store.listCustomers())[0].bucket, 'nieuw', JSON.stringify(grenzen));
      }
    });
  });
}
