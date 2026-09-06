const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);

const TEKSTVELDEN = [
  ['contact_name', 120], ['role', 120], ['phone', 40], ['website', 200],
  ['street', 200], ['postal_code', 20], ['city', 120], ['source', 120], ['notes', 20000],
];

/**
 * Valideert en normaliseert wat er op een kaart komt te staan.
 * @returns {{ok: true, value: object} | {ok: false, errors: string[]}}
 */
export function validateCustomer(input = {}, { partial = false } = {}) {
  const errors = [];
  const value = {};
  const has = (k) => Object.hasOwn(input, k);

  if (!partial || has('company_name')) {
    const naam = clean(input.company_name, 200);
    if (!naam) errors.push('Naam is verplicht — zonder naam is het geen kaart.');
    value.company_name = naam;
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
  if (!partial || has('country')) {
    value.country = clean(input.country, 2).toUpperCase() || 'BE';
  }
  for (const [key, max] of TEKSTVELDEN) {
    if (!partial || has(key)) value[key] = clean(input[key], max);
  }
  if (has('tags')) {
    const ruw = Array.isArray(input.tags) ? input.tags : String(input.tags ?? '').split(',');
    value.tags = [...new Set(ruw.map((t) => clean(t, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}
