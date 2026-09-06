import { toast } from './util.js';

async function vraag(pad, opties = {}) {
  const res = await fetch(pad, {
    headers: opties.body ? { 'content-type': 'application/json' } : {},
    ...opties,
    body: opties.body ? JSON.stringify(opties.body) : undefined,
  });
  const tekst = await res.text();
  const data = tekst ? JSON.parse(tekst) : null;
  if (!res.ok) {
    const fouten = data?.errors ?? ['Er ging iets mis.'];
    const err = new Error(fouten[0]);
    err.fouten = fouten;
    err.status = res.status;
    throw err;
  }
  return data;
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return s ? `?${s}` : '';
};

export const api = {
  overzicht: () => vraag('/api/overzicht'),
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
