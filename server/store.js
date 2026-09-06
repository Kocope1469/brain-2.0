import { validateCustomer } from './validate.js';

const VELDEN = ['company_name', 'contact_name', 'role', 'email', 'phone', 'website',
  'vat_number', 'street', 'postal_code', 'city', 'country', 'source', 'notes'];

export class Store {
  constructor(db) {
    this.db = db;
  }

  #tagId(name) {
    const gevonden = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
    return gevonden ? gevonden.id : this.db.prepare('INSERT INTO tags(name) VALUES(?)').run(name).lastInsertRowid;
  }

  #setTags(customerId, tags) {
    this.db.prepare('DELETE FROM customer_tags WHERE customer_id = ?').run(customerId);
    const koppel = this.db.prepare('INSERT OR IGNORE INTO customer_tags(customer_id, tag_id) VALUES(?, ?)');
    for (const naam of tags) koppel.run(customerId, this.#tagId(naam));
    this.db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM customer_tags)');
  }

  tagsFor(customerId) {
    return this.db.prepare(`
      SELECT t.name FROM tags t
      JOIN customer_tags ct ON ct.tag_id = t.id
      WHERE ct.customer_id = ? ORDER BY t.name`).all(customerId).map((r) => r.name);
  }

  allTags() {
    return this.db.prepare(`
      SELECT t.name, COUNT(ct.customer_id) AS aantal
      FROM tags t LEFT JOIN customer_tags ct ON ct.tag_id = t.id
      GROUP BY t.id ORDER BY aantal DESC, t.name`).all();
  }

  /** Alle kaarten, doorzoekbaar op alles wat erop staat. */
  listCustomers({ q = '', tag = '', sort = 'naam', limit = 1000 } = {}) {
    const where = [];
    const gebonden = [];

    if (q) {
      where.push(`(company_name LIKE ? OR contact_name LIKE ? OR email LIKE ?
                   OR city LIKE ? OR phone LIKE ? OR vat_number LIKE ? OR notes LIKE ?)`);
      gebonden.push(...Array(7).fill(`%${q}%`));
    }
    if (tag) {
      where.push('EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.customer_id = customers.id AND t.name = ?)');
      gebonden.push(tag);
    }

    const volgorde = {
      naam: 'company_name COLLATE NOCASE ASC',
      gemeente: 'city COLLATE NOCASE ASC, company_name COLLATE NOCASE ASC',
      nieuw: 'created_at DESC',
      gewijzigd: 'updated_at DESC',
    }[sort] || 'company_name COLLATE NOCASE ASC';

    gebonden.push(Math.min(Number(limit) || 1000, 5000));
    const rijen = this.db.prepare(`
      SELECT * FROM customers
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${volgorde} LIMIT ?`).all(...gebonden);

    return rijen.map((r) => ({ ...r, tags: this.tagsFor(r.id) }));
  }

  getCustomer(id) {
    const rij = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    return rij ? { ...rij, tags: this.tagsFor(id) } : null;
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
    // de koppelingen vallen weg door de cascade, de tags zelf blijven anders achter
    if (weg) this.db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM customer_tags)');
    return weg;
  }
}
