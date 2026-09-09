import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { zoekPlaats, spreid, naamSleutel, aantalPlaatsen } from '../server/plaatsen.js';
import { dialecten, verseOmgeving } from './helpers.js';

describe('gemeente opzoeken', () => {
  test('de ingebouwde lijst is er en is niet leeggelopen', () => {
    assert.ok(aantalPlaatsen() > 1500, `slechts ${aantalPlaatsen()} plaatsen in de lijst`);
  });

  test('vindt gewone gemeenten', () => {
    for (const [gemeente, lat, lon] of [['Leuven', 50.88, 4.70], ['Zwevegem', 50.81, 3.34],
      ['Veurne', 51.07, 2.67], ['Turnhout', 51.32, 4.94]]) {
      const p = zoekPlaats(gemeente);
      assert.ok(p, `${gemeente} niet gevonden`);
      assert.ok(Math.abs(p.lat - lat) < 0.05 && Math.abs(p.lon - lon) < 0.05,
        `${gemeente} ligt op ${p.lat}, ${p.lon} in plaats van rond ${lat}, ${lon}`);
    }
  });

  test('trekt zich niets aan van hoofdletters, accenten of streepjes', () => {
    const goed = zoekPlaats('Leuven');
    for (const vorm of ['leuven', 'LEUVEN', '  Leuven  ']) {
      assert.deepEqual(zoekPlaats(vorm), goed, vorm);
    }
  });

  test('herkent fusiegemeenten aan een deel van hun naam', () => {
    for (const gemeente of ['Merelbeke-Melle', 'Nazareth-De Pinte', 'Puurs-Sint-Amands',
      'Beveren-Kruibeke-Zwijndrecht', 'Hamont-Achel']) {
      const p = zoekPlaats(gemeente);
      assert.ok(p, `${gemeente} niet gevonden`);
      assert.ok(p.lat > 49 && p.lat < 52 && p.lon > 2 && p.lon < 7, `${gemeente} ligt buiten België`);
    }
  });

  test('verzint niets bij een onbekende of lege gemeente', () => {
    for (const onzin of ['Onbestaandeplaats', '', null, '   ', 'xyz']) {
      assert.equal(zoekPlaats(onzin), null, JSON.stringify(onzin));
    }
  });

  test('alle plaatsen in de lijst liggen in België', () => {
    for (const gemeente of ['Aalst', 'Bastogne', 'Oostende', 'Eupen', 'Arlon']) {
      const p = zoekPlaats(gemeente);
      if (!p) continue;
      assert.ok(p.lat > 49.4 && p.lat < 51.6, `${gemeente}: breedtegraad ${p.lat}`);
      assert.ok(p.lon > 2.5 && p.lon < 6.5, `${gemeente}: lengtegraad ${p.lon}`);
    }
  });

  test('naamSleutel maakt namen vergelijkbaar', () => {
    assert.equal(naamSleutel('Sint-Niklaas'), naamSleutel('sint niklaas'));
    assert.equal(naamSleutel('Liège'), 'liege');
  });
});

describe('stippen uit elkaar leggen', () => {
  const basis = { lat: 51.0, lon: 4.0 };
  const meter = (a, b) => Math.hypot((a.lat - b.lat) * 111000, (a.lon - b.lon) * 70000);

  test('een klant die alleen in zijn gemeente zit blijft in het midden', () => {
    assert.deepEqual(spreid(basis, 42, 1), basis);
  });

  test('klanten in dezelfde gemeente vallen niet op elkaar', () => {
    const punten = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => spreid(basis, id, 8));
    for (let i = 0; i < punten.length; i++) {
      for (let j = i + 1; j < punten.length; j++) {
        assert.ok(meter(punten[i], punten[j]) > 50,
          `stippen ${i} en ${j} liggen maar ${Math.round(meter(punten[i], punten[j]))}m uit elkaar`);
      }
    }
  });

  test('de verschuiving blijft binnen de gemeente', () => {
    for (const id of [1, 7, 42, 153, 999]) {
      assert.ok(meter(spreid(basis, id, 10), basis) < 600,
        `klant ${id} wordt te ver verschoven`);
    }
  });

  test('dezelfde klant komt altijd op dezelfde plek', () => {
    assert.deepEqual(spreid(basis, 7, 5), spreid(basis, 7, 5));
  });
});

for (const dialect of dialecten('plaatsen')) {
  describe(`klanten op de kaart zetten op ${dialect.naam}`, () => {
    let store;
    let db;
    beforeEach(async () => { ({ store, db } = await verseOmgeving(dialect.opties)); });
    after(async () => { await db?.close(); });

    const maak = (naam, city) => store.createCustomer({ name: naam, city, postal_code: '9000' });

    test('plaatst iedereen zonder stip en meldt wie niet lukte', async () => {
      await maak('Alfa', 'Leuven');
      await maak('Beta', 'Zwevegem');
      await maak('Gamma', 'Onbestaandeplaats');
      await maak('Delta', '');

      const r = await store.plaatsOpKaart();
      assert.equal(r.geplaatst, 2);
      assert.deepEqual(r.nietGevonden.map((k) => k.naam).sort(), ['Delta', 'Gamma']);
      assert.equal((await store.listCustomers()).filter((k) => k.op_kaart).length, 2);
    });

    test('noteert dat de stip uit de gemeente komt', async () => {
      const k = (await maak('Alfa', 'Leuven')).value;
      await store.plaatsOpKaart();
      assert.equal((await store.getCustomer(k.id)).locatie_bron, 'gemeente');
    });

    test('raakt een stip die iemand zelf zette niet aan', async () => {
      const k = (await maak('Alfa', 'Leuven')).value;
      await store.updateCustomer(k.id, { lat: 51.2345, lon: 4.5678, locatie_bron: 'handmatig' });
      const r = await store.plaatsOpKaart();
      assert.equal(r.geplaatst, 0);
      const na = await store.getCustomer(k.id);
      assert.equal(na.lat, 51.2345, 'handmatig werk mag niet overschreven worden');
      assert.equal(na.locatie_bron, 'handmatig');
    });

    test('klanten in dezelfde gemeente krijgen elk hun eigen plek', async () => {
      for (const naam of ['Een', 'Twee', 'Drie']) await maak(naam, 'Leuven');
      await store.plaatsOpKaart();
      const punten = (await store.listCustomers()).map((k) => `${k.lat},${k.lon}`);
      assert.equal(new Set(punten).size, 3, 'de drie stippen vallen samen');
    });

    test('opnieuw uitvoeren verandert niets meer', async () => {
      await maak('Alfa', 'Leuven');
      await store.plaatsOpKaart();
      const voor = (await store.listCustomers())[0];
      const r = await store.plaatsOpKaart();
      assert.equal(r.geplaatst, 0);
      assert.equal((await store.listCustomers())[0].lat, voor.lat);
    });
  });
}
