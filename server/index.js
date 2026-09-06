import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { Store } from './store.js';
import { csvToCustomers, toCsv } from './csv.js';
import { STATUSES, INTERACTION_TYPES, DEAL_STATUSES, formatVat } from './validate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const json = (res, status, data) => {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};

const fail = (res, status, errors) => json(res, status, { errors: Array.isArray(errors) ? errors : [errors] });

async function readBody(req, limit = 5 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Verzoek te groot.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    throw new Error('Ongeldige JSON in het verzoek.');
  }
}

async function serveStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return fail(res, 403, 'Geen toegang.');
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('geen bestand');
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'content-length': data.length,
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch {
    // onbekend pad -> de single-page app laten routeren
    try {
      const data = await readFile(join(PUBLIC, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(data);
    } catch {
      res.writeHead(404).end('Niet gevonden');
    }
  }
}

const EXPORT_COLUMNS = [
  { key: 'company_name', label: 'Bedrijf' },
  { key: 'contact_name', label: 'Contactpersoon' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefoon' },
  { key: 'website', label: 'Website' },
  { key: 'vat_number', label: 'BTW', value: (r) => formatVat(r.vat_number) },
  { key: 'street', label: 'Straat' },
  { key: 'postal_code', label: 'Postcode' },
  { key: 'city', label: 'Gemeente' },
  { key: 'country', label: 'Land' },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Bron' },
  { key: 'tags', label: 'Tags', value: (r) => r.tags.join(', ') },
  { key: 'omzet', label: 'Omzet', value: (r) => (r.omzet_cents / 100).toFixed(2).replace('.', ',') },
  { key: 'laatste_contact', label: 'Laatste contact' },
];

/** Bouwt de request-handler. De store wordt meegegeven zodat tests hem kunnen vervangen. */
export function createApp(store) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (!path.startsWith('/api/')) {
      if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'Methode niet toegestaan.');
      return serveStatic(res, path);
    }

    try {
      // ---- meta ----
      if (path === '/api/meta' && method === 'GET') {
        return json(res, 200, {
          statussen: STATUSES,
          contactsoorten: INTERACTION_TYPES,
          opdrachtstatussen: DEAL_STATUSES,
          tags: store.allTags(),
        });
      }

      if (path === '/api/stats' && method === 'GET') {
        return json(res, 200, store.stats({ stilteDagen: url.searchParams.get('stilte') ?? 60 }));
      }

      if (path === '/api/taken' && method === 'GET') {
        return json(res, 200, store.openTasks());
      }

      // ---- klanten ----
      if (path === '/api/klanten' && method === 'GET') {
        const p = url.searchParams;
        return json(res, 200, store.listCustomers({
          q: p.get('q') ?? '',
          status: p.get('status') ?? '',
          tag: p.get('tag') ?? '',
          archived: p.get('archief') === '1' ? 1 : 0,
          sort: p.get('sort') ?? 'company_name',
        }));
      }

      if (path === '/api/klanten' && method === 'POST') {
        const result = store.createCustomer(await readJson(req));
        return result.ok ? json(res, 201, result.value) : fail(res, 422, result.errors);
      }

      if (path === '/api/klanten/export.csv' && method === 'GET') {
        const rows = store.listCustomers({ q: url.searchParams.get('q') ?? '', limit: 2000 });
        const csv = toCsv(rows, EXPORT_COLUMNS);
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="klanten-${new Date().toISOString().slice(0, 10)}.csv"`,
        });
        return res.end(csv);
      }

      if (path === '/api/klanten/import' && method === 'POST') {
        const body = await readJson(req);
        const { customers, unmapped } = csvToCustomers(body.csv ?? '');
        const toegevoegd = [];
        const mislukt = [];
        for (const [i, c] of customers.entries()) {
          const result = store.createCustomer(c);
          if (result.ok) toegevoegd.push(result.value.company_name);
          else mislukt.push({ rij: i + 2, naam: c.company_name, fouten: result.errors });
        }
        return json(res, 200, { toegevoegd: toegevoegd.length, mislukt, genegeerde_kolommen: unmapped });
      }

      const customerMatch = path.match(/^\/api\/klanten\/(\d+)$/);
      if (customerMatch) {
        const id = Number(customerMatch[1]);
        if (method === 'GET') {
          const c = store.getCustomer(id);
          return c ? json(res, 200, c) : fail(res, 404, 'Klant niet gevonden.');
        }
        if (method === 'PATCH' || method === 'PUT') {
          const result = store.updateCustomer(id, await readJson(req));
          if (result.notFound) return fail(res, 404, 'Klant niet gevonden.');
          return result.ok ? json(res, 200, result.value) : fail(res, 422, result.errors);
        }
        if (method === 'DELETE') {
          return store.deleteCustomer(id) ? json(res, 200, { verwijderd: true }) : fail(res, 404, 'Klant niet gevonden.');
        }
        return fail(res, 405, 'Methode niet toegestaan.');
      }

      // ---- onderdelen van de kaart ----
      const childMatch = path.match(/^\/api\/klanten\/(\d+)\/(contact|opdrachten|taken)$/);
      if (childMatch && method === 'POST') {
        const id = Number(childMatch[1]);
        const body = await readJson(req);
        const result = { contact: () => store.addInteraction(id, body),
          opdrachten: () => store.addDeal(id, body),
          taken: () => store.addTask(id, body) }[childMatch[2]]();
        if (result.notFound) return fail(res, 404, 'Klant niet gevonden.');
        return result.ok ? json(res, 201, result.value) : fail(res, 422, result.errors);
      }

      const taskMatch = path.match(/^\/api\/taken\/(\d+)$/);
      if (taskMatch && method === 'PATCH') {
        const body = await readJson(req);
        const task = store.toggleTask(Number(taskMatch[1]), body.done);
        return task ? json(res, 200, task) : fail(res, 404, 'Taak niet gevonden.');
      }

      const deleteMatch = path.match(/^\/api\/(contact|opdrachten|taken)\/(\d+)$/);
      if (deleteMatch && method === 'DELETE') {
        const table = { contact: 'interactions', opdrachten: 'deals', taken: 'tasks' }[deleteMatch[1]];
        return store.deleteChild(table, Number(deleteMatch[2]))
          ? json(res, 200, { verwijderd: true })
          : fail(res, 404, 'Niet gevonden.');
      }

      return fail(res, 404, 'Onbekend eindpunt.');
    } catch (err) {
      const clientError = /JSON|te groot/.test(err.message);
      if (!clientError) console.error('[klantenkaart]', err);
      return fail(res, clientError ? 400 : 500, clientError ? err.message : 'Er ging iets mis op de server.');
    }
  };
}

export function createHttpServer(store) {
  return createServer(createApp(store));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1]);
if (isMain) {
  const store = new Store(openDb());
  const port = Number(process.env.PORT) || 3000;
  createHttpServer(store).listen(port, () => {
    console.log(`Klantenkaart draait op http://localhost:${port}`);
  });
}
