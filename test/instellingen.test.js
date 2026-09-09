import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { validateDrempels, STANDAARD } from '../server/instellingen.js';
import { bucketVoor } from '../server/validate.js';
import { dialecten, verseOmgeving, dagenTerug } from './helpers.js';

describe('drempels controleren', () => {
  test('een geldige aanpassing komt door', () => {
    const r = validateDrempels({ drempel_recent: 60, drempel_tijdje: 180 });
    assert.deepEqual(r.value, { drempel_recent: 60, drempel_tijdje: 180 });
  });

  test('oranje moet verder liggen dan groen', () => {
    assert.equal(validateDrempels({ drempel_recent: 90, drempel_tijdje: 30 }).ok, false);
    assert.equal(validateDrempels({ drempel_recent: 30, drempel_tijdje: 30 }).ok, false);
  });

  test('nul of negatieve dagen worden geweigerd', () => {
    assert.equal(validateDrempels({ drempel_recent: 0, drempel_tijdje: 90 }).ok, false);
    assert.equal(validateDrempels({ drempel_recent: -5, drempel_tijdje: 90 }).ok, false);
  });

  test('geen getal, komma of oneindig wordt geweigerd', () => {
    for (const rommel of ['veel', '30,5', '', null, Infinity, '30.5']) {
      assert.equal(validateDrempels({ drempel_recent: rommel, drempel_tijdje: 90 }).ok, false, String(rommel));
    }
  });

  test('meer dan tien jaar heeft geen zin', () => {
    assert.equal(validateDrempels({ drempel_recent: 30, drempel_tijdje: 3650 }).ok, true);
    assert.equal(validateDrempels({ drempel_recent: 30, drempel_tijdje: 3651 }).ok, false);
  });

  test('één grens aanpassen laat de andere staan', () => {
    const r = validateDrempels({ drempel_tijdje: 180 }, STANDAARD);
    assert.deepEqual(r.value, { drempel_recent: STANDAARD.drempel_recent, drempel_tijdje: 180 });
  });
});

describe('kleurgroep met eigen grenzen', () => {
  const nu = new Date('2026-09-06T12:00:00Z');
  const zesMaanden = { recent: 30, tijdje: 180 };

  test('met de standaardgrenzen is 100 dagen rood', () => {
    assert.equal(bucketVoor('2026-05-29', nu), 'lang');
  });

  test('met rood pas na zes maanden is diezelfde klant oranje', () => {
    assert.equal(bucketVoor('2026-05-29', nu, zesMaanden), 'tijdje');
  });

  test('nooit bezocht blijft blauw, welke grens je ook kiest', () => {
    assert.equal(bucketVoor(null, nu, zesMaanden), 'nieuw');
    assert.equal(bucketVoor(null, nu, { recent: 3000, tijdje: 3600 }), 'nieuw');
  });
});

for (const dialect of dialecten('instellingen')) {
  describe(`instellingen op ${dialect.naam}`, () => {
    let store;
    let instellingen;
    let db;

    beforeEach(async () => { ({ store, instellingen, db } = await verseOmgeving(dialect.opties)); });
    after(async () => { await db?.close(); });

    test('zonder aanpassing gelden de standaardwaarden', async () => {
      assert.deepEqual(await instellingen.alles(), STANDAARD);
      assert.deepEqual(await instellingen.drempels(), { recent: 30, tijdje: 90 });
    });

    test('een aanpassing wordt bewaard en overleeft een nieuwe verbinding', async () => {
      await instellingen.zet({ drempel_recent: 60, drempel_tijdje: 180 }, 'Kobe');
      assert.deepEqual(await instellingen.drempels(), { recent: 60, tijdje: 180 });
      const rij = await db.get('SELECT updated_by FROM settings WHERE sleutel = ?', ['drempel_recent']);
      assert.equal(rij.updated_by, 'Kobe', 'er hoort te staan wie het wijzigde');
    });

    test('twee keer opslaan maakt geen dubbele rijen', async () => {
      await instellingen.zet({ drempel_tijdje: 180 });
      await instellingen.zet({ drempel_tijdje: 200 });
      const n = Number((await db.get('SELECT COUNT(*) AS n FROM settings')).n);
      assert.equal(n, 2, 'twee sleutels, niet vier rijen');
      assert.equal((await instellingen.drempels()).tijdje, 200);
    });

    test('een ongeldige aanpassing verandert niets', async () => {
      await instellingen.zet({ drempel_recent: 30, drempel_tijdje: 90 });
      const r = await instellingen.zet({ drempel_recent: 200, drempel_tijdje: 100 });
      assert.equal(r.ok, false);
      assert.deepEqual(await instellingen.drempels(), { recent: 30, tijdje: 90 });
    });

    test('de kleuren op de kaart verschuiven mee', async () => {
      const k = (await store.createCustomer({ name: 'Hoeve Test' })).value;
      await store.addVisit(k.id, { visit_date: dagenTerug(120), notes: 'Vier maanden geleden' });

      assert.equal((await store.getCustomer(k.id)).bucket, 'lang', 'met 90 dagen is dit rood');
      assert.equal((await store.listCustomers())[0].bucket, 'lang');
      assert.equal((await store.tellingen()).lang, 1);

      await instellingen.zet({ drempel_recent: 30, drempel_tijdje: 180 }, 'Kobe');

      assert.equal((await store.getCustomer(k.id)).bucket, 'tijdje', 'met 180 dagen is dit oranje');
      assert.equal((await store.listCustomers())[0].bucket, 'tijdje');
      const t = await store.tellingen();
      assert.equal(t.tijdje, 1);
      assert.equal(t.lang, 0);
      assert.deepEqual(t.drempels, { recent: 30, tijdje: 180 });
    });

    test('het filter op kleurgroep volgt de nieuwe grenzen', async () => {
      const k = (await store.createCustomer({ name: 'Hoeve Test' })).value;
      await store.addVisit(k.id, { visit_date: dagenTerug(120), notes: 'x' });

      assert.equal((await store.listCustomers({ bucket: 'lang' })).length, 1);
      assert.equal((await store.listCustomers({ bucket: 'tijdje' })).length, 0);

      await instellingen.zet({ drempel_tijdje: 180 });

      assert.equal((await store.listCustomers({ bucket: 'lang' })).length, 0);
      assert.equal((await store.listCustomers({ bucket: 'tijdje' })).length, 1);
    });

    test('er gaan geen klant- of bezoekgegevens verloren bij een aanpassing', async () => {
      const k = (await store.createCustomer({ name: 'Hoeve Test', notes: 'Belangrijk' })).value;
      await store.addVisit(k.id, { visit_date: dagenTerug(120), with_whom: 'Peter', notes: 'Voorraad' });
      await instellingen.zet({ drempel_recent: 7, drempel_tijdje: 14 });
      const na = await store.getCustomer(k.id);
      assert.equal(na.notes, 'Belangrijk');
      assert.equal(na.visits.length, 1);
      assert.equal(na.visits[0].with_whom, 'Peter');
    });
  });
}
