const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Terugvalwaarden voor de kleurgrenzen. Wat er echt gebruikt wordt, staat in de
 * database en is via Instellingen aan te passen — zie server/instellingen.js.
 */
export const DREMPELS = { recent: 30, tijdje: 90 };

export const BUCKETS = ['recent', 'tijdje', 'lang'];

/** Hoe een stip op de kaart terechtgekomen is. */
export const LOCATIE_BRONNEN = ['', 'handmatig', 'gemeente', 'adres'];

/**
 * Belgische postcodereeksen per provincie. Zo krijg je een regiofilter zonder
 * externe gegevensbron of geocoder: de postcode staat al in het CRM.
 */
const POSTCODEREEKSEN = [
  [1000, 1299, 'Brussel'],
  [1300, 1499, 'Waals-Brabant'],
  [1500, 1999, 'Vlaams-Brabant'],
  [2000, 2999, 'Antwerpen'],
  [3000, 3499, 'Vlaams-Brabant'],
  [3500, 3999, 'Limburg'],
  [4000, 4999, 'Luik'],
  [5000, 5999, 'Namen'],
  [6000, 6599, 'Henegouwen'],
  [6600, 6999, 'Luxemburg'],
  [7000, 7999, 'Henegouwen'],
  [8000, 8999, 'West-Vlaanderen'],
  [9000, 9999, 'Oost-Vlaanderen'],
];

export const PROVINCIES = [...new Set(POSTCODEREEKSEN.map(([, , naam]) => naam))].sort();

/** Provincie bij een Belgische postcode, of '' als hij er niet in past. */
export function provincieVoor(postcode) {
  const cijfers = String(postcode ?? '').replace(/\D/g, '');
  if (cijfers.length !== 4) return '';
  const n = Number(cijfers);
  return POSTCODEREEKSEN.find(([van, tot]) => n >= van && n <= tot)?.[2] ?? '';
}

/**
 * In welke kleurgroep valt een klant, gegeven de datum van het laatste bezoek.
 * @param {object} [drempels] grenzen in dagen; standaard die uit DREMPELS
 */
export function bucketVoor(laatsteBezoek, vandaag = new Date(), drempels = DREMPELS) {
  if (!laatsteBezoek) return 'lang';
  const dagen = Math.floor((vandaag - new Date(`${laatsteBezoek}T00:00:00Z`)) / 86400000);
  if (dagen <= drempels.recent) return 'recent';
  if (dagen <= drempels.tijdje) return 'tijdje';
  return 'lang';
}

export function normalizeVat(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Belgische BTW-nummers gaan door de modulo-97-controle; andere enkel op vorm. */
export function isValidVat(raw) {
  const vat = normalizeVat(raw);
  if (!vat) return true;
  if (vat.startsWith('BE')) {
    const cijfers = vat.slice(2);
    if (!/^[01]\d{9}$/.test(cijfers)) return false;
    return 97 - (Number(cijfers.slice(0, 8)) % 97) === Number(cijfers.slice(8));
  }
  return /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vat);
}

export function formatVat(raw) {
  const vat = normalizeVat(raw);
  if (!vat.startsWith('BE') || vat.length !== 12) return vat;
  const d = vat.slice(2);
  return `BE ${d.slice(0, 4)}.${d.slice(4, 7)}.${d.slice(7)}`;
}

/** Coördinaat of null. Een klant zonder stip hoort niet stiekem op 0,0 te belanden. */
export function toCoord(waarde, max) {
  if (waarde === null || waarde === undefined || waarde === '') return null;
  const n = Number(String(waarde).replace(',', '.'));
  return Number.isFinite(n) && Math.abs(n) <= max ? n : undefined; // undefined = ongeldig
}

const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);

const TEKSTVELDEN = [
  ['contact_name', 120], ['phone', 40], ['street', 200],
  ['postal_code', 20], ['city', 120], ['notes', 20000], ['external_id', 80],
];

export function validateCustomer(input = {}, { partial = false } = {}) {
  const errors = [];
  const value = {};
  const has = (k) => Object.hasOwn(input, k);

  if (!partial || has('name')) {
    const naam = clean(input.name, 200);
    if (!naam) errors.push('Naam is verplicht.');
    value.name = naam;
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
  if (!partial || has('country')) value.country = clean(input.country, 2).toUpperCase() || 'BE';
  for (const [key, max] of TEKSTVELDEN) {
    if (!partial || has(key)) value[key] = clean(input[key], max);
  }

  if (has('lat') || has('lon')) {
    const lat = toCoord(input.lat, 90);
    const lon = toCoord(input.lon, 180);
    if (lat === undefined || lon === undefined) errors.push('Coördinaten zijn ongeldig.');
    else if ((lat === null) !== (lon === null)) errors.push('Geef breedte- én lengtegraad, of geen van beide.');
    else { value.lat = lat; value.lon = lon; }
  }

  if (has('locatie_bron')) {
    const bron = clean(input.locatie_bron, 20);
    if (!LOCATIE_BRONNEN.includes(bron)) errors.push('Onbekende herkomst van de locatie.');
    else value.locatie_bron = bron;
  }

  if (has('tags')) {
    const ruw = Array.isArray(input.tags) ? input.tags : String(input.tags ?? '').split(',');
    value.tags = [...new Set(ruw.map((t) => clean(t, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function validateVisit(input = {}) {
  const errors = [];
  const visit_date = clean(input.visit_date, 10) || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(visit_date)) errors.push('Datum moet in formaat JJJJ-MM-DD staan.');
  else if (visit_date > new Date().toISOString().slice(0, 10)) errors.push('Een bezoek kan niet in de toekomst liggen.');
  const with_whom = clean(input.with_whom, 120);
  const notes = clean(input.notes, 10000);
  if (!notes && !with_whom) errors.push('Noteer met wie je sprak of waarover het ging.');
  return errors.length ? { ok: false, errors } : { ok: true, value: { visit_date, with_whom, notes } };
}
