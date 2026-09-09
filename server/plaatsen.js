import PLAATSEN from './data/be-plaatsen.js';

/**
 * Klanten op de kaart zetten zonder externe dienst.
 *
 * In server/data/be-plaatsen.js staat voor 1720 Belgische plaatsnamen het
 * middelpunt. Dat is genoeg om te zien wie er bij elkaar in de buurt zit, en het
 * werkt onmiddellijk: geen wachtrij, geen limiet, geen internet nodig. Wie een
 * stip preciezer wil, versleept hem zelf of laat het adres opzoeken.
 */

/** Namen vergelijkbaar maken: zonder accenten, streepjes, spaties of hoofdletters. */
export const naamSleutel = (naam) => String(naam ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Zoekt het middelpunt van een gemeente, met terugvalstappen voor fusiegemeenten
 * ("Merelbeke-Melle") en namen met een toevoeging ("Pluim (Z)").
 * @returns {{lat: number, lon: number, hoe: string} | null}
 */
export function zoekPlaats(gemeente) {
  const sleutel = naamSleutel(gemeente);
  if (!sleutel) return null;

  const treffer = PLAATSEN[sleutel];
  if (treffer) return { lat: treffer[0], lon: treffer[1], hoe: 'gemeente' };

  // "Merelbeke-Melle" of "Nazareth-De Pinte": probeer elk deel apart
  for (const deel of String(gemeente).split(/[-/(,]/)) {
    const deelSleutel = naamSleutel(deel);
    if (deelSleutel.length > 2 && PLAATSEN[deelSleutel]) {
      const p = PLAATSEN[deelSleutel];
      return { lat: p[0], lon: p[1], hoe: 'deel van de gemeentenaam' };
    }
  }

  // laatste poging: een naam die met deze begint of andersom
  for (const [naam, p] of Object.entries(PLAATSEN)) {
    if (naam.length > 3 && (naam.startsWith(sleutel) || sleutel.startsWith(naam))) {
      return { lat: p[0], lon: p[1], hoe: 'gelijkende gemeentenaam' };
    }
  }
  return null;
}

/**
 * Zet klanten uit dezelfde gemeente niet exact op elkaar: twee stippen die
 * samenvallen zijn er visueel één en niet meer aan te klikken. De verschuiving is
 * hooguit een paar honderd meter — ruim binnen de gemeente, en binnen de
 * onnauwkeurigheid van een gemeentemiddelpunt. De verschuiving hangt af van het
 * klantnummer, zodat een stip niet verspringt als je de pagina herlaadt.
 */
export function spreid({ lat, lon }, id, aantalInGemeente = 1) {
  if (aantalInGemeente <= 1) return { lat, lon };
  const hoek = (Number(id) * 137.508) * (Math.PI / 180); // gulden hoek: mooie spreiding
  const straal = 0.0012 * Math.sqrt(1 + (Number(id) % 5)); // 130 tot 300 meter
  return {
    lat: +(lat + straal * Math.sin(hoek)).toFixed(6),
    lon: +(lon + straal * Math.cos(hoek) / Math.cos(lat * Math.PI / 180)).toFixed(6),
  };
}

export const aantalPlaatsen = () => Object.keys(PLAATSEN).length;
