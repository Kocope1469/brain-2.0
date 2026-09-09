import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../server/index.js';
import { hashToken, MAX_PER_ACCOUNT } from '../server/beveiliging.js';
import { hashWachtwoord, klopWachtwoord } from '../server/auth.js';
import { dialecten, verseOmgeving } from './helpers.js';

for (const dialect of dialecten('beveiliging')) {
  describe(`beveiliging op ${dialect.naam}`, () => {
    let server;
    let basis;
    let omgeving;

    const GEBRUIKER = { email: 'kobe@comsoltech.be', name: 'Kobe', wachtwoord: 'kaartenkobe2026' };

    before(async () => {
      omgeving = await verseOmgeving(dialect.opties);
      server = createServer(createApp({
        store: omgeving.store, auth: omgeving.auth, pogingen: omgeving.pogingen,
        instellingen: omgeving.instellingen, veiligeCookie: false,
      }));
      await new Promise((r) => server.listen(0, r));
      basis = `http://127.0.0.1:${server.address().port}`;
      await omgeving.auth.maakGebruiker(GEBRUIKER);
    });

    after(async () => {
      server.close();
      await omgeving.db.close();
    });

    const inloggen = (wachtwoord, extraHeaders = {}) => fetch(`${basis}/api/sessie`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extraHeaders },
      body: JSON.stringify({ email: GEBRUIKER.email, wachtwoord }),
    });

    describe('wachtwoorden', () => {
      test('worden nooit leesbaar bewaard', async () => {
        const rij = await omgeving.db.get('SELECT password_hash FROM users WHERE email = ?', [GEBRUIKER.email]);
        assert.ok(!rij.password_hash.includes(GEBRUIKER.wachtwoord));
        assert.match(rij.password_hash, /^scrypt\$/);
      });

      test('twee keer hetzelfde wachtwoord geeft twee verschillende hashes', async () => {
        const [a, b] = await Promise.all([hashWachtwoord('zelfde-wachtwoord'), hashWachtwoord('zelfde-wachtwoord')]);
        assert.notEqual(a, b, 'zonder eigen salt zou een lek alle gelijke wachtwoorden verraden');
        assert.equal(await klopWachtwoord('zelfde-wachtwoord', a), true);
        assert.equal(await klopWachtwoord('zelfde-wachtwoord', b), true);
      });

      test('een beschadigde of lege hash geeft geen toegang', async () => {
        for (const rommel of ['', 'onzin', 'scrypt$$', null]) {
          assert.equal(await klopWachtwoord('wat dan ook', rommel), false);
        }
      });
    });

    describe('sessies', () => {
      test('in de database staat alleen de hash van het token', async () => {
        const res = await inloggen(GEBRUIKER.wachtwoord);
        const token = res.headers.getSetCookie()[0].split('=')[1].split(';')[0];
        const rij = await omgeving.db.get('SELECT token FROM sessions WHERE token = ?', [hashToken(token)]);
        assert.ok(rij, 'de sessie hoort onder zijn hash te staan');
        assert.equal(await omgeving.db.get('SELECT token FROM sessions WHERE token = ?', [token]), null,
          'het onbewerkte token mag nergens in de database staan');
      });

      test('het token uit de database geeft zelf geen toegang', async () => {
        const rij = await omgeving.db.get('SELECT token FROM sessions LIMIT 1');
        const res = await fetch(`${basis}/api/klanten`, { headers: { cookie: `kk_sessie=${rij.token}` } });
        assert.equal(res.status, 401, 'wie de database leest mag daarmee niet kunnen inloggen');
      });

      test('een verzonnen token wordt geweigerd', async () => {
        const res = await fetch(`${basis}/api/klanten`, { headers: { cookie: 'kk_sessie=zelfverzonnen' } });
        assert.equal(res.status, 401);
      });

      test('een vervallen sessie werkt niet meer', async () => {
        const res = await inloggen(GEBRUIKER.wachtwoord);
        const token = res.headers.getSetCookie()[0].split('=')[1].split(';')[0];
        await omgeving.db.run('UPDATE sessions SET expires_at = ? WHERE token = ?',
          ['2020-01-01 00:00:00', hashToken(token)]);
        const na = await fetch(`${basis}/api/klanten`, { headers: { cookie: `kk_sessie=${token}` } });
        assert.equal(na.status, 401);
      });
    });

    describe('wachtwoorden raden', () => {
      test('na een reeks mislukte pogingen gaat de deur op slot', async () => {
        await omgeving.db.exec('DELETE FROM login_attempts');
        let laatste;
        for (let i = 0; i < MAX_PER_ACCOUNT + 1; i++) laatste = await inloggen('fout-wachtwoord');
        assert.equal(laatste.status, 429, 'raden hoort na een aantal pogingen geblokkeerd te worden');
        assert.ok((await laatste.json()).errors[0].includes('Te veel'));
        assert.ok(Number(laatste.headers.get('retry-after')) > 0);
      });

      test('ook het juiste wachtwoord komt er tijdens de blokkade niet door', async () => {
        const res = await inloggen(GEBRUIKER.wachtwoord);
        assert.equal(res.status, 429);
      });

      test('na het opruimen van oude pogingen kun je weer inloggen', async () => {
        await omgeving.db.exec('DELETE FROM login_attempts');
        const res = await inloggen(GEBRUIKER.wachtwoord);
        assert.equal(res.status, 200);
      });

      test('een geslaagde aanmelding wist de teller', async () => {
        await omgeving.db.exec('DELETE FROM login_attempts');
        for (let i = 0; i < 3; i++) await inloggen('fout-wachtwoord');
        await inloggen(GEBRUIKER.wachtwoord);
        const n = Number((await omgeving.db.get('SELECT COUNT(*) AS n FROM login_attempts')).n);
        assert.equal(n, 0);
      });
    });

    describe('headers', () => {
      test('elke pagina draagt de beveiligingsheaders', async () => {
        for (const pad of ['/login', '/api/sessie']) {
          const res = await fetch(basis + pad);
          assert.equal(res.headers.get('x-content-type-options'), 'nosniff', pad);
          assert.equal(res.headers.get('x-frame-options'), 'DENY', pad);
          assert.match(res.headers.get('referrer-policy'), /same-origin/, pad);
        }
      });

      test('de contentbeleidsregel laat alleen eigen scripts en OSM-tegels toe', async () => {
        const csp = (await fetch(`${basis}/login`)).headers.get('content-security-policy');
        assert.match(csp, /script-src 'self'/);
        assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'inline scripts horen verboden te blijven');
        assert.match(csp, /img-src[^;]*tile\.openstreetmap\.org/);
        assert.match(csp, /frame-ancestors 'none'/);
        assert.match(csp, /object-src 'none'/);
      });
    });

    describe('afgeschermde gegevens', () => {
      test('zonder aanmelding komt er geen enkele klantgegeven naar buiten', async () => {
        await omgeving.store.createCustomer({ name: 'Geheime Hoeve', city: 'Gent' });
        for (const pad of ['/api/klanten', '/api/overzicht', '/api/klanten/export.csv', '/api/gebruikers']) {
          const res = await fetch(basis + pad);
          assert.equal(res.status, 401, pad);
          assert.ok(!(await res.text()).includes('Geheime Hoeve'), `${pad} lekte klantgegevens`);
        }
      });

      test('een onbekend e-mailadres krijgt dezelfde melding als een fout wachtwoord', async () => {
        await omgeving.db.exec('DELETE FROM login_attempts');
        const onbekend = await fetch(`${basis}/api/sessie`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'bestaatniet@nergens.be', wachtwoord: 'iets' }),
        });
        const bekend = await inloggen('fout-wachtwoord');
        assert.equal(onbekend.status, bekend.status);
        assert.deepEqual(await onbekend.json(), await bekend.json(),
          'het antwoord mag niet verraden welke adressen bestaan');
      });
    });
  });
}

