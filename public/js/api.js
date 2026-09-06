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
    const err = new Error((data?.errors ?? ['Er ging iets mis.'])[0]);
    err.fouten = data?.errors ?? ['Er ging iets mis.'];
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
  meta: () => vraag('/api/meta'),
  stats: () => vraag('/api/stats'),
  klanten: (filters = {}) => vraag(`/api/klanten${qs(filters)}`),
  klant: (id) => vraag(`/api/klanten/${id}`),
  nieuweKlant: (data) => vraag('/api/klanten', { method: 'POST', body: data }),
  wijzigKlant: (id, data) => vraag(`/api/klanten/${id}`, { method: 'PATCH', body: data }),
  verwijderKlant: (id) => vraag(`/api/klanten/${id}`, { method: 'DELETE' }),
  contact: (id, data) => vraag(`/api/klanten/${id}/contact`, { method: 'POST', body: data }),
  opdracht: (id, data) => vraag(`/api/klanten/${id}/opdrachten`, { method: 'POST', body: data }),
  taak: (id, data) => vraag(`/api/klanten/${id}/taken`, { method: 'POST', body: data }),
  taken: () => vraag('/api/taken'),
  vinkTaak: (id, done) => vraag(`/api/taken/${id}`, { method: 'PATCH', body: { done } }),
  verwijder: (soort, id) => vraag(`/api/${soort}/${id}`, { method: 'DELETE' }),
  importeer: (csv) => vraag('/api/klanten/import', { method: 'POST', body: { csv } }),
};

/** Voert een actie uit en toont de foutmelding als het misgaat. */
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
