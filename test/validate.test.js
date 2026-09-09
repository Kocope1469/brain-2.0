import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidVat, normalizeVat, formatVat, toCoord,
  bucketVoor, validateCustomer, validateVisit,
} from '../server/validate.js';

describe('kleurgroep per klant', () => {
  const nu = new Date('2026-09-06T12:00:00Z');

  test('recent bezocht tot en met 30 dagen', () => {
    assert.equal(bucketVoor('2026-09-06', nu), 'recent');
    assert.equal(bucketVoor('2026-08-07', nu), 'recent');
  });

  test('een tijdje geleden tussen 31 en 90 dagen', () => {
    assert.equal(bucketVoor('2026-08-06', nu), 'tijdje');
    assert.equal(bucketVoor('2026-06-08', nu), 'tijdje');
  });

  test('lang niet bezocht vanaf 91 dagen', () => {
    assert.equal(bucketVoor('2026-06-07', nu), 'lang');
    assert.equal(bucketVoor('2020-01-01', nu), 'lang');
  });

  test('nooit bezocht is een eigen groep, geen verwaarloosde klant', () => {
    assert.equal(bucketVoor(null, nu), 'nieuw');
    assert.equal(bucketVoor('', nu), 'nieuw');
  });

  test('één bezoek volstaat om uit de nieuw-groep te raken', () => {
    assert.equal(bucketVoor('2020-01-01', nu), 'lang', 'lang geleden is niet hetzelfde als nooit');
  });
});

describe('BTW-nummers', () => {
  test('aanvaardt een geldig Belgisch nummer in elk formaat', () => {
    for (const vorm of ['BE0123456749', 'be 0123.456.749', 'BE 0123 456 749']) {
      assert.equal(isValidVat(vorm), true, vorm);
    }
  });

  test('verwerpt een fout controlegetal of een verkeerde vorm', () => {
    assert.equal(isValidVat('BE0123456748'), false);
    assert.equal(isValidVat('BE012345674'), false);
    assert.equal(isValidVat('BE9123456749'), false);
  });

  test('leeg mag, buitenlands wordt enkel op vorm gecontroleerd', () => {
    assert.equal(isValidVat(''), true);
    assert.equal(isValidVat('NL123456789B01'), true);
    assert.equal(isValidVat('12345'), false);
  });

  test('normaliseert en formatteert', () => {
    assert.equal(normalizeVat('be 0123.456.749'), 'BE0123456749');
    assert.equal(formatVat('be0123456749'), 'BE 0123.456.749');
  });
});

describe('coördinaten', () => {
  test('leest punt en komma als decimaalteken', () => {
    assert.equal(toCoord('51.0596', 90), 51.0596);
    assert.equal(toCoord('51,0596', 90), 51.0596);
    assert.equal(toCoord(3.7256, 180), 3.7256);
  });

  test('leeg betekent geen stip, niet nul', () => {
    assert.equal(toCoord('', 90), null);
    assert.equal(toCoord(null, 90), null);
  });

  test('onmogelijke waarden worden geweigerd', () => {
    assert.equal(toCoord('999', 90), undefined);
    assert.equal(toCoord('onzin', 90), undefined);
  });

  test('een klant krijgt beide coördinaten of geen', () => {
    assert.equal(validateCustomer({ name: 'X', lat: '51.0', lon: '3.7' }).ok, true);
    assert.equal(validateCustomer({ name: 'X', lat: '51.0', lon: '' }).ok, false);
    assert.equal(validateCustomer({ name: 'X', lat: '', lon: '' }).value.lat, null);
    assert.equal(validateCustomer({ name: 'X', lat: '900', lon: '3.7' }).ok, false);
  });
});

describe('klantgegevens', () => {
  test('naam is verplicht', () => {
    assert.equal(validateCustomer({ name: '  ' }).ok, false);
  });

  test('e-mail wordt gecontroleerd en verkleind', () => {
    assert.equal(validateCustomer({ name: 'X', email: 'geen-mail' }).ok, false);
    assert.equal(validateCustomer({ name: 'X', email: 'Info@Test.BE' }).value.email, 'info@test.be');
  });

  test('tags worden ontdubbeld en verkleind', () => {
    assert.deepEqual(validateCustomer({ name: 'X', tags: ' Melkvee , melkvee, LIMBURG ,' }).value.tags,
      ['melkvee', 'limburg']);
  });

  test('gedeeltelijke update raakt alleen de meegegeven velden', () => {
    const r = validateCustomer({ lat: '51.0', lon: '3.7' }, { partial: true });
    assert.deepEqual(Object.keys(r.value).sort(), ['lat', 'lon']);
  });
});

describe('bezoeken', () => {
  test('een bezoek heeft inhoud nodig', () => {
    assert.equal(validateVisit({}).ok, false);
    assert.equal(validateVisit({ with_whom: 'Peter' }).ok, true);
    assert.equal(validateVisit({ notes: 'Voorraad besproken' }).ok, true);
  });

  test('datum moet geldig zijn en mag niet in de toekomst liggen', () => {
    assert.equal(validateVisit({ notes: 'x', visit_date: 'morgen' }).ok, false);
    assert.equal(validateVisit({ notes: 'x', visit_date: '2099-01-01' }).ok, false);
    assert.equal(validateVisit({ notes: 'x', visit_date: '2020-05-05' }).value.visit_date, '2020-05-05');
  });

  test('zonder datum wordt het vandaag', () => {
    assert.equal(validateVisit({ notes: 'x' }).value.visit_date, new Date().toISOString().slice(0, 10));
  });
});
