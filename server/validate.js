export const STATUSES = ['prospect', 'actief', 'slapend', 'verloren'];
export const INTERACTION_TYPES = ['notitie', 'telefoon', 'email', 'bezoek', 'offerte', 'klacht'];
export const DEAL_STATUSES = ['offerte', 'gewonnen', 'verloren', 'gefactureerd', 'betaald'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliseert een BTW-nummer: verwijdert punten, spaties en streepjes, uppercase. */
export function normalizeVat(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Controleert een Belgisch BTW-nummer (BE 0xxx.xxx.xxx) met de modulo-97 controle.
 * Niet-Belgische nummers worden enkel op grofweg geldige vorm gecontroleerd.
 */
export function isValidVat(raw) {
  const vat = normalizeVat(raw);
  if (!vat) return true; // leeg mag
  if (vat.startsWith('BE')) {
    const digits = vat.slice(2);
    if (!/^[01]\d{9}$/.test(digits)) return false;
    const base = Number(digits.slice(0, 8));
    const check = Number(digits.slice(8));
    return 97 - (base % 97) === check;
  }
  return /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vat);
}

/** Toont een BTW-nummer leesbaar: BE 0123.456.749 */
export function formatVat(raw) {
  const vat = normalizeVat(raw);
  if (!vat.startsWith('BE') || vat.length !== 12) return vat;
  const d = vat.slice(2);
  return `BE ${d.slice(0, 4)}.${d.slice(4, 7)}.${d.slice(7)}`;
}

/** Zet "1.250,50" / "1250.50" / 1250.5 om naar hele centen. */
export function toCents(input) {
  if (input === null || input === undefined || input === '') return 0;
  if (typeof input === 'number') return Math.round(input * 100);
  let s = String(input).trim().replace(/[€\s]/g, '');
  if (s.includes(',') && s.includes('.')) {
    // 1.250,50 -> punt is duizendtal; 1,250.50 -> komma is duizendtal
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) {
    // 2.000 of 2,000 zonder decimalen -> duizendtalscheiding
    s = s.replace(/[.,]/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function clean(v, max = 500) {
  return String(v ?? '').trim().slice(0, max);
}

/**
 * Valideert en normaliseert klantgegevens.
 * @returns {{ok: true, value: object} | {ok: false, errors: string[]}}
 */
export function validateCustomer(input = {}, { partial = false } = {}) {
  const errors = [];
  const value = {};
  const has = (k) => Object.hasOwn(input, k);

  if (!partial || has('company_name')) {
    const name = clean(input.company_name, 200);
    if (!name) errors.push('Bedrijfsnaam is verplicht.');
    value.company_name = name;
  }
  if (!partial || has('email')) {
    const email = clean(input.email, 200).toLowerCase();
    if (email && !EMAIL_RE.test(email)) errors.push('E-mailadres is ongeldig.');
    value.email = email;
  }
  if (!partial || has('vat_number')) {
    const vat = normalizeVat(input.vat_number);
    if (!isValidVat(vat)) errors.push('BTW-nummer is ongeldig.');
    value.vat_number = vat;
  }
  if (!partial || has('status')) {
    const status = clean(input.status, 20) || 'prospect';
    if (!STATUSES.includes(status)) errors.push(`Status moet een van: ${STATUSES.join(', ')}.`);
    value.status = status;
  }
  if (!partial || has('country')) {
    const country = clean(input.country, 2).toUpperCase() || 'BE';
    value.country = country;
  }
  for (const [key, max] of [['contact_name', 120], ['phone', 40], ['website', 200],
    ['street', 200], ['postal_code', 20], ['city', 120], ['source', 120], ['intro', 5000]]) {
    if (!partial || has(key)) value[key] = clean(input[key], max);
  }
  if (has('archived')) value.archived = input.archived ? 1 : 0;

  if (has('tags')) {
    const raw = Array.isArray(input.tags) ? input.tags : String(input.tags ?? '').split(',');
    value.tags = [...new Set(raw.map((t) => clean(t, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function validateInteraction(input = {}) {
  const errors = [];
  const type = clean(input.type, 20) || 'notitie';
  if (!INTERACTION_TYPES.includes(type)) errors.push(`Type moet een van: ${INTERACTION_TYPES.join(', ')}.`);
  const subject = clean(input.subject, 200);
  const body = clean(input.body, 10000);
  if (!subject && !body) errors.push('Een contactmoment heeft een onderwerp of tekst nodig.');
  const occurred_at = clean(input.occurred_at, 10) || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(occurred_at)) errors.push('Datum moet in formaat JJJJ-MM-DD staan.');
  return errors.length ? { ok: false, errors } : { ok: true, value: { type, subject, body, occurred_at } };
}

export function validateDeal(input = {}) {
  const errors = [];
  const title = clean(input.title, 200);
  if (!title) errors.push('Omschrijving van de opdracht is verplicht.');
  const status = clean(input.status, 20) || 'offerte';
  if (!DEAL_STATUSES.includes(status)) errors.push(`Status moet een van: ${DEAL_STATUSES.join(', ')}.`);
  const amount_cents = toCents(input.amount ?? input.amount_cents_raw ?? 0);
  if (amount_cents < 0) errors.push('Bedrag kan niet negatief zijn.');
  const deal_date = clean(input.deal_date, 10) || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(deal_date)) errors.push('Datum moet in formaat JJJJ-MM-DD staan.');
  return errors.length ? { ok: false, errors } : { ok: true, value: { title, status, amount_cents, deal_date } };
}

export function validateTask(input = {}) {
  const errors = [];
  const title = clean(input.title, 200);
  if (!title) errors.push('Taakomschrijving is verplicht.');
  const due_date = clean(input.due_date, 10) || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(due_date)) errors.push('Vervaldatum moet in formaat JJJJ-MM-DD staan.');
  const done = input.done ? 1 : 0;
  return errors.length ? { ok: false, errors } : { ok: true, value: { title, due_date, done } };
}
