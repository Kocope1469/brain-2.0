import { toast } from './util.js';

async function vraag(pad, opties = {}) {
  const res = await fetch(pad, {
    headers: opties.body ? { 'content-type': 'application/json' } : {},
    ...opties,
    body: opties.body ? JSON.stringify(opties.body) : undefined,
  });
  const tekst = await res.text();

  // niet blind parsen: gaat de server of het hostingplatform onderuit, dan komt
  // er een tekstpagina terug en zou JSON.parse een onbegrijpelijke fout geven
  let data = null;
  try {
    data = tekst ? JSON.parse(tekst) : null;
  } catch {
    if (res.ok) throw new Error('De server gaf een onverwacht antwoord.');
  }

  if (res.status === 401) {
    location.replace('/login');
    throw new Error('Niet meer aangemeld.');
  }
  if (!res.ok) {
    const fouten = data?.errors ?? [`De server antwoordde met een fout (${res.status}).`];
    const err = new Error(fouten[0]);
    err.fouten = fouten;
    err.status = res.status;
    if (data?.hulp) err.fouten.push(data.hulp);
    throw err;
  }
  return data;
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return s ? `?${s}` : '';
};

export const api = {
  sessie: () => vraag('/api/sessie'),
  uitloggen: () => vraag('/api/sessie', { method: 'DELETE' }),
  gebruikers: () => vraag('/api/gebruikers'),
  nieuweGebruiker: (data) => vraag('/api/gebruikers', { method: 'POST', body: data }),
  verwijderGebruiker: (id) => vraag(`/api/gebruikers/${id}`, { method: 'DELETE' }),
  wijzigWachtwoord: (id, wachtwoord) => vraag(`/api/gebruikers/${id}`, { method: 'PATCH', body: { wachtwoord } }),
  overzicht: () => vraag('/api/overzicht'),
  instellingen: () => vraag('/api/instellingen'),
  zetInstellingen: (data) => vraag('/api/instellingen', { method: 'PATCH', body: data }),
  klanten: (filters = {}) => vraag(`/api/klanten${qs(filters)}`),
  klant: (id) => vraag(`/api/klanten/${id}`),
  nieuweKlant: (data) => vraag('/api/klanten', { method: 'POST', body: data }),
  wijzigKlant: (id, data) => vraag(`/api/klanten/${id}`, { method: 'PATCH', body: data }),
  verwijderKlant: (id) => vraag(`/api/klanten/${id}`, { method: 'DELETE' }),
  nieuwBezoek: (id, data) => vraag(`/api/klanten/${id}/bezoeken`, { method: 'POST', body: data }),
  verwijderBezoek: (id) => vraag(`/api/bezoeken/${id}`, { method: 'DELETE' }),
  geocode: (adres) => vraag('/api/geocode', { method: 'POST', body: { adres } }),
  importeer: (csv) => vraag('/api/klanten/import', { method: 'POST', body: { csv } }),
};

export async function probeer(actie, succesbericht) {
  try {
    const resultaat = await actie();
    if (succesbericht) toast(succesbericht);
    return resultaat;
  } catch (err) {
    toast(err.message, 'fout');
    throw err;
  }
}