/**
 * Op Vercel worden de bestanden in public/ rechtstreeks van het CDN geserveerd en
 * gaan ze dus niet door onze server. De headers staan daarom óók in vercel.json.
 * Deze test bewaakt dat die twee niet uit elkaar lopen.
 */
describe('headers op het hostingplatform', () => {
  test('vercel.json zet dezelfde beveiligingsheaders als de server', async () => {
    const { readFile } = await import('node:fs/promises');
    const { HEADERS } = await import('../server/beveiliging.js');
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

    const regel = config.headers?.find((h) => h.source === '/(.*)');
    assert.ok(regel, 'er hoort een headerregel voor alle paden te staan');
    const platform = Object.fromEntries(regel.headers.map((h) => [h.key, h.value]));

    for (const [naam, waarde] of Object.entries(HEADERS)) {
      assert.equal(platform[naam], waarde, `${naam} verschilt tussen server en vercel.json`);
    }
    assert.match(platform['strict-transport-security'] ?? '', /max-age=\d+/);
  });

  /**
   * De achtergrondkaart komt van een externe tegelserver. Staat die host niet in
   * img-src, dan blokkeert de browser elke tegel en blijft de kaart leeg -- zonder
   * foutmelding die naar de oorzaak wijst. Wie een kaartlaag toevoegt, moet dus ook
   * de CSP aanpassen; deze test herinnert daaraan.
   */
  test('elke kaartlaag mag zijn tegels ophalen van de contentbeleidsregel', async () => {
    const { readFile } = await import('node:fs/promises');
    const { HEADERS } = await import('../server/beveiliging.js');

    const bron = await readFile(new URL('../public/js/kaart.js', import.meta.url), 'utf8');
    const hosts = [...bron.matchAll(/url:\s*'(https:\/\/[^/']+)/g)].map((m) => m[1]);
    assert.ok(hosts.length >= 2, 'er horen kaartlagen met een tegel-URL te staan');

    const imgSrc = HEADERS['content-security-policy'].match(/img-src([^;]*)/)[1].trim().split(/\s+/);
    for (const host of new Set(hosts)) {
      const naam = new URL(host).hostname;
      const toegelaten = imgSrc.some((bron_) => {
        if (bron_ === host || bron_ === `https://${naam}`) return true;
        if (!bron_.startsWith('https://*.')) return false;
        return naam.endsWith(bron_.slice('https://*'.length));
      });
      assert.ok(toegelaten, `${naam} staat niet in img-src; de tegels worden geblokkeerd`);
    }
  });

  test('alles wordt naar de app doorgestuurd wat niet als bestand bestaat', async () => {
    const { readFile } = await import('node:fs/promises');
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/api' }]);
  });
});
