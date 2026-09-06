import { validateCustomer, validateInteraction, validateDeal, validateTask } from './validate.js';

const CUSTOMER_FIELDS = ['company_name', 'contact_name', 'email', 'phone', 'website', 'vat_number',
  'street', 'postal_code', 'city', 'country', 'status', 'source', 'intro', 'archived'];

export class Store {
  constructor(db) {
    this.db = db;
  }

  // ---------- tags ----------

  /** Zoekt of maakt een tag en geeft het id terug. */
  #tagId(name) {
    const found = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
    if (found) return found.id;
    return this.db.prepare('INSERT INTO tags(name) VALUES(?)').run(name).lastInsertRowid;
  }

  #setTags(customerId, tags) {
    this.db.prepare('DELETE FROM customer_tags WHERE customer_id = ?').run(customerId);
    const link = this.db.prepare('INSERT OR IGNORE INTO customer_tags(customer_id, tag_id) VALUES(?, ?)');
    for (const name of tags) link.run(customerId, this.#tagId(name));
    this.db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM customer_tags)');
  }

  tagsFor(customerId) {
    return this.db.prepare(
      'SELECT t.name FROM tags t JOIN customer_tags ct ON ct.tag_id = t.id WHERE ct.customer_id = ? ORDER BY t.name',
    ).all(customerId).map((r) => r.name);
  }

  allTags() {
    return this.db.prepare(`
      SELECT t.name, COUNT(ct.customer_id) AS aantal
      FROM tags t LEFT JOIN customer_tags ct ON ct.tag_id = t.id
      GROUP BY t.id ORDER BY aantal DESC, t.name`).all();
  }

  // ---------- klanten ----------

  /**
   * Lijst van klanten met zoek-, status- en tagfilter.
   * Bevat per klant de omzet en het laatste contactmoment, zodat de lijst
   * meteen toont wie aandacht nodig heeft.
   */
  listCustomers({ q = '', status = '', tag = '', archived = 0, sort = 'company_name', limit = 500 } = {}) {
    const where = ['c.archived = ?'];
    const params = [archived ? 1 : 0];

    if (q) {
      where.push(`(c.company_name LIKE ?1 OR c.contact_name LIKE ?1 OR c.email LIKE ?1
                   OR c.city LIKE ?1 OR c.phone LIKE ?1 OR c.vat_number LIKE ?1)`);
    }
    if (status) where.push('c.status = ?');
    if (tag) where.push('EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.customer_id = c.id AND t.name = ?)');

    const order = {
      company_name: 'c.company_name COLLATE NOCASE ASC',
      recent: 'laatste_contact IS NULL, laatste_contact DESC',
      omzet: 'omzet_cents DESC',
      nieuw: 'c.created_at DESC',
    }[sort] || 'c.company_name COLLATE NOCASE ASC';

    // named + positional door elkaar kan niet; bouw de lijst in volgorde op
    const sql = `
      SELECT c.*,
             COALESCE((SELECT SUM(d.amount_cents) FROM deals d
                       WHERE d.customer_id = c.id AND d.status IN ('gewonnen','gefactureerd','betaald')), 0) AS omzet_cents,
             (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id) AS laatste_contact,
             (SELECT COUNT(*) FROM tasks t WHERE t.customer_id = c.id AND t.done = 0) AS open_taken
      FROM customers c
      WHERE ${where.join(' AND ').replace(/\?1/g, '?')}
      ORDER BY ${order}
      LIMIT ?`;

    const bound = [params[0]];
    if (q) bound.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    if (status) bound.push(status);
    if (tag) bound.push(tag);
    bound.push(Math.min(Number(limit) || 500, 2000));

    const rows = this.db.prepare(sql).all(...bound);
    return rows.map((r) => ({ ...r, tags: this.tagsFor(r.id) }));
  }

  getCustomer(id) {
    const row = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!row) return null;
    return {
      ...row,
      tags: this.tagsFor(id),
      omzet_cents: this.db.prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS s FROM deals
         WHERE customer_id = ? AND status IN ('gewonnen','gefactureerd','betaald')`).get(id).s,
      interactions: this.db.prepare(
        'SELECT * FROM interactions WHERE customer_id = ? ORDER BY occurred_at DESC, id DESC').all(id),
      deals: this.db.prepare(
        'SELECT * FROM deals WHERE customer_id = ? ORDER BY deal_date DESC, id DESC').all(id),
      tasks: this.db.prepare(
        'SELECT * FROM tasks WHERE customer_id = ? ORDER BY done ASC, due_date ASC, id ASC').all(id),
    };
  }

  createCustomer(input) {
    const res = validateCustomer(input);
    if (!res.ok) return res;
    const v = res.value;
    const cols = CUSTOMER_FIELDS.filter((f) => f in v);
    const id = this.db.prepare(
      `INSERT INTO customers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ).run(...cols.map((c) => v[c])).lastInsertRowid;
    if (v.tags) this.#setTags(id, v.tags);
    return { ok: true, value: this.getCustomer(id) };
  }

  updateCustomer(id, input) {
    if (!this.db.prepare('SELECT id FROM customers WHERE id = ?').get(id)) return { ok: false, notFound: true };
    const res = validateCustomer(input, { partial: true });
    if (!res.ok) return res;
    const v = res.value;
    const cols = CUSTOMER_FIELDS.filter((f) => f in v);
    if (cols.length) {
      this.db.prepare(
        `UPDATE customers SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ).run(...cols.map((c) => v[c]), id);
    }
    if (v.tags) this.#setTags(id, v.tags);
    return { ok: true, value: this.getCustomer(id) };
  }

  deleteCustomer(id) {
    return this.db.prepare('DELETE FROM customers WHERE id = ?').run(id).changes > 0;
  }

  // ---------- onderdelen van de kaart ----------

  #assertCustomer(id) {
    return !!this.db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
  }

  addInteraction(customerId, input) {
    if (!this.#assertCustomer(customerId)) return { ok: false, notFound: true };
    const res = validateInteraction(input);
    if (!res.ok) return res;
    const v = res.value;
    const id = this.db.prepare(
      'INSERT INTO interactions(customer_id, type, subject, body, occurred_at) VALUES(?,?,?,?,?)',
    ).run(customerId, v.type, v.subject, v.body, v.occurred_at).lastInsertRowid;
    this.#touch(customerId);
    return { ok: true, value: this.db.prepare('SELECT * FROM interactions WHERE id = ?').get(id) };
  }

  addDeal(customerId, input) {
    if (!this.#assertCustomer(customerId)) return { ok: false, notFound: true };
    const res = validateDeal(input);
    if (!res.ok) return res;
    const v = res.value;
    const id = this.db.prepare(
      'INSERT INTO deals(customer_id, title, amount_cents, status, deal_date) VALUES(?,?,?,?,?)',
    ).run(customerId, v.title, v.amount_cents, v.status, v.deal_date).lastInsertRowid;
    this.#touch(customerId);
    return { ok: true, value: this.db.prepare('SELECT * FROM deals WHERE id = ?').get(id) };
  }

  addTask(customerId, input) {
    if (!this.#assertCustomer(customerId)) return { ok: false, notFound: true };
    const res = validateTask(input);
    if (!res.ok) return res;
    const v = res.value;
    const id = this.db.prepare(
      'INSERT INTO tasks(customer_id, title, due_date, done) VALUES(?,?,?,?)',
    ).run(customerId, v.title, v.due_date, v.done).lastInsertRowid;
    this.#touch(customerId);
    return { ok: true, value: this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) };
  }

  toggleTask(id, done) {
    const changes = this.db.prepare('UPDATE tasks SET done = ? WHERE id = ?').run(done ? 1 : 0, id).changes;
    return changes > 0 ? this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) : null;
  }

  deleteChild(table, id) {
    if (!['interactions', 'deals', 'tasks'].includes(table)) throw new Error('onbekende tabel');
    return this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
  }

  #touch(customerId) {
    this.db.prepare("UPDATE customers SET updated_at = datetime('now') WHERE id = ?").run(customerId);
  }

  // ---------- overzichten ----------

  openTasks(limit = 100) {
    return this.db.prepare(`
      SELECT t.*, c.company_name
      FROM tasks t JOIN customers c ON c.id = t.customer_id
      WHERE t.done = 0
      ORDER BY t.due_date ASC, t.id ASC LIMIT ?`).all(limit);
  }

  /** Cijfers voor het dashboard: waar staat de zaak vandaag. */
  stats({ stilteDagen = 60 } = {}) {
    const one = (sql, ...p) => Object.values(this.db.prepare(sql).get(...p))[0];
    const jaar = new Date().getFullYear();
    return {
      klanten: one('SELECT COUNT(*) FROM customers WHERE archived = 0'),
      per_status: this.db.prepare(
        'SELECT status, COUNT(*) AS aantal FROM customers WHERE archived = 0 GROUP BY status').all(),
      omzet_totaal_cents: one(
        "SELECT COALESCE(SUM(amount_cents),0) FROM deals WHERE status IN ('gewonnen','gefactureerd','betaald')"),
      omzet_jaar_cents: one(
        `SELECT COALESCE(SUM(amount_cents),0) FROM deals
         WHERE status IN ('gewonnen','gefactureerd','betaald') AND deal_date >= ?`, `${jaar}-01-01`),
      openstaande_offertes_cents: one(
        "SELECT COALESCE(SUM(amount_cents),0) FROM deals WHERE status = 'offerte'"),
      open_taken: one('SELECT COUNT(*) FROM tasks WHERE done = 0'),
      taken_te_laat: one("SELECT COUNT(*) FROM tasks WHERE done = 0 AND due_date < date('now')"),
      stille_klanten: this.db.prepare(`
        SELECT c.id, c.company_name, c.status,
               (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id) AS laatste_contact
        FROM customers c
        WHERE c.archived = 0 AND c.status IN ('actief','prospect')
          AND (laatste_contact IS NULL OR laatste_contact < date('now', ?))
        ORDER BY laatste_contact IS NOT NULL, laatste_contact ASC
        LIMIT 15`).all(`-${Number(stilteDagen) || 60} days`),
      recente_activiteit: this.db.prepare(`
        SELECT i.id, i.type, i.subject, i.occurred_at, c.id AS customer_id, c.company_name
        FROM interactions i JOIN customers c ON c.id = i.customer_id
        ORDER BY i.occurred_at DESC, i.id DESC LIMIT 10`).all(),
    };
  }
}
