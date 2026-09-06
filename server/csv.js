/** Minimale, correcte CSV-parser (RFC 4180-stijl): quotes, ingesloten komma's en newlines. */
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Raadt de scheidingsteken: puntkomma is standaard in Excel NL/BE. */
export function detectDelimiter(text) {
  const line = String(text ?? '').split('\n')[0] ?? '';
  return (line.split(';').length > line.split(',').length) ? ';' : ',';
}

export function toCsv(rows, columns, delimiter = ';') {
  const esc = (v) => {
    const s = String(v ?? '');
    return /["\n;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label ?? c.key)).join(delimiter);
  const body = rows.map((r) => columns.map((c) => esc(c.value ? c.value(r) : r[c.key])).join(delimiter));
  return ['﻿' + head, ...body].join('\r\n');
}

/** Kolomnamen uit een geimporteerd bestand omzetten naar velden van de klantenkaart. */
const HEADER_ALIASES = {
  external_id: ['crm-id', 'crm id', 'crmid', 'klantnummer', 'klantnr', 'id', 'externe id', 'external_id', 'referentie'],
  name: ['bedrijf', 'bedrijfsnaam', 'naam', 'klant', 'company', 'company_name', 'organisatie'],
  contact_name: ['contact', 'contactpersoon', 'contact_name', 'aanspreekpunt'],
  email: ['email', 'e-mail', 'mail', 'emailadres', 'e-mailadres'],
  phone: ['telefoon', 'tel', 'gsm', 'phone', 'telefoonnummer'],
  website: ['website', 'site', 'url', 'web'],
  vat_number: ['btw', 'btw-nummer', 'btw_nummer', 'vat', 'vat_number', 'ondernemingsnummer'],
  street: ['straat', 'adres', 'street', 'address'],
  postal_code: ['postcode', 'postal_code', 'zip'],
  city: ['gemeente', 'stad', 'plaats', 'city'],
  country: ['land', 'country'],
  lat: ['breedtegraad', 'lat', 'latitude'],
  lon: ['lengtegraad', 'lon', 'lng', 'longitude'],
  notes: ['omschrijving', 'notitie', 'notities', 'intro', 'opmerking', 'opmerkingen', 'notes'],
  tags: ['tags', 'labels', 'tag', 'label'],
};

export function mapHeaders(header) {
  return header.map((h) => {
    const norm = String(h ?? '').trim().toLowerCase().replace(/^﻿/, '');
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(norm)) return field;
    }
    return null;
  });
}

/** Zet ruwe CSV om naar klantobjecten. Onbekende kolommen worden genegeerd. */
export function csvToCustomers(text) {
  const rows = parseCsv(text, detectDelimiter(text));
  if (!rows.length) return { customers: [], unmapped: [] };
  const [header, ...body] = rows;
  const fields = mapHeaders(header);
  const unmapped = header.filter((h, i) => fields[i] === null && String(h).trim() !== '');
  const customers = body.map((r) => {
    const obj = {};
    fields.forEach((f, i) => { if (f) obj[f] = (r[i] ?? '').trim(); });
    return obj;
  }).filter((o) => o.name);
  return { customers, unmapped };
}
