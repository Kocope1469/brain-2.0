import { createHash } from 'node:crypto';
import { nu } from './db.js';

/**
 * Beveiligingsheaders. Ze staan hier bij elkaar zodat duidelijk is wat er wel en
 * niet mag: scripts en stijlen enkel van onszelf, kaarttegels enkel van
 * OpenStreetMap, en de pagina mag niet in een frame van iemand anders staan.
 *
 * 'unsafe-inline' voor stijlen is nodig omdat Leaflet zijn kaartlagen met
 * style-attributen positioneert. Voor scripts staat het er bewust níet:
 * daar zit het echte risico.
 */
export const HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
};

/** Alleen zinvol achter HTTPS; Vercel zet dat zelf al af voor lokale adressen. */
export const HSTS = 'max-age=15552000; includeSubDomains';

export function zetHeaders(res, { https = false } = {}) {
  for (const [naam, waarde] of Object.entries(HEADERS)) res.setHeader(naam, waarde);
  if (https) res.setHeader('strict-transport-security', HSTS);
}

/** Het IP van de bezoeker. Achter Vercel staat het echte adres in x-forwarded-for. */
export function bezoekerIp(req) {
  const doorgestuurd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return doorgestuurd || req.socket?.remoteAddress || 'onbekend';
}

const VENSTER_MINUTEN = 15;
const MAX_PER_ACCOUNT = 8;
const MAX_PER_IP = 25;

/**
 * Bescherming tegen wachtwoorden raden. De pogingen staan in de database en niet
 * in het geheugen: op Vercel draait elke aanvraag mogelijk op een andere instantie,
 * en een teller in het geheugen zou dan niets tegenhouden.
 */
export class Pogingen {
  constructor(db) {
    this.db = db;
  }

  #grens() {
    return new Date(Date.now() - VENSTER_MINUTEN * 60000).toISOString().replace('T', ' ').slice(0, 19);
  }

  async noteerMislukking(ip, email) {
    await this.db.run('INSERT INTO login_attempts(ip, email, at) VALUES(?,?,?)',
      [String(ip).slice(0, 64), String(email ?? '').toLowerCase().slice(0, 200), nu()]);
  }

  /** Na een geslaagde aanmelding is de teller voor dat account weer schoon. */
  async wisVoor(email) {
    await this.db.run('DELETE FROM login_attempts WHERE email = ?', [String(email ?? '').toLowerCase()]);
  }

  async opruimen() {
    await this.db.run('DELETE FROM login_attempts WHERE at < ?', [this.#grens()]);
  }

  /**
   * @returns {Promise<{geblokkeerd: boolean, minuten: number}>}
   */
  async controleer(ip, email) {
    const grens = this.#grens();
    const perAccount = Number((await this.db.get(
      'SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND at >= ?',
      [String(email ?? '').toLowerCase(), grens],
    )).n);
    const perIp = Number((await this.db.get(
      'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at >= ?',
      [String(ip).slice(0, 64), grens],
    )).n);
    return {
      geblokkeerd: perAccount >= MAX_PER_ACCOUNT || perIp >= MAX_PER_IP,
      minuten: VENSTER_MINUTEN,
      perAccount,
      perIp,
    };
  }
}

/**
 * Sessietokens gaan gehasht de database in. Lekt de database ooit, dan kan
 * niemand met die rijen alsnog inloggen — net zoals bij wachtwoorden.
 * Sha256 volstaat hier: een token van 32 willekeurige bytes valt niet te raden.
 */
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

export { VENSTER_MINUTEN, MAX_PER_ACCOUNT, MAX_PER_IP };
