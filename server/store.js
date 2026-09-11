import { nu } from './db.js';
import { validateCustomer, validateVisit, validateContact, bucketVoor, provincieVoor } from './validate.js';
import { Instellingen } from './instellingen.js';
import { zoekPlaats, spreid } from './plaatsen.js';

const VELDEN = ['external_id', 'name', 'contact_name', 'phone', 'email', 'street',
  'postal_code', 'city', 'country', 'vat_number', 'notes', 'lat', 'lon', 'locatie_bron'];

/** Velden die een CSV-import mag overschrijven. Notities en stippen niet. */
const IMPORT_VELDEN = ['name', 'contact_name', 'phone', 'email', 'street',
  'postal_code', 'city', 'country', 'vat_number'];

export class Store {
  constructor(db) {
    this.db = db;
    this.instellingen = new Instellingen(db);
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

  #verrijk(rij, tags, drempels) {
    return {
      ...rij,
      lat: rij.lat === null ? null : Number(rij.lat),
      lon: rij.lon === null ? null : Number(rij.lon),
      aantal_bezoeken: Number(rij.aantal_bezoeken ?? 0),
      tags,
      bucket: bucketVoor(rij.laatste_bezoek, new Date(), drempels),
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
      // ook op de extra contactpersonen: je weet vaker nog wie je sprak dan hoe het
      // bedrijf precies heet
      const veldenOmTeZoeken = ['c.name', 'c.contact_name', 'c.city', 'c.postal_code', 'c.street', 'c.notes'];
      const patroon = `%${q.toLowerCase()}%`;
      where.push(`(${veldenOmTeZoeken.map((v) => `LOWER(${v}) LIKE ?`).join(' OR ')}
        OR EXISTS (SELECT 1 FROM contacts ctc WHERE ctc.customer_id = c.id
                   AND (LOWER(ctc.name) LIKE ? OR LOWER(ctc.functie) LIKE ?)))`);
      gebonden.push(...veldenOmTeZoeken.map(() => patroon), patroon, patroon);
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
    const drempels = await this.instellingen.drempels();
    let klanten = rijen.map((r) => this.#verrijk(r, tagsPer.get(r.id) ?? [], drempels));
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
      ...this.#verrijk(rij, tags, await this.instellingen.drempels()),
      contacten: await this.listContacts(id),
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

  // ---------- contactpersonen ----------

  /**
   * De extra contactpersonen bij een klant, op naam. Het hoofdcontact staat op de
   * klant zelf (`contact_name`, `phone`, `email`): dat veld komt uit het CRM en wordt
   * bij elke import ververst. Wat je hier zelf bijzet, blijft van jou -- de import
   * raakt deze tabel niet aan.
   */
  async listContacts(customerId) {
    return this.db.all(
      'SELECT * FROM contacts WHERE customer_id = ? ORDER BY LOWER(name)', [customerId]);
  }

  async addContact(customerId, input) {
    if (!await this.db.get('SELECT id FROM customers WHERE id = ?', [customerId])) {
      return { ok: false, notFound: true };
    }
    const res = validateContact(input);
    if (!res.ok) return res;
    const v = res.value;
    const id = await this.db.insert(
      'INSERT INTO contacts(customer_id, name, functie, phone, email, notes, created_at) VALUES(?,?,?,?,?,?,?)',
      [customerId, v.name, v.functie, v.phone, v.email, v.notes, nu()],
    );
    await this.db.run('UPDATE customers SET updated_at = ? WHERE id = ?', [nu(), customerId]);
    return { ok: true, value: await this.db.get('SELECT * FROM contacts WHERE id = ?', [id]) };
  }

  async updateContact(id, input) {
    const bestaand = await this.db.get('SELECT * FROM contacts WHERE id = ?', [id]);
    if (!bestaand) return { ok: false, notFound: true };

    const res = validateContact({ ...bestaand, ...input });
    if (!res.ok) return res;
    const v = res.value;
    await this.db.run(
      'UPDATE contacts SET name = ?, functie = ?, phone = ?, email = ?, notes = ? WHERE id = ?',
      [v.name, v.functie, v.phone, v.email, v.notes, id],
    );
    await this.db.run('UPDATE customers SET updated_at = ? WHERE id = ?', [nu(), bestaand.customer_id]);
    return { ok: true, value: await this.db.get('SELECT * FROM contacts WHERE id = ?', [id]) };
  }

  async deleteContact(id) {
    return (await this.db.run('DELETE FROM contacts WHERE id = ?', [id])).changes > 0;
  }

  // ---------- bezoeken ----------

  /**
   * `auteur` is wie er ingelogd is. Kiest het formulier zelf een collega, dan wint
   * die: wie het bezoek noteert is niet noodzakelijk wie er geweest is -- iemand
   * werkt zijn week op kantoor bij, of noteert het bezoek van een collega.
   */
  async addVisit(customerId, input, auteur = '') {
    if (!await this.db.get('SELECT id FROM customers WHERE id = ?', [customerId])) {
      return { ok: false, notFound: true };
    }
    const res = validateVisit(input);
    if (!res.ok) return res;
    const v = res.value;
    const id = await this.db.insert(
      'INSERT INTO visits(customer_id, visit_date, with_whom, notes, author, created_at) VALUES(?,?,?,?,?,?)',
      [customerId, v.visit_date, v.with_whom, v.notes, v.author || auteur, nu()],
    );
    await this.db.run('UPDATE customers SET updated_at = ? WHERE id = ?', [nu(), customerId]);
    return { ok: true, value: await this.db.get('SELECT * FROM visits WHERE id = ?', [id]) };
  }

  /**
   * Een genoteerd bezoek rechtzetten. Een typfout of een verkeerde datum hoort je
   * niet te dwingen het bezoek te wissen en opnieuw in te tikken -- daarbij raak je
   * de rest van het verslag kwijt.
   *
   * De klant zelf verandert niet: een bezoek verhuist niet naar iemand anders.
   */
  async updateVisit(id, input, auteur = '') {
    const bestaand = await this.db.get('SELECT * FROM visits WHERE id = ?', [id]);
    if (!bestaand) return { ok: false, notFound: true };

    // alleen de meegestuurde velden wijzigen; de rest blijft zoals het was
    const res = validateVisit({ ...bestaand, ...input });
    if (!res.ok) return res;
    const v = res.value;

    await this.db.run(
      'UPDATE visits SET visit_date = ?, with_whom = ?, notes = ?, author = ? WHERE id = ?',
      [v.visit_date, v.with_whom, v.notes, v.author || auteur, id],
    );
    await this.db.run('UPDATE customers SET updated_at = ? WHERE id = ?', [nu(), bestaand.customer_id]);
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
   *
   * Deze methode werkt bewust in bulk. Een import die per klant tien losse vragen
   * aan de database stelt, duurt bij een gehoste database al gauw een halve minuut
   * en wordt door een serverless platform afgekapt. Nu is het: één keer alles
   * inlezen, in het geheugen beslissen, en enkel schrijven wat echt verandert.
   */
  async importeer(rijen) {
    const rapport = { nieuw: 0, bijgewerkt: 0, ongewijzigd: 0, mislukt: [] };

    // 1. alles eerst controleren, zonder de database aan te raken
    const teDoen = [];
    for (const [i, ruw] of rijen.entries()) {
      const res = validateCustomer(ruw);
      if (res.ok) teDoen.push({ rij: i + 2, waarde: res.value });
      else rapport.mislukt.push({ rij: i + 2, naam: ruw.name ?? '', fouten: res.errors });
    }
    if (!teDoen.length) return rapport;

    // 2. één query voor alle bestaande klanten, en drie manieren om ze terug te vinden
    const bestaanden = await this.db.all(
      `SELECT id, ${VELDEN.join(', ')} FROM customers`);
    const opExternId = new Map();
    const opBtw = new Map();
    const opNaamPostcode = new Map();
    const sleutel = (naam, postcode) => `${String(naam).toLowerCase()}|${postcode}`;
    for (const k of bestaanden) {
      if (k.external_id) opExternId.set(k.external_id, k);
      if (k.vat_number) opBtw.set(k.vat_number, k);
      if (k.name && k.postal_code) opNaamPostcode.set(sleutel(k.name, k.postal_code), k);
    }
    const zoek = (v) => (v.external_id && opExternId.get(v.external_id))
      || (v.vat_number && opBtw.get(v.vat_number))
      || (v.name && v.postal_code && opNaamPostcode.get(sleutel(v.name, v.postal_code)))
      || null;

    // 3. in het geheugen bepalen wat er moet gebeuren
    const tijd = nu();
    const tagsPerKlant = [];

    for (const { rij, waarde } of teDoen) {
      const bestaande = zoek(waarde);

      if (!bestaande) {
        const kolommen = VELDEN.filter((f) => f in waarde);
        try {
          const id = await this.db.insert(
            `INSERT INTO customers (${kolommen.join(', ')}, created_at, updated_at)
             VALUES (${kolommen.map(() => '?').join(', ')}, ?, ?)`,
            [...kolommen.map((c) => waarde[c]), tijd, tijd],
          );
          rapport.nieuw++;
          if (waarde.tags?.length) tagsPerKlant.push({ id, tags: waarde.tags });
          // meteen vindbaar maken: twee rijen met dezelfde klant mogen geen dubbel geven
          const vers = { id, ...waarde };
          if (vers.external_id) opExternId.set(vers.external_id, vers);
          if (vers.vat_number) opBtw.set(vers.vat_number, vers);
          if (vers.name && vers.postal_code) opNaamPostcode.set(sleutel(vers.name, vers.postal_code), vers);
        } catch (err) {
          rapport.mislukt.push({ rij, naam: waarde.name, fouten: [err.message] });
        }
        continue;
      }

      const wijzigingen = {};
      for (const veld of IMPORT_VELDEN) {
        const nieuweWaarde = waarde[veld];
        if (nieuweWaarde !== undefined && nieuweWaarde !== '' && nieuweWaarde !== bestaande[veld]) {
          wijzigingen[veld] = nieuweWaarde;
        }
      }
      // een leeg CRM-id vullen we alsnog aan, zodat de volgende import zeker matcht
      if (waarde.external_id && !bestaande.external_id) wijzigingen.external_id = waarde.external_id;
      // de stip alleen zetten als er nog geen staat: handmatig werk gaat voor
      if (bestaande.lat === null && waarde.lat != null) {
        wijzigingen.lat = waarde.lat;
        wijzigingen.lon = waarde.lon;
      }

      if (!Object.keys(wijzigingen).length) {
        rapport.ongewijzigd++;
        continue;
      }
      const kolommen = Object.keys(wijzigingen);
      try {
        await this.db.run(
          `UPDATE customers SET ${kolommen.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
          [...kolommen.map((c) => wijzigingen[c]), tijd, bestaande.id],
        );
        Object.assign(bestaande, wijzigingen);
        rapport.bijgewerkt++;
      } catch (err) {
        rapport.mislukt.push({ rij, naam: waarde.name, fouten: [err.message] });
      }
    }

    // 4. tags van de nieuwe klanten in één keer koppelen
    if (tagsPerKlant.length) await this.#koppelTagsInBulk(tagsPerKlant);

    return rapport;
  }

  /** Zet tags voor veel klanten tegelijk, met een handvol queries in plaats van per klant. */
  async #koppelTagsInBulk(tagsPerKlant) {
    const alleNamen = [...new Set(tagsPerKlant.flatMap((t) => t.tags))];
    const bestaande = new Map(
      (await this.db.all('SELECT id, name FROM tags')).map((t) => [t.name, t.id]),
    );
    for (const naam of alleNamen) {
      if (!bestaande.has(naam)) {
        bestaande.set(naam, await this.db.insert('INSERT INTO tags(name) VALUES(?)', [naam]));
      }
    }

    const koppels = tagsPerKlant.flatMap(({ id, tags }) => tags.map((t) => [id, bestaande.get(t)]));
    // in stukken: databases hebben een grens op het aantal parameters per query
    for (let i = 0; i < koppels.length; i += 500) {
      const stuk = koppels.slice(i, i + 500);
      await this.db.run(
        `INSERT INTO customer_tags(customer_id, tag_id) VALUES ${stuk.map(() => '(?, ?)').join(', ')}`,
        stuk.flat(),
      );
    }
  }

  // ---------- klanten op de kaart zetten ----------

  /**
   * Zet in één keer alle klanten zonder stip op de kaart, op het middelpunt van
   * hun gemeente. Gebeurt volledig met de ingebouwde plaatsenlijst: geen externe
   * dienst, geen wachtrij, geen limiet.
   *
   * Wie al een stip heeft blijft ongemoeid — ook wie hem zelf versleept heeft.
   * @returns {Promise<{geplaatst: number, nietGevonden: Array, alGeplaatst: number}>}
   */
  async plaatsOpKaart() {
    const zonder = await this.db.all(
      'SELECT id, name, postal_code, city, country FROM customers WHERE lat IS NULL OR lon IS NULL');
    const alGeplaatst = Number((await this.db.get(
      'SELECT COUNT(*) AS n FROM customers WHERE lat IS NOT NULL')).n);

    // eerst opzoeken, dan pas schrijven: zo weten we hoeveel klanten dezelfde
    // gemeente delen en kunnen we hun stippen uit elkaar leggen
    const perGemeente = new Map();
    const nietGevonden = [];
    for (const klant of zonder) {
      const plaats = zoekPlaats(klant.city);
      if (!plaats) {
        nietGevonden.push({ id: klant.id, naam: klant.name, gemeente: klant.city || '(geen gemeente)' });
        continue;
      }
      const sleutel = `${plaats.lat},${plaats.lon}`;
      if (!perGemeente.has(sleutel)) perGemeente.set(sleutel, { plaats, klanten: [] });
      perGemeente.get(sleutel).klanten.push(klant);
    }

    const tijd = nu();
    let geplaatst = 0;
    for (const { plaats, klanten } of perGemeente.values()) {
      for (const klant of klanten) {
        const punt = spreid(plaats, klant.id, klanten.length);
        await this.db.run(
          'UPDATE customers SET lat = ?, lon = ?, locatie_bron = ?, updated_at = ? WHERE id = ?',
          [punt.lat, punt.lon, 'gemeente', tijd, klant.id],
        );
        geplaatst++;
      }
    }
    return { geplaatst, nietGevonden, alGeplaatst, zonderStip: zonder.length };
  }

  // ---------- overzicht ----------

  async tellingen() {
    const alle = await this.listCustomers();
    const drempels = await this.instellingen.drempels();
    const perProvincie = {};
    for (const k of alle) if (k.provincie) perProvincie[k.provincie] = (perProvincie[k.provincie] ?? 0) + 1;
    return {
      totaal: alle.length,
      nieuw: alle.filter((k) => k.bucket === 'nieuw').length,
      recent: alle.filter((k) => k.bucket === 'recent').length,
      tijdje: alle.filter((k) => k.bucket === 'tijdje').length,
      lang: alle.filter((k) => k.bucket === 'lang').length,
      zonder_stip: alle.filter((k) => !k.op_kaart).length,
      per_provincie: Object.entries(perProvincie).sort((a, b) => b[1] - a[1]),
      drempels,
    };
  }
}
