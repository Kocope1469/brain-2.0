import { validateCustomer, validateVisit, bucketVoor } from './validate.js';

const VELDEN = ['name', 'contact_name', 'phone', 'email', 'street', 'postal_code',
  'city', 'country', 'vat_number', 'notes', 'lat', 'lon'];

export class Store {
  constructor(db) {
    this.db = db;
  }

  // ---------- tags ----------

  #tagId(naam) {
    const gevonden = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(naam);
    return gevonden ? gevonden.id : this.db.prepare('INSERT INTO tags(name) VALUES(?)').run(naam).lastInsertRowid;
  }

  #opschonenTags() {
    this.db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM customer_tags)');
  }

  #setTags(customerId, tags) {
    this.db.prepare('DELETE FROM customer_tags WHERE customer_id = ?').run(customerId);
    const koppel = this.db.prepare('INSERT OR IGNORE INTO customer_tags(customer_id, tag_id) VALUES(?, ?)');
    for (const naam of tags) koppel.run(customerId, this.#tagId(naam));
    this.#opschonenTags();
  }

  tagsFor(customerId) {
    return this.db.prepare(`
      SELECT t.name FROM tags t JOIN customer_tags ct ON ct.tag_id = t.id
      WHERE ct.customer_id = ? ORDER BY t.name`).all(customerId).map((r) => r.name);
  }

  allTags() {
    return this.db.prepare(`
      SELECT t.name, COUNT(ct.customer_id) AS aantal
      FROM tags t LEFT JOIN customer_tags ct ON ct.tag_id = t.id
      GROUP BY t.id ORDER BY aantal DESC, t.name`).all();
  }

  // ---------- klanten op de kaart ----------

  #verrijk(rij) {
    return {
      ...rij,
      tags: this.tagsFor(rij.id),
      bucket: bucketVoor(rij.laatste_bezoek),
      op_kaart: rij.lat !== null && rij.lon !== null,
    };
  }

  /**
   * Alle klanten met hun laatste bezoek en kleurgroep.
   * De kaart tekent hier zijn stippen mee, dus dit moet één query blijven.
   */
  listCustomers({ q = '', tag = '', bucket = '', alleenOpKaart = false } = {}) {
    const where = [];
    const gebonden = [];

    if (q) {
      where.push(`(c.name LIKE ? OR c.contact_name LIKE ? OR c.city LIKE ?
                   OR c.postal_code LIKE ? OR c.street LIKE ? OR c.notes LIKE ?)`);
      gebonden.push(...Array(6).fill(`%${q}%`));
    }
    if (tag) {
      where.push('EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.customer_id = c.id AND t.name = ?)');
      gebonden.push(tag);
    }
    if (alleenOpKaart) where.push('c.lat IS NOT NULL AND c.lon IS NOT NULL');

    const rijen = this.db.prepare(`
      SELECT c.*, (SELECT MAX(v.visit_date) FROM visits v WHERE v.customer_id = c.id) AS laatste_bezoek,
             (SELECT COUNT(*) FROM visits v WHERE v.customer_id = c.id) AS aantal_bezoeken
      FROM customers c
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.name COLLATE NOCASE ASC`).all(...gebonden);

    const verrijkt = rijen.map((r) => this.#verrijk(r));
    // filteren op kleurgroep gebeurt hier: het bereik hangt van de datum van vandaag af
    return bucket ? verrijkt.filter((k) => k.bucket === bucket) : verrijkt;
  }

  /** Eén klantdossier, inclusief alle bezoeken van recent naar oud. */
  getCustomer(id) {
    const rij = this.db.prepare(`
      SELECT c.*, (SELECT MAX(v.visit_date) FROM visits v WHERE v.customer_id = c.id) AS laatste_bezoek,
             (SELECT COUNT(*) FROM visits v WHERE v.customer_id = c.id) AS aantal_bezoeken
      FROM customers c WHERE c.id = ?`).get(id);
    if (!rij) return null;
    return {
      ...this.#verrijk(rij),
      visits: this.db.prepare(
        'SELECT * FROM visits WHERE customer_id = ? ORDER BY visit_date DESC, id DESC').all(id),
    };
  }

  createCustomer(input) {
    const res = validateCustomer(input);
    if (!res.ok) return res;
    const v = res.value;
    const kolommen = VELDEN.filter((f) => f in v);
    const id = this.db.prepare(
      `INSERT INTO customers (${kolommen.join(', ')}) VALUES (${kolommen.map(() => '?').join(', ')})`,
    ).run(...kolommen.map((c) => v[c])).lastInsertRowid;
    if (v.tags) this.#setTags(id, v.tags);
    return { ok: true, value: this.getCustomer(id) };
  }

  updateCustomer(id, input) {
    if (!this.db.prepare('SELECT id FROM customers WHERE id = ?').get(id)) return { ok: false, notFound: true };
    const res = validateCustomer(input, { partial: true });
    if (!res.ok) return res;
    const v = res.value;
    const kolommen = VELDEN.filter((f) => f in v);
    if (kolommen.length) {
      this.db.prepare(
        `UPDATE customers SET ${kolommen.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ).run(...kolommen.map((c) => v[c]), id);
    }
    if (v.tags) this.#setTags(id, v.tags);
    return { ok: true, value: this.getCustomer(id) };
  }

  deleteCustomer(id) {
    const weg = this.db.prepare('DELETE FROM customers WHERE id = ?').run(id).changes > 0;
    if (weg) this.#opschonenTags();
    return weg;
  }

  // ---------- bezoeken ----------

  addVisit(customerId, input) {
    if (!this.db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId)) {
      return { ok: false, notFound: true };
    }
    const res = validateVisit(input);
    if (!res.ok) return res;
    const v = res.value;
    const id = this.db.prepare(
      'INSERT INTO visits(customer_id, visit_date, with_whom, notes) VALUES(?,?,?,?)',
    ).run(customerId, v.visit_date, v.with_whom, v.notes).lastInsertRowid;
    this.db.prepare("UPDATE customers SET updated_at = datetime('now') WHERE id = ?").run(customerId);
    return { ok: true, value: this.db.prepare('SELECT * FROM visits WHERE id = ?').get(id) };
  }

  deleteVisit(id) {
    return this.db.prepare('DELETE FROM visits WHERE id = ?').run(id).changes > 0;
  }

  /** Tellingen per kleurgroep, voor de filterknoppen boven de kaart. */
  tellingen() {
    const alle = this.listCustomers();
    return {
      totaal: alle.length,
      recent: alle.filter((k) => k.bucket === 'recent').length,
      tijdje: alle.filter((k) => k.bucket === 'tijdje').length,
      lang: alle.filter((k) => k.bucket === 'lang').length,
      zonder_stip: alle.filter((k) => !k.op_kaart).length,
    };
  }
}
