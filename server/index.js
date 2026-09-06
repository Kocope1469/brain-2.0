import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { Store } from './store.js';
import { Auth, leesCookie, sessieCookie } from './auth.js';
import { zetHeaders, bezoekerIp, Pogingen } from './beveiliging.js';
import { Instellingen } from './instellingen.js';
import { csvToCustomers, toCsv } from './csv.js';
import { formatVat, PROVINCIES } from './validate.js';
import { geocode, adresRegel } from './geocode.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// paden die je zonder login mag opvragen: de inlogpagina en wat ze nodig heeft
const OPENBAAR = new Set(['/login', '/login.html', '/css/app.css', '/js/login.js',
  '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']);

const json = (res, status, data, extraHeaders = {}) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
};

const fail = (res, status, errors) => json(res, status, { errors: Array.isArray(errors) ? errors : [errors] });

async function readJson(req, limit = 8 * 1024 * 1024) {
  const delen = [];
  let grootte = 0;
  for await (const deel of req) {
    grootte += deel.length;
    if (grootte > limit) throw new Error('Verzoek te groot.');
    delen.push(deel);
  }
  const ruw = Buffer.concat(delen).toString('utf8');
  if (!ruw.trim()) return {};
  try {
    const gelezen = JSON.parse(ruw);
    return (gelezen && typeof gelezen === 'object') ? gelezen : {};
  } catch {
    throw new Error('Ongeldige JSON in het verzoek.');
  }
}

