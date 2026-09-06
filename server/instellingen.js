import { nu } from './db.js';

/**
 * Instellingen die de zaakvoerder zelf kan wijzigen. Ze staan in de database en
 * niet in de code: zo geldt een aanpassing meteen voor iedereen, zonder dat er
 * iemand opnieuw moet deployen.
 */

export const STANDAARD = {
  // een klant is "recent bezocht" tot en met zoveel dagen na het laatste bezoek
  drempel_recent: 30,
  // daarna "een tijdje geleden", tot en met zoveel dagen; daarna rood
  drempel_tijdje: 90,
};

const MAX_DAGEN = 3650; // tien jaar; verder heeft een kleurgrens geen betekenis

/**
 * Controleert een stel drempels.
 * @returns {{ok: true, value: object} | {ok: false, errors: string[]}}
 */
export function validateDrempels(input = {}, huidig = STANDAARD) {
  const errors = [];
  const lees = (sleutel) => {
    if (!Object.hasOwn(input, sleutel)) return huidig[sleutel];
    const n = Number(String(input[sleutel]).trim());
    if (!Number.isInteger(n)) {
      errors.push(`${sleutel === 'drempel_recent' ? 'Recent bezocht' : 'Een tijdje geleden'} moet een heel getal dagen zijn.`);
      return huidig[sleutel];
    }
    return n;
  };

  const recent = lees('drempel_recent');
  const tijdje = lees('drempel_tijdje');

  if (!errors.length) {
    if (recent < 1) errors.push('"Recent bezocht" moet minstens 1 dag zijn.');
    if (tijdje <= recent) errors.push('"Een tijdje geleden" moet groter zijn dan "recent bezocht".');
    if (tijdje > MAX_DAGEN) errors.push(`Meer dan ${MAX_DAGEN} dagen (tien jaar) heeft geen zin.`);
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: { drempel_recent: recent, drempel_tijdje: tijdje } };
}

export class Instellingen {
  constructor(db) {
    this.db = db;
  }

  /** Alle instellingen, met de standaardwaarden voor wat nog niet gezet is. */
  async alles() {
    const rijen = await this.db.all('SELECT sleutel, waarde FROM settings');
    const opgeslagen = Object.fromEntries(rijen.map((r) => [r.sleutel, Number(r.waarde)]));
    return { ...STANDAARD, ...opgeslagen };
  }

  /** Alleen de twee kleurgrenzen, in de vorm die bucketVoor verwacht. */
  async drempels() {
    const alles = await this.alles();
    return { recent: alles.drempel_recent, tijdje: alles.drempel_tijdje };
  }

  async zet(input, doorWie = '') {
    const huidig = await this.alles();
    const res = validateDrempels(input, huidig);
    if (!res.ok) return res;

    for (const [sleutel, waarde] of Object.entries(res.value)) {
      const bestaat = await this.db.get('SELECT sleutel FROM settings WHERE sleutel = ?', [sleutel]);
      if (bestaat) {
        await this.db.run('UPDATE settings SET waarde = ?, updated_at = ?, updated_by = ? WHERE sleutel = ?',
          [String(waarde), nu(), String(doorWie).slice(0, 120), sleutel]);
      } else {
        await this.db.run('INSERT INTO settings(sleutel, waarde, updated_at, updated_by) VALUES(?,?,?,?)',
          [sleutel, String(waarde), nu(), String(doorWie).slice(0, 120)]);
      }
    }
    return { ok: true, value: await this.alles() };
  }
}
