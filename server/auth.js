import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { nu } from './db.js';

const scryptAsync = promisify(scrypt);

const SESSIE_DAGEN = 30;
const COOKIE = 'kk_sessie';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/**
 * Wachtwoorden gaan door scrypt met een eigen salt per gebruiker. Het resultaat
 * bewaren we als "scrypt$<salt>$<hash>", zodat we later van parameters kunnen
 * wisselen zonder de bestaande wachtwoorden ongeldig te maken.
 */
export async function hashWachtwoord(wachtwoord) {
  const salt = randomBytes(16);
  const afgeleid = await scryptAsync(wachtwoord, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${afgeleid.toString('base64')}`;
}

/** Vergelijkt in constante tijd, zodat de duur niets over het wachtwoord verraadt. */
export async function klopWachtwoord(wachtwoord, opgeslagen) {
  const [soort, saltB64, hashB64] = String(opgeslagen ?? '').split('$');
  if (soort !== 'scrypt' || !saltB64 || !hashB64) return false;
  const verwacht = Buffer.from(hashB64, 'base64');
  const afgeleid = await scryptAsync(wachtwoord, Buffer.from(saltB64, 'base64'), verwacht.length, SCRYPT);
  return timingSafeEqual(afgeleid, verwacht);
}

export function controleerWachtwoord(wachtwoord) {
  const w = String(wachtwoord ?? '');
  if (w.length < 10) return 'Kies een wachtwoord van minstens 10 tekens.';
  if (/^\d+$/.test(w)) return 'Een wachtwoord van enkel cijfers is te makkelijk te raden.';
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class Auth {
  constructor(db) {
    this.db = db;
  }

  async aantalGebruikers() {
    return Number((await this.db.get('SELECT COUNT(*) AS n FROM users')).n);
  }

  async gebruikers() {
    return this.db.all('SELECT id, email, name, created_at FROM users ORDER BY LOWER(email)');
  }

  async maakGebruiker({ email, name = '', wachtwoord }) {
    const adres = String(email ?? '').trim().toLowerCase();
    const fouten = [];
    if (!EMAIL_RE.test(adres)) fouten.push('E-mailadres is ongeldig.');
    const wachtwoordFout = controleerWachtwoord(wachtwoord);
    if (wachtwoordFout) fouten.push(wachtwoordFout);
    if (fouten.length) return { ok: false, errors: fouten };

    if (await this.db.get('SELECT id FROM users WHERE email = ?', [adres])) {
      return { ok: false, errors: ['Er bestaat al een gebruiker met dit e-mailadres.'] };
    }
    const id = await this.db.insert(
      'INSERT INTO users(email, name, password_hash, created_at) VALUES(?,?,?,?)',
      [adres, String(name ?? '').trim().slice(0, 120), await hashWachtwoord(wachtwoord), nu()],
    );
    return { ok: true, value: { id, email: adres, name } };
  }

  async verwijderGebruiker(id) {
    if (await this.aantalGebruikers() <= 1) {
      return { ok: false, errors: ['Dit is de laatste gebruiker; die kun je niet verwijderen.'] };
    }
    const weg = (await this.db.run('DELETE FROM users WHERE id = ?', [id])).changes > 0;
    return weg ? { ok: true } : { ok: false, notFound: true };
  }

  async wijzigWachtwoord(id, wachtwoord) {
    const fout = controleerWachtwoord(wachtwoord);
    if (fout) return { ok: false, errors: [fout] };
    const res = await this.db.run('UPDATE users SET password_hash = ? WHERE id = ?',
      [await hashWachtwoord(wachtwoord), id]);
    if (!res.changes) return { ok: false, notFound: true };
    // alle sessies van deze gebruiker vervallen: een nieuw wachtwoord hoort oude toegang te sluiten
    await this.db.run('DELETE FROM sessions WHERE user_id = ?', [id]);
    return { ok: true };
  }

  /** @returns {Promise<{ok:true, token:string, gebruiker:object} | {ok:false}>} */
  async login(email, wachtwoord) {
    const adres = String(email ?? '').trim().toLowerCase();
    const gebruiker = await this.db.get('SELECT * FROM users WHERE email = ?', [adres]);
    // ook zonder gevonden gebruiker rekenen we een hash door, zodat de responstijd
    // niet verraadt welke adressen bestaan
    const opgeslagen = gebruiker?.password_hash ?? await hashWachtwoord('onbestaand-wachtwoord');
    if (!await klopWachtwoord(String(wachtwoord ?? ''), opgeslagen) || !gebruiker) return { ok: false };

    const token = randomBytes(32).toString('base64url');
    const verloopt = new Date(Date.now() + SESSIE_DAGEN * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    await this.db.run('INSERT INTO sessions(token, user_id, expires_at, created_at) VALUES(?,?,?,?)',
      [token, gebruiker.id, verloopt, nu()]);
    return { ok: true, token, gebruiker: { id: gebruiker.id, email: gebruiker.email, name: gebruiker.name } };
  }

  async logout(token) {
    if (token) await this.db.run('DELETE FROM sessions WHERE token = ?', [token]);
  }

  /** Geeft de ingelogde gebruiker terug, of null. Ruimt meteen vervallen sessies op. */
  async gebruikerVoorToken(token) {
    if (!token) return null;
    const rij = await this.db.get(`
      SELECT u.id, u.email, u.name, s.expires_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`, [token]);
    if (!rij) return null;
    if (rij.expires_at <= nu()) {
      await this.db.run('DELETE FROM sessions WHERE token = ?', [token]);
      return null;
    }
    return { id: rij.id, email: rij.email, name: rij.name };
  }

  async ruimVervallenSessies() {
    await this.db.run('DELETE FROM sessions WHERE expires_at <= ?', [nu()]);
  }
}

export function leesCookie(header, naam = COOKIE) {
  for (const deel of String(header ?? '').split(';')) {
    const [k, ...rest] = deel.trim().split('=');
    if (k === naam) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessieCookie(token, { veilig = true } = {}) {
  const delen = [
    `${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${token ? SESSIE_DAGEN * 86400 : 0}`,
  ];
  if (veilig) delen.push('Secure');
  return delen.join('; ');
}

export { COOKIE, SESSIE_DAGEN };