async function serveStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const bestand = join(PUBLIC, rel);
  if (!bestand.startsWith(PUBLIC)) return fail(res, 403, 'Geen toegang.');
  try {
    if (!(await stat(bestand)).isFile()) throw new Error('geen bestand');
    const data = await readFile(bestand);
    res.writeHead(200, {
      'content-type': MIME[extname(bestand)] ?? 'application/octet-stream',
      'content-length': data.length,
      'cache-control': rel.includes('vendor') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  } catch {
    try {
      const data = await readFile(join(PUBLIC, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(data);
    } catch {
      res.writeHead(404).end('Niet gevonden');
    }
  }
}

const EXPORT_KOLOMMEN = [
  { key: 'external_id', label: 'CRM-id' },
  { key: 'name', label: 'Naam' },
  { key: 'contact_name', label: 'Contactpersoon' },
  { key: 'phone', label: 'Telefoon' },
  { key: 'email', label: 'E-mail' },
  { key: 'street', label: 'Straat' },
  { key: 'postal_code', label: 'Postcode' },
  { key: 'city', label: 'Gemeente' },
  { key: 'country', label: 'Land' },
  { key: 'vat_number', label: 'BTW', value: (r) => formatVat(r.vat_number) },
  { key: 'provincie', label: 'Provincie' },
  { key: 'lat', label: 'Breedtegraad' },
  { key: 'lon', label: 'Lengtegraad' },
  { key: 'tags', label: 'Tags', value: (r) => r.tags.join(', ') },
  { key: 'laatste_bezoek', label: 'Laatste bezoek' },
  { key: 'aantal_bezoeken', label: 'Aantal bezoeken' },
  { key: 'notes', label: 'Notities' },
];

/**
 * Bouwt de request-handler.
 * @param {object} deps store, auth, en optioneel een eigen geocoder (voor tests)
 */
export function createApp({ store, auth, pogingen, instellingen, geocodeImpl = geocode, veiligeCookie }) {
  const cookieVeilig = veiligeCookie ?? process.env.NODE_ENV === 'production';

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pad = url.pathname;
    const methode = req.method ?? 'GET';
    zetHeaders(res, { https: cookieVeilig });
    const token = leesCookie(req.headers.cookie);
    const gebruiker = await auth.gebruikerVoorToken(token);

    try {
      // ---- inloggen, uitloggen, eerste gebruiker ----

      if (pad === '/api/sessie' && methode === 'GET') {
        return json(res, 200, {
          ingelogd: !!gebruiker,
          gebruiker,
          eerste_start: await auth.aantalGebruikers() === 0,
        });
      }

      if (pad === '/api/sessie' && methode === 'POST') {
        const body = await readJson(req);
        const ip = bezoekerIp(req);

        const stand = await pogingen.controleer(ip, body.email);
        if (stand.geblokkeerd) {
          return json(res, 429, {
            errors: [`Te veel mislukte pogingen. Probeer over ${stand.minuten} minuten opnieuw.`],
          }, { 'retry-after': String(stand.minuten * 60) });
        }

        const res2 = await auth.login(body.email, body.wachtwoord);
        if (!res2.ok) {
          await pogingen.noteerMislukking(ip, body.email);
          return fail(res, 401, 'E-mailadres of wachtwoord klopt niet.');
        }
        await pogingen.wisVoor(body.email);
        return json(res, 200, { gebruiker: res2.gebruiker },
          { 'set-cookie': sessieCookie(res2.token, { veilig: cookieVeilig }) });
      }

      if (pad === '/api/sessie' && methode === 'DELETE') {
        await auth.logout(token);
        return json(res, 200, { uitgelogd: true },
          { 'set-cookie': sessieCookie('', { veilig: cookieVeilig }) });
      }

      // de allereerste gebruiker mag zichzelf aanmaken; daarna moet je ingelogd zijn
      if (pad === '/api/gebruikers' && methode === 'POST') {
        const eersteStart = await auth.aantalGebruikers() === 0;
        if (!eersteStart && !gebruiker) return fail(res, 401, 'Log eerst in.');
        const body = await readJson(req);
        const res2 = await auth.maakGebruiker(body);
        if (!res2.ok) return fail(res, 422, res2.errors);
        if (!eersteStart) return json(res, 201, res2.value);
        const sessie = await auth.login(body.email, body.wachtwoord);
        return json(res, 201, res2.value, { 'set-cookie': sessieCookie(sessie.token, { veilig: cookieVeilig }) });
      }

      // ---- vanaf hier: alles achter de login ----

      if (pad.startsWith('/api/')) {
        if (!gebruiker) return fail(res, 401, 'Log eerst in.');
      } else {
        if (methode !== 'GET' && methode !== 'HEAD') return fail(res, 405, 'Methode niet toegestaan.');
        const magZonderLogin = OPENBAAR.has(pad) || pad.startsWith('/vendor/');
        if (!gebruiker && !magZonderLogin) {
          if (pad === '/' || !extname(pad)) {
            res.writeHead(302, { location: '/login' });
            return res.end();
          }
          return fail(res, 401, 'Log eerst in.');
        }
        return serveStatic(res, pad === '/login' ? '/login.html' : pad);
      }

      if (pad === '/api/overzicht' && methode === 'GET') {
        const tellingen = await store.tellingen();
        return json(res, 200, {
          tellingen,
          tags: await store.allTags(),
          provincies: PROVINCIES,
          drempels: tellingen.drempels,
          gebruiker,
        });
      }

      if (pad === '/api/instellingen' && methode === 'GET') {
        return json(res, 200, await instellingen.alles());
      }

      if (pad === '/api/instellingen' && methode === 'PATCH') {
        const r = await instellingen.zet(await readJson(req), gebruiker.name || gebruiker.email);
        return r.ok ? json(res, 200, r.value) : fail(res, 422, r.errors);
      }

      if (pad === '/api/gebruikers' && methode === 'GET') {
        return json(res, 200, await auth.gebruikers());
      }

      const gebruikerPad = pad.match(/^\/api\/gebruikers\/(\d+)$/);
      if (gebruikerPad) {
        const id = Number(gebruikerPad[1]);
        if (methode === 'DELETE') {
          const r = await auth.verwijderGebruiker(id);
          if (r.notFound) return fail(res, 404, 'Gebruiker niet gevonden.');
          return r.ok ? json(res, 200, { verwijderd: true }) : fail(res, 422, r.errors);
        }
        if (methode === 'PATCH') {
          const body = await readJson(req);
          const r = await auth.wijzigWachtwoord(id, body.wachtwoord);
          if (r.notFound) return fail(res, 404, 'Gebruiker niet gevonden.');
          return r.ok ? json(res, 200, { gewijzigd: true }) : fail(res, 422, r.errors);
        }
        return fail(res, 405, 'Methode niet toegestaan.');
      }

      // ---- klanten ----

      if (pad === '/api/klanten' && methode === 'GET') {
        const p = url.searchParams;
        return json(res, 200, await store.listCustomers({
          q: p.get('q') ?? '',
          tag: p.get('tag') ?? '',
          bucket: p.get('bucket') ?? '',
          provincie: p.get('provincie') ?? '',
          alleenOpKaart: p.get('opkaart') === '1',
        }));
      }

      if (pad === '/api/klanten' && methode === 'POST') {
        const r = await store.createCustomer(await readJson(req));
        return r.ok ? json(res, 201, r.value) : fail(res, 422, r.errors);
      }

      if (pad === '/api/klanten/export.csv' && methode === 'GET') {
        const rijen = await store.listCustomers({ q: url.searchParams.get('q') ?? '' });
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="klanten-${new Date().toISOString().slice(0, 10)}.csv"`,
        });
        return res.end(toCsv(rijen, EXPORT_KOLOMMEN));
      }

      if (pad === '/api/klanten/import' && methode === 'POST') {
        const body = await readJson(req);
        const { customers, unmapped } = csvToCustomers(body.csv ?? '');
        const rapport = await store.importeer(customers);
        return json(res, 200, { ...rapport, gelezen: customers.length, genegeerde_kolommen: unmapped });
      }

      if (pad === '/api/geocode' && methode === 'POST') {
        const body = await readJson(req);
        const zoek = String(body.adres ?? '').trim() || adresRegel(body);
        const treffer = await geocodeImpl(zoek);
        return treffer ? json(res, 200, treffer) : json(res, 200, { gevonden: false, gezocht: zoek });
      }

      const klant = pad.match(/^\/api\/klanten\/(\d+)$/);
      if (klant) {
        const id = Number(klant[1]);
        if (methode === 'GET') {
          const k = await store.getCustomer(id);
          return k ? json(res, 200, k) : fail(res, 404, 'Deze klant bestaat niet.');
        }
        if (methode === 'PATCH' || methode === 'PUT') {
          const r = await store.updateCustomer(id, await readJson(req));
          if (r.notFound) return fail(res, 404, 'Deze klant bestaat niet.');
          return r.ok ? json(res, 200, r.value) : fail(res, 422, r.errors);
        }
        if (methode === 'DELETE') {
          return await store.deleteCustomer(id)
            ? json(res, 200, { verwijderd: true })
            : fail(res, 404, 'Deze klant bestaat niet.');
        }
        return fail(res, 405, 'Methode niet toegestaan.');
      }

      const bezoek = pad.match(/^\/api\/klanten\/(\d+)\/bezoeken$/);
      if (bezoek && methode === 'POST') {
        const r = await store.addVisit(Number(bezoek[1]), await readJson(req), gebruiker.name || gebruiker.email);
        if (r.notFound) return fail(res, 404, 'Deze klant bestaat niet.');
        return r.ok ? json(res, 201, r.value) : fail(res, 422, r.errors);
      }

      const bezoekWeg = pad.match(/^\/api\/bezoeken\/(\d+)$/);
      if (bezoekWeg && methode === 'DELETE') {
        return await store.deleteVisit(Number(bezoekWeg[1]))
          ? json(res, 200, { verwijderd: true })
          : fail(res, 404, 'Dit bezoek bestaat niet.');
      }

      return fail(res, 404, 'Onbekend eindpunt.');
    } catch (err) {
      const clientFout = /JSON|te groot/.test(err.message);
      if (!clientFout) console.error('[klantenkaart]', err);
      return fail(res, clientFout ? 400 : 500, clientFout ? err.message : 'Er ging iets mis op de server.');
    }
  };
}

/** Zet database, store en auth klaar. Eén keer per proces. */
export async function bouwApp(opties = {}) {
  const db = await openDb(opties);
  const auth = new Auth(db);
  const store = new Store(db);
  const pogingen = new Pogingen(db);
  const instellingen = new Instellingen(db);
  await auth.ruimVervallenSessies();
  await pogingen.opruimen();
  return {
    db, store, auth, pogingen, instellingen,
    handle: createApp({ store, auth, pogingen, instellingen, ...opties }),
  };
}

export async function createHttpServer(opties = {}) {
  const app = await bouwApp(opties);
  return Object.assign(createServer(app.handle), { app });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1]);
if (isMain) {
  const poort = Number(process.env.PORT) || 3000;
  const server = await createHttpServer();
  server.listen(poort, async () => {
    const leeg = await server.app.auth.aantalGebruikers() === 0;
    console.log(`Klantenkaart draait op http://localhost:${poort}`);
    if (leeg) console.log('Nog geen gebruikers: open de app en maak de eerste aan.');
  });
}
