/**
 * Adres omzetten naar coördinaten via Nominatim (OpenStreetMap).
 *
 * Dit is een gratis dienst met een gebruiksbeleid: één verzoek per seconde en een
 * herkenbare User-Agent. Daarom staat er een wachtrij omheen en cachen we elk
 * antwoord in het geheugen. Lukt het niet — geen internet, dienst plat, adres
 * onbekend — dan geeft dit null terug en zet de gebruiker de stip zelf.
 */

const CACHE = new Map();
const WACHT_MS = 1100;
let laatsteVerzoek = 0;

const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

export function adresRegel({ street = '', postal_code = '', city = '', country = 'BE' } = {}) {
  return [street, [postal_code, city].filter(Boolean).join(' '), country]
    .map((d) => d.trim()).filter(Boolean).join(', ');
}

/**
 * @returns {Promise<{lat:number, lon:number, omschrijving:string} | null>}
 */
export async function geocode(adres, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const zoek = String(adres ?? '').trim();
  if (zoek.length < 4) return null;
  if (CACHE.has(zoek)) return CACHE.get(zoek);

  const sindsLaatste = Date.now() - laatsteVerzoek;
  if (sindsLaatste < WACHT_MS) await slaap(WACHT_MS - sindsLaatste);
  laatsteVerzoek = Date.now();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', zoek);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const stop = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: stop,
      headers: { 'user-agent': 'Klantenkaart/1.0 (zelfgehost)', 'accept-language': 'nl' },
    });
    if (!res.ok) return null;
    const treffers = await res.json();
    const eerste = Array.isArray(treffers) ? treffers[0] : null;
    if (!eerste) {
      CACHE.set(zoek, null);
      return null;
    }
    const resultaat = {
      lat: Number(eerste.lat),
      lon: Number(eerste.lon),
      omschrijving: String(eerste.display_name ?? zoek),
    };
    if (!Number.isFinite(resultaat.lat) || !Number.isFinite(resultaat.lon)) return null;
    CACHE.set(zoek, resultaat);
    return resultaat;
  } catch {
    return null; // netwerk weg of te traag: de gebruiker zet de stip handmatig
  }
}
