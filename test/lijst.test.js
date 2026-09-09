import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sorteer, KOLOMMEN } from '../public/js/lijst.js';

/**
 * De lijst is een tweede manier om naar dezelfde klanten te kijken. Sorteren moet
 * doen wat je verwacht, ook bij klanten waar een veld leeg is — en dat zijn er in
 * een echte klantenlijst altijd een paar.
 */
const klanten = [
  { name: 'Beta', city: 'Gent', laatste_bezoek: '2026-01-10', aantal_bezoeken: 3 },
  { name: 'alfa', city: 'Aalst', laatste_bezoek: '2026-06-01', aantal_bezoeken: 12 },
  { name: 'Gamma', city: '', laatste_bezoek: '', aantal_bezoeken: 0 },
  { name: 'Delta', city: 'Brugge', laatste_bezoek: '2025-03-20', aantal_bezoeken: 1 },
];
const namen = (lijst) => lijst.map((k) => k.name);

describe('de lijst sorteren', () => {
  test('op naam, hoofdletters tellen niet mee', () => {
    assert.deepEqual(namen(sorteer(klanten, 'name', false)), ['alfa', 'Beta', 'Delta', 'Gamma']);
  });

  test('omgekeerd draait de volgorde om', () => {
    assert.deepEqual(namen(sorteer(klanten, 'name', true)), ['Gamma', 'Delta', 'Beta', 'alfa']);
  });

  test('op laatste bezoek: oudste eerst', () => {
    assert.deepEqual(namen(sorteer(klanten, 'laatste_bezoek', false)).slice(0, 3),
      ['Delta', 'Beta', 'alfa']);
  });

  test('klanten zonder waarde staan achteraan, ook omgekeerd', () => {
    assert.equal(namen(sorteer(klanten, 'laatste_bezoek', false)).at(-1), 'Gamma');
    assert.equal(namen(sorteer(klanten, 'laatste_bezoek', true)).at(-1), 'Gamma',
      'wie nooit bezocht is hoort niet bovenaan te springen bij omgekeerd sorteren');
  });

  test('getallen sorteren als getallen, niet als tekst', () => {
    assert.deepEqual(sorteer(klanten, 'aantal_bezoeken', true).map((k) => k.aantal_bezoeken),
      [12, 3, 1, 0]);
  });

  test('de oorspronkelijke lijst blijft ongemoeid', () => {
    const voor = namen(klanten);
    sorteer(klanten, 'city', true);
    assert.deepEqual(namen(klanten), voor);
  });

  test('een onbekende kolom valt terug op de naam in plaats van te breken', () => {
    assert.deepEqual(namen(sorteer(klanten, 'bestaatniet', false)), ['alfa', 'Beta', 'Delta', 'Gamma']);
  });

  test('elke kolom in de kop is ook echt sorteerbaar', () => {
    for (const kolom of KOLOMMEN) {
      assert.equal(sorteer(klanten, kolom.sleutel, false).length, klanten.length, kolom.sleutel);
    }
  });
});
