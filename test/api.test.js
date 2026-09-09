import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../server/index.js';
import { dialecten, verseOmgeving, dagenTerug } from './helpers.js';

const nepGeocode = async (adres) => (
  adres.includes('Sleepstraat') ? { lat: 51.0596, lon: 3.7256, omschrijving: 'Gent' } : null);

for (const dialect of dialecten('api')) {
  describe(`API op ${dialect.naam}`, () => {
    let server;
    let basis;
    let omgeving;
    let cookie = '';

    before(async () => {
      omgeving = await verseOmgeving(dialect.opties);
      server = createServer(createApp({
        store: omgeving.store, auth: omgeving.auth, pogingen: omgeving.pogingen,
        instellingen: omgeving.instellingen,
        geocodeImpl: nepGeocode, veiligeCookie: false,
      }));
      await new Promise((r) => server.listen(0, r));
      basis = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
      server.close();
      await omgeving.db.close();
    });

    async function vraag(pad, opties = {}) {
      const res = await fetch(basis + pad, {
        ...opties,
        redirect: 'manual',
        headers: {
          ...(opties.body ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: opties.body ? JSON.stringify(opties.body) : undefined,
      });
      const gezet = res.headers.getSetCookie?.()[0];
      if (gezet) cookie = gezet.split(';')[0];
      const tekst = await res.text();
      let body = null;
      try { body = tekst ? JSON.parse(tekst) : null; } catch { body = tekst; }
      return { status: res.status, body, headers: res.headers };
    }

    const maak = (extra = {}) => vraag('/api/klanten', { method: 'POST', body: { name: 'Testklant', ...extra } });

    beforeEach(async () => {
      for (const t of ['customer_tags', 'tags', 'visits', 'customers']) await omgeving.db.exec(`DELETE FROM ${t}`);
    });

    describe('toegang', () => {
      test('zonder login is de API dicht', async () => {
        cookie = '';
        assert.equal((await vraag('/api/klanten')).status, 401);
        assert.equal((await vraag('/api/overzicht')).status, 401);
        assert.equal((await maak()).status, 401);
      });

      test('de app zelf stuurt een anonieme bezoeker naar de inlogpagina', async () => {
        cookie = '';
        const res = await fetch(basis, { redirect: 'manual' });
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), '/login');
      });

      test('de inlogpagina en haar bestanden zijn wel bereikbaar', async () => {
        cookie = '';
        for (const pad of ['/login', '/css/app.css', '/js/login.js', '/manifest.webmanifest', '/icon-192.png']) {
          assert.equal((await fetch(basis + pad)).status, 200, pad);
        }
      });

      test('de eerste gebruiker maakt zichzelf aan en is meteen ingelogd', async () => {
        cookie = '';
        assert.equal((await vraag('/api/sessie')).body.eerste_start, true);
        const r = await vraag('/api/gebruikers', {
          method: 'POST', body: { email: 'kobe@comsoltech.be', name: 'Kobe', wachtwoord: 'kaartenkobe2026' },
        });
        assert.equal(r.status, 201);
        assert.equal((await vraag('/api/sessie')).body.ingelogd, true);
        assert.equal((await vraag('/api/klanten')).status, 200);
      });

      test('daarna kan niemand zich meer zelf registreren', async () => {
        const bewaard = cookie;
        cookie = '';
        const r = await vraag('/api/gebruikers', {
          method: 'POST', body: { email: 'indringer@elders.be', wachtwoord: 'binnenglippen1' },
        });
        assert.equal(r.status, 401);
        cookie = bewaard;
      });

      test('inloggen met een fout wachtwoord geeft 401', async () => {
        const bewaard = cookie;
        cookie = '';
        const r = await vraag('/api/sessie', {
          method: 'POST', body: { email: 'kobe@comsoltech.be', wachtwoord: 'verkeerd' },
        });
        assert.equal(r.status, 401);
        cookie = bewaard;
      });

      test('de sessiecookie is niet leesbaar voor JavaScript', async () => {
        cookie = '';
        const res = await fetch(`${basis}/api/sessie`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'kobe@comsoltech.be', wachtwoord: 'kaartenkobe2026' }),
        });
        const gezet = res.headers.getSetCookie()[0];
        assert.match(gezet, /HttpOnly/);
        assert.match(gezet, /SameSite=Lax/);
        cookie = gezet.split(';')[0];
      });

      test('een collega toevoegen en weer intrekken', async () => {
        const r = await vraag('/api/gebruikers', {
          method: 'POST', body: { email: 'collega@comsoltech.be', name: 'Collega', wachtwoord: 'onderwegopdebaan' },
        });
        assert.equal(r.status, 201);
        assert.equal((await vraag('/api/gebruikers')).body.length, 2);
        assert.equal((await vraag(`/api/gebruikers/${r.body.id}`, { method: 'DELETE' })).status, 200);
        assert.equal((await vraag('/api/gebruikers')).body.length, 1);
      });

      test('de laatste gebruiker kan zichzelf niet buitensluiten', async () => {
        const ik = (await vraag('/api/gebruikers')).body[0];
        const r = await vraag(`/api/gebruikers/${ik.id}`, { method: 'DELETE' });
        assert.equal(r.status, 422);
        assert.match(r.body.errors[0], /laatste gebruiker/);
      });

      test('uitloggen maakt de sessie ongeldig', async () => {
        const bewaard = cookie;
        await vraag('/api/sessie', { method: 'DELETE' });
        cookie = bewaard;
        assert.equal((await vraag('/api/klanten')).status, 401);
        cookie = '';
        await vraag('/api/sessie', {
          method: 'POST', body: { email: 'kobe@comsoltech.be', wachtwoord: 'kaartenkobe2026' },
        });
        assert.equal((await vraag('/api/klanten')).status, 200);
      });
    });

    describe('klanten', () => {
      test('aanmaken geeft 201 met stip, kleurgroep en provincie', async () => {
        const r = await maak({ lat: '51.0596', lon: '3.7256', postal_code: '9000', tags: 'melkvee, gent' });
        assert.equal(r.status, 201);
        assert.equal(r.body.op_kaart, true);
        assert.equal(r.body.bucket, 'nieuw', 'zonder bezoek hoort een klant blauw te zijn');
        assert.equal(r.body.provincie, 'Oost-Vlaanderen');
        assert.deepEqual(r.body.tags, ['gent', 'melkvee']);
      });

      test('ongeldige invoer geeft 422 met bruikbare meldingen', async () => {
        const r = await maak({ name: '', email: 'fout', lat: '999', lon: '3' });
        assert.equal(r.status, 422);
        assert.equal(r.body.errors.length, 3);
      });

      test('filteren op kleurgroep en regio', async () => {
        const { body: a } = await maak({ name: 'Alfa', postal_code: '9000', lat: 51, lon: 3.7 });
        await vraag(`/api/klanten/${a.id}/bezoeken`, {
          method: 'POST', body: { visit_date: dagenTerug(3), notes: 'Langsgeweest' },
        });
        await maak({ name: 'Beta', postal_code: '3500', lat: 50.9, lon: 5.3 });

        assert.equal((await vraag('/api/klanten?bucket=recent')).body[0].name, 'Alfa');
        assert.equal((await vraag('/api/klanten?provincie=Limburg')).body[0].name, 'Beta');
        assert.equal((await vraag('/api/klanten?provincie=Limburg&bucket=recent')).body.length, 0);
      });

      test('onbekende klant geeft overal 404', async () => {
        assert.equal((await vraag('/api/klanten/9999')).status, 404);
        assert.equal((await vraag('/api/klanten/9999', { method: 'PATCH', body: { city: 'X' } })).status, 404);
        assert.equal((await vraag('/api/klanten/9999', { method: 'DELETE' })).status, 404);
      });
    });

    describe('bezoeken', () => {
      test('een bezoek noteren maakt de klant groen en onthoudt wie het schreef', async () => {
        const { body: k } = await maak();
        const r = await vraag(`/api/klanten/${k.id}/bezoeken`, {
          method: 'POST',
          body: { visit_date: dagenTerug(2), with_whom: 'Peter', notes: 'Nieuwe Type B voorraad besproken' },
        });
        assert.equal(r.status, 201);
        const { body: dossier } = await vraag(`/api/klanten/${k.id}`);
        assert.equal(dossier.bucket, 'recent');
        assert.equal(dossier.visits[0].with_whom, 'Peter');
        assert.equal(dossier.visits[0].author, 'Kobe');
      });

      test('een leeg of toekomstig bezoek wordt geweigerd', async () => {
        const { body: k } = await maak();
        assert.equal((await vraag(`/api/klanten/${k.id}/bezoeken`, { method: 'POST', body: {} })).status, 422);
        assert.equal((await vraag(`/api/klanten/${k.id}/bezoeken`, {
          method: 'POST', body: { notes: 'x', visit_date: '2099-01-01' },
        })).status, 422);
      });
    });

    describe('overzicht, import en export', () => {
      test('overzicht voedt de filters', async () => {
        await maak({ postal_code: '8800', tags: 'voeders' });
        const { body } = await vraag('/api/overzicht');
        assert.equal(body.tellingen.totaal, 1);
        assert.deepEqual(body.tellingen.per_provincie, [['West-Vlaanderen', 1]]);
        assert.ok(body.provincies.includes('Limburg'));
        assert.equal(body.gebruiker.email, 'kobe@comsoltech.be');
      });

      test('import is herhaalbaar via de API', async () => {
        const csv = 'CRM-id;Bedrijf;Postcode\nCRM-9;Hoeve Test;3500';
        const eerste = await vraag('/api/klanten/import', { method: 'POST', body: { csv } });
        assert.equal(eerste.body.nieuw, 1);
        const tweede = await vraag('/api/klanten/import', { method: 'POST', body: { csv } });
        assert.equal(tweede.body.ongewijzigd, 1);
        assert.equal((await vraag('/api/klanten')).body.length, 1);
      });

      test('export bevat CRM-id, provincie en bezoekgegevens', async () => {
        const { body: k } = await maak({ external_id: 'CRM-7', postal_code: '8800', lat: 51, lon: 3 });
        await vraag(`/api/klanten/${k.id}/bezoeken`, {
          method: 'POST', body: { visit_date: dagenTerug(1), notes: 'Langsgeweest' },
        });
        const res = await fetch(`${basis}/api/klanten/export.csv`, { headers: { cookie } });
        const tekst = await res.text();
        assert.match(res.headers.get('content-type'), /text\/csv/);
        assert.match(tekst, /CRM-id;Naam/);
        assert.match(tekst, /West-Vlaanderen/);
        assert.match(tekst, new RegExp(dagenTerug(1)));
      });

      test('kleurgrenzen aanpassen via de API kleurt de kaart opnieuw', async () => {
        const { body: k } = await maak({ name: 'Vier maanden stil' });
        await vraag(`/api/klanten/${k.id}/bezoeken`, {
          method: 'POST', body: { visit_date: dagenTerug(120), notes: 'Lang geleden' },
        });
        assert.equal((await vraag(`/api/klanten/${k.id}`)).body.bucket, 'lang');

        const gezet = await vraag('/api/instellingen', {
          method: 'PATCH', body: { drempel_recent: 30, drempel_tijdje: 180 },
        });
        assert.equal(gezet.status, 200);
        assert.equal(gezet.body.drempel_tijdje, 180);

        assert.equal((await vraag(`/api/klanten/${k.id}`)).body.bucket, 'tijdje');
        assert.deepEqual((await vraag('/api/overzicht')).body.drempels, { recent: 30, tijdje: 180 });

        await vraag('/api/instellingen', { method: 'PATCH', body: { drempel_recent: 30, drempel_tijdje: 90 } });
      });

      test('een onmogelijke grens wordt geweigerd', async () => {
        const r = await vraag('/api/instellingen', {
          method: 'PATCH', body: { drempel_recent: 200, drempel_tijdje: 100 },
        });
        assert.equal(r.status, 422);
        assert.deepEqual((await vraag('/api/instellingen')).body,
          { drempel_recent: 30, drempel_tijdje: 90 }, 'de oude waarden blijven staan');
      });

      test('instellingen zitten achter de login', async () => {
        const bewaard = cookie;
        cookie = '';
        assert.equal((await vraag('/api/instellingen')).status, 401);
        assert.equal((await vraag('/api/instellingen', {
          method: 'PATCH', body: { drempel_tijdje: 900 },
        })).status, 401);
        cookie = bewaard;
      });

      test('geocoder geeft coördinaten of een nette melding', async () => {
        const goed = await vraag('/api/geocode', { method: 'POST', body: { adres: 'Sleepstraat 42, Gent' } });
        assert.equal(goed.body.lat, 51.0596);
        const mis = await vraag('/api/geocode', { method: 'POST', body: { adres: 'Nergensstraat 1, Atlantis' } });
        assert.equal(mis.status, 200);
        assert.equal(mis.body.gevonden, false);
      });
    });

    describe('robuustheid', () => {
      test('kapotte JSON geeft 400, geen 500', async () => {
        const res = await fetch(`${basis}/api/klanten`, {
          method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{niet echt json',
        });
        assert.equal(res.status, 400);
      });

      test('onbekend pad geeft 404 en een foute methode 405', async () => {
        assert.equal((await vraag('/api/bestaatniet')).status, 404);
        const { body: k } = await maak();
        assert.equal((await vraag(`/api/klanten/${k.id}`, { method: 'POST', body: {} })).status, 405);
      });

      test('kan niet buiten de publieke map lezen', async () => {
        const tekst = await (await fetch(`${basis}/../server/db.js`, { headers: { cookie } })).text();
        assert.ok(!tekst.includes('DatabaseSync'), 'serverbestand mag nooit uitgeleverd worden');
      });
    });
  });
}
