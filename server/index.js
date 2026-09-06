import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { Store } from './store.js';
import { csvToCustomers, toCsv } from './csv.js';
import { formatVat, DREMPELS } from './validate.js';
import { geocode, adresRegel } from './geocode.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const json = (res, status, data) => {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};

const fail = (res, status, errors) => json(res, status, { errors: Array.isArray(errors) ? errors : [errors] });

async function readJson(req, limit = 5 * 1024 * 1024) {
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
  const isVendor = rel.startsWith('/vendor') || rel.startsWith('vendor');
  try {
    if (!(await stat(bestand)).isFile()) throw new Error('geen bestand');
    const data = await readFile(bestand);
    res.writeHead(200, {
      'content-type': MIME[extname(bestand)] ?? 'application/octet-stream',
      'content-length': data.length,
      'cache-control': isVendor ? 'public, max-age=31536000, immutable' : 'no-cache',
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
  { key: 'name', label: 'Naam' },
  { key: 'contact_name', label: 'Contactpersoon' },
  { key: 'phone', label: 'Telefoon' },
  { key: 'email', label: 'E-mail' },
  { key: 'street', label: 'Straat' },
  { key: 'postal_code', label: 'Postcode' },
  { key: 'city', label: 'Gemeente' },
  { key: 'country', label: 'Land' },
  { key: 'vat_number', label: 'BTW', value: (r) => formatVat(r.vat_number) },
  { key: 'lat', label: 'Breedtegraad' },
  { key: 'lon', label: 'Lengtegraad' },
  { key: 'tags', label: 'Tags', value: (r) => r.tags.join(', ') },
  { key: 'laatste_bezoek', label: 'Laatste bezoek' },
  { key: 'aantal_bezoeken', label: 'Aantal bezoeken' },
  { key: 'notes', label: 'Notities' },
];

/** Bouwt de request-handler. De store wordt meegegeven zodat tests hem kunnen vervangen. */
export function createApp(store, { geocodeImpl = geocode } = {}) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pad = url.pathname;
    const methode = req.method ?? 'GET';

    if (!pad.startsWith('/api/')) {
      if (methode !== 'GET' && methode !== 'HEAD') return fail(res, 405, 'Methode niet toegestaan.');
      return serveStatic(res, pad);
    }

    try {
      if (pad === '/api/overzicht' && methode === 'GET') {
        return json(res, 200, { tellingen: store.tellingen(), tags: store.allTags(), drempels: DREMPELS });
      }

      if (pad === '/api/klanten' && methode === 'GET') {
        const p = url.searchParams;
        return json(res, 200, store.listCustomers({
          q: p.get('q') ?? '',
          tag: p.get('tag') ?? '',
          bucket: p.get('bucket') ?? '',
          alleenOpKaart: p.get('opkaart') === '1',
        }));
      }

      if (pad === '/api/klanten' && methode === 'POST') {
        const r = store.createCustomer(await readJson(req));
        return r.ok ? json(res, 201, r.value) : fail(res, 422, r.errors);
      }

      if (pad === '/api/klanten/export.csv' && methode === 'GET') {
        const rijen = store.listCustomers({ q: url.searchParams.get('q') ?? '' });
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="klanten-${new Date().toISOString().slice(0, 10)}.csv"`,
        });
        return res.end(toCsv(rijen, EXPORT_KOLOMMEN));
      }

      if (pad === '/api/klanten/import' && methode === 'POST') {
        const body = await readJson(req);
        const { customers, unmapped } = csvToCustomers(body.csv ?? '');
        const mislukt = [];
        let toegevoegd = 0;
        for (const [i, c] of customers.entries()) {
          const r = store.createCustomer(c);
          if (r.ok) toegevoegd++;
          else mislukt.push({ rij: i + 2, naam: c.name, fouten: r.errors });
        }
        return json(res, 200, { toegevoegd, mislukt, genegeerde_kolommen: unmapped });
      }

      // adres -> coördinaten; faalt zacht zodat de gebruiker de stip zelf kan zetten
      if (pad === '/api/geocode' && methode === 'POST') {
        const body = await readJson(req);
        const zoek = String(body.adres ?? '').trim() || adresRegel(body);
        const treffer = await geocodeImpl(zoek);
        return treffer
          ? json(res, 200, treffer)
          : json(res, 200, { gevonden: false, gezocht: zoek });
      }

      const klant = pad.match(/^\/api\/klanten\/(\d+)$/);
      if (klant) {
        const id = Number(klant[1]);
        if (methode === 'GET') {
          const k = store.getCustomer(id);
          return k ? json(res, 200, k) : fail(res, 404, 'Deze klant bestaat niet.');
        }
        if (methode === 'PATCH' || methode === 'PUT') {
          const r = store.updateCustomer(id, await readJson(req));
          if (r.notFound) return fail(res, 404, 'Deze klant bestaat niet.');
          return r.ok ? json(res, 200, r.value) : fail(res, 422, r.errors);
        }
        if (methode === 'DELETE') {
          return store.deleteCustomer(id) ? json(res, 200, { verwijderd: true }) : fail(res, 404, 'Deze klant bestaat niet.');
        }
        return fail(res, 405, 'Methode niet toegestaan.');
      }

      const bezoek = pad.match(/^\/api\/klanten\/(\d+)\/bezoeken$/);
      if (bezoek && methode === 'POST') {
        const r = store.addVisit(Number(bezoek[1]), await readJson(req));
        if (r.notFound) return fail(res, 404, 'Deze klant bestaat niet.');
        return r.ok ? json(res, 201, r.value) : fail(res, 422, r.errors);
      }

      const bezoekWeg = pad.match(/^\/api\/bezoeken\/(\d+)$/);
      if (bezoekWeg && methode === 'DELETE') {
        return store.deleteVisit(Number(bezoekWeg[1]))
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

export function createHttpServer(store, opties) {
  return createServer(createApp(store, opties));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1]);
if (isMain) {
  const poort = Number(process.env.PORT) || 3000;
  createHttpServer(new Store(openDb())).listen(poort, () => {
    console.log(`Klantenkaart draait op http://localhost:${poort}`);
  });
}
