import { nu } from './db.js';
import { validateCustomer, validateVisit, bucketVoor, provincieVoor } from './validate.js';

const VELDEN = ['external_id', 'name', 'contact_name', 'phone', 'email', 'street',
  'postal_code', 'city', 'country', 'vat_number', 'notes', 'lat', 'lon'];

/** Velden die een CSV-import mag overschrijven. Notities en stippen niet. */
const IMPORT_VELDEN = ['name', 'contact_name', 'phone', 'email', 'street',
  'postal_code', 'city', 'country', 'vat_number'];

export class Store {
  constructor(db) {
    this.db = db;
  }

  // ---------- tags ----------

  async #tagId(naam) {
    const gevonden = await this.db.get('SELECT id FROM tags WHERE name = ?', [naam]);
    return gevonden ? gevonden.id : this.db.insert('INSERT INTO tags(name) VALUES(?)', [naam]);
  }

  async #opschonenTags() {
    await this.db.run('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM customer_tags)');
  }

  async #setTags(customerId, tags) {
    await this.db.run('DELETE FROM customer_tags WHERE customer_id = ?', [customerId]);
    for (const naam of tags) {
      const tagId = await this.#tagId(naam);
      await this.db.run(
        'INSERT INTO customer_tags(customer_id, tag_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM customer_tags WHERE customer_id = ? AND tag_id = ?)',
        [customerId, tagId, customerId, tagId],
      );
    }
    await this.#opschonenTags();
  }

  async allTags() {
    return this.db.all(`
      SELECT t.name, COUNT(ct.customer_id) AS aantal
      FROM tags t LEFT JOIN customer_tags ct ON ct.tag_id = t.id
      GROUP BY t.id, t.name ORDER BY COUNT(ct.customer_id) DESC, t.name`);
  }

  // ---------- klanten ----------

  #verrijk(rij, tags) {
    return {
      ...rij,
      lat: rij.lat === null ? null : Number(rij.lat),
      lon: rij.lon === null ? null : Number(rij.lon),
      aantal_bezoeken: Number(rij.aantal_bezoeken ?? 0),
      tags,
      bucket: bucketVoor(rij.laatste_bezoek),
      provincie: provincieVoor(rij.postal_code),
      op_kaart: rij.lat !== null && rij.lon !== null,
    };
  }

  /** Tags voor meerdere klanten in één query — anders wordt de kaart traag. */
  async #tagsPerKlant(ids) {
    if (!ids.length) return new Map();
    const rijen = await this.db.all(`
      SELECT ct.customer_id, t.name FROM customer_tags ct
      JOIN tags t ON t.id = ct.tag_id
      WHERE ct.customer_id IN (${ids.map(() => '?').join(',')})
      ORDER BY t.name`, ids);
    const kaart = new Map(ids.map((id) => [id, []]));
    for (const r of rijen) kaart.get(r.customer_id)?.push(r.name);
    return kaart;
  }

  async listCustomers({ q = '', tag = '', bucket = '', provincie = '', alleenOpKaart = false } = {}) {
    const where = [];
    const gebonden = [];

    if (q) {
      const veldenOmTeZoeken = ['c.name', 'c.contact_name', 'c.city', 'c.postal_code', 'c.street', 'c.notes'];
      where.push(`(${veldenOmTeZoeken.map((v) => `LOWER(${v}) LIKE ?`).join(' OR ')})`);
      gebonden.push(...veldenOmTeZoeken.map(() => `%${q.toLowerCase()}%`));
    }
    if (tag) {
      where.push('EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.customer_id = c.id AND t.name = ?)');
      gebonden.push(tag);
    }
    if (alleenOpKaart) where.push('c.lat IS NOT NULL AND c.lon IS NOT NULL');

    const rijen = await this.db.all(`
      SELECT c.*, (SELECT MAX(v.visit_date) FROM visits v WHERE v.customer_id = c.id) AS laatste_bezoek,
             (SELECT COUNT(*) FROM visits v WHERE v.customer_id = c.id) AS aantal_bezoeken
      FROM customers c
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY LOWER(c.name) ASC`, gebonden);

    const tagsPer = await this.#tagsPerKlant(rijen.map((r) => r.id));
    let klanten = rijen.map((r) => this.#verrijk(r, tagsPer.get(r.id) ?? []));
    // kleurgroep en provincie worden in JavaScript bepaald: de eerste hangt van
    // de datum van vandaag af, de tweede van de postcodereeks
    if (bucket) klanten = klanten.filter((k) => k.bucket === bucket);
    if (provincie) klanten = klanten.filter((k) => k.provincie === provincie);
    return klanten;
  }

  async getCustomer(id) {
    const rij = await this.db.get(`
      SELECT c.*, (SELECT MAX(v.visit_date) FROM visits v WHERE v.customer_id = c.id) AS laatste_bezoek,
             (SELECT COUNT(*) FROM visits v WHERE v.customer_id = c.id) AS aantal_bezoeken
      FROM customers c WHERE c.id = ?`, [id]);
    if (!rij) return null;
    const tags = (await this.#tagsPerKlant([id])).get(id) ?? [];
    return {
      ...this.#verrijk(rij, tags),
      visits: await this.db.all(
        'SELECT * FROM visits WHERE customer_id = ? ORDER BY visit_date DESC, id DESC', [id]),
    };
  }

  async createCustomer(input) {
    const res = validateCustomer(input);
    if (!res.ok) return res;
    const v = res.value;
    const kolommen = VELDEN.filter((f) => f in v);
    const tijd = nu();
    const id = await this.db.insert(
      `INSERT INTO customers (${kolommen.join(', ')}, created_at, updated_at)
       VALUES (${kolommen.map(() => '?').join(', ')}, ?, ?)`,
      [...kolommen.map((c) => v[c]), tijd, tijd],
    );
    if (v.tags) await this.#setTags(id, v.tags);
    return { ok: true, value: await this.getCustomer(id) };
  }

  async updateCustomer(id, input) {
    if (!await this.db.get('SELECT id FROM customers WHERE id = ?', [id])) return { ok: false, notFound: true };
    const res = validateCustomer(input, { partial: true });
    if (!res.ok) return res;
    const v = res.value;
    const kolommen = VELDEN.filter((f) => f in v);
    if (kolommen.length) {
      await this.db.run(
        `UPDATE customers SET ${kolommen.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...kolommen.map((c) => v[c]), nu(), id],
      );
    }
    if (v.tags) await this.#setTags(id, v.tags);
    return { ok: true, value: await this.getCustomer(id) };
  }

  async deleteCustomer(id) {
    const weg = (await this.db.run('DELETE FROM customers WHERE id = ?', [id])).changes > 0;
    if (weg) await this.#opschonenTags();
    return weg;
  }

  // ---------- bezoeken ----------

  async addVisit(customerId, input, auteur = '') {
    if (!await this.db.get('SELECT id FROM customers WHERE id = ?', [customerId])) {
      return { ok: false, notFound: true };
    }
    const res = validateVisit(input);
    if (!res.ok) return res;
    const v = res.value;
    const id = await this.db.insert(
      'INSERT INTO visits(customer_id, visit_date, with_whom, notes, author, created_at) VALUES(?,?,?,?,?,?)',
      [customerId, v.visit_date, v.with_whom, v.notes, auteur, nu()],
    );
    await this.db.run('UPDATE customers SET updated_at = ? WHERE id = ?', [nu(), customerId]);
    return { ok: true, value: await this.db.get('SELECT * FROM visits WHERE id = ?', [id]) };
  }

  async deleteVisit(id) {
    return (await this.db.run('DELETE FROM visits WHERE id = ?', [id])).changes > 0;
  }

  // ---------- import ----------

  /**
   * Zoekt een bestaande klant bij een rij uit de CRM-export. In volgorde van
   * betrouwbaarheid: het id uit het CRM, dan het BTW-nummer, dan naam + postcode.
   */
  async vindBestaande({ external_id = '', vat_number = '', name = '', postal_code = '' }) {
    if (external_id) {
      const t = await this.db.get('SELECT * FROM customers WHERE external_id = ? AND external_id <> ?', [external_id, '']);
      if (t) return t;
    }
    if (vat_number) {
      const t = await this.db.get('SELECT * FROM customers WHERE vat_number = ? AND vat_number <> ?', [vat_number, '']);
      if (t) return t;
    }
    if (name && postal_code) {
      return this.db.get('SELECT * FROM customers WHERE LOWER(name) = ? AND postal_code = ?',
        [name.toLowerCase(), postal_code]);
    }
    return null;
  }

  /**
   * Voegt een CRM-export samen met wat er al staat. Bestaande klanten worden
   * bijgewerkt, nooit gedupliceerd; bezoeken, notities, tags en handmatig
   * geplaatste stippen blijven onaangeroerd.
   */
  async importeer(rijen) {
    const rapport = { nieuw: 0, bijgewerkt: 0, ongewijzigd: 0, mislukt: [] };

    for (const [i, ruw] of rijen.entries()) {
      const gecontroleerd = validateCustomer(ruw);
      if (!gecontroleerd.ok) {
        rapport.mislukt.push({ rij: i + 2, naam: ruw.name ?? '', fouten: gecontroleerd.errors });
        continue;
      }
      const schoon = gecontroleerd.value;
      const bestaande = await this.vindBestaande(schoon);

      if (!bestaande) {
        const res = await this.createCustomer(ruw);
        if (res.ok) rapport.nieuw++;
        else rapport.mislukt.push({ rij: i + 2, naam: schoon.name, fouten: res.errors });
        continue;
      }

      const wijzigingen = {};
      for (const veld of IMPORT_VELDEN) {
        const nieuw = schoon[veld];
        if (nieuw !== undefined && nieuw !== '' && nieuw !== bestaande[veld]) wijzigingen[veld] = nieuw;
      }
      // een leeg CRM-id vullen we alsnog aan, zodat de volgende import zeker matcht
      if (schoon.external_id && !bestaande.external_id) wijzigingen.external_id = schoon.external_id;
      // de stip alleen zetten als er nog geen staat: handmatig werk gaat voor
      if (bestaande.lat === null && schoon.lat != null) {
        wijzigingen.lat = schoon.lat;
        wijzigingen.lon = schoon.lon;
      }

      if (!Object.keys(wijzigingen).length) {
        rapport.ongewijzigd++;
        continue;
      }
      const res = await this.updateCustomer(bestaande.id, wijzigingen);
      if (res.ok) rapport.bijgewerkt++;
      else rapport.mislukt.push({ rij: i + 2, naam: schoon.name, fouten: res.errors });
    }
    return rapport;
  }

  // ---------- overzicht ----------

  async tellingen() {
    const alle = await this.listCustomers();
    const perProvincie = {};
    for (const k of alle) if (k.provincie) perProvincie[k.provincie] = (perProvincie[k.provincie] ?? 0) + 1;
    return {
      totaal: alle.length,
      recent: alle.filter((k) => k.bucket === 'recent').length,
      tijdje: alle.filter((k) => k.bucket === 'tijdje').length,
      lang: alle.filter((k) => k.bucket === 'lang').length,
      zonder_stip: alle.filter((k) => !k.op_kaart).length,
      per_provincie: Object.entries(perProvincie).sort((a, b) => b[1] - a[1]),
    };
  }
}
