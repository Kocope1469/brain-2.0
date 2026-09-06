import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isValidVat, normalizeVat, formatVat, validateCustomer } from '../server/validate.js';

describe('BTW-nummers', () => {
  test('aanvaardt een geldig Belgisch nummer in elk formaat', () => {
    for (const vorm of ['BE0123456749', 'be 0123.456.749', 'BE 0123 456 749', '  BE0123456749  ']) {
      assert.equal(isValidVat(vorm), true, vorm);
    }
  });

  test('verwerpt een fout controlegetal', () => {
    assert.equal(isValidVat('BE0123456748'), false);
  });

  test('verwerpt een verkeerde lengte of beginletter', () => {
    assert.equal(isValidVat('BE012345674'), false);
    assert.equal(isValidVat('BE9123456749'), false);
  });

  test('leeg mag: niet elke klant heeft een BTW-nummer', () => {
    assert.equal(isValidVat(''), true);
    assert.equal(isValidVat(null), true);
  });

  test('buitenlandse nummers worden enkel op vorm gecontroleerd', () => {
    assert.equal(isValidVat('NL123456789B01'), true);
    assert.equal(isValidVat('12345'), false);
  });

  test('normaliseert en formatteert', () => {
    assert.equal(normalizeVat('be 0123.456.749'), 'BE0123456749');
    assert.equal(formatVat('be0123456749'), 'BE 0123.456.749');
    assert.equal(formatVat('NL123456789B01'), 'NL123456789B01');
  });
});

describe('wat er op een kaart mag staan', () => {
  test('naam is verplicht', () => {
    const r = validateCustomer({ company_name: '   ' });
    assert.equal(r.ok, false);
    assert.ok(r.errors[0].includes('Naam'));
  });

  test('e-mail wordt gecontroleerd en in kleine letters bewaard', () => {
    assert.equal(validateCustomer({ company_name: 'X', email: 'geen-mail' }).ok, false);
    assert.equal(validateCustomer({ company_name: 'X', email: 'Info@Test.BE' }).value.email, 'info@test.be');
  });

  test('tags worden ontdubbeld, verkleind en getrimd', () => {
    const r = validateCustomer({ company_name: 'X', tags: ' Horeca , horeca,  GENT , ,' });
    assert.deepEqual(r.value.tags, ['horeca', 'gent']);
  });

  test('land valt terug op BE en wordt hoofdletters', () => {
    assert.equal(validateCustomer({ company_name: 'X' }).value.country, 'BE');
    assert.equal(validateCustomer({ company_name: 'X', country: 'nl' }).value.country, 'NL');
  });

  test('gedeeltelijke update raakt alleen de meegegeven velden', () => {
    const r = validateCustomer({ city: 'Gent' }, { partial: true });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.value), ['city']);
  });

  test('notities mogen lang zijn, andere velden worden afgekapt', () => {
    const r = validateCustomer({ company_name: 'a'.repeat(500), notes: 'n'.repeat(30000) });
    assert.equal(r.value.company_name.length, 200);
    assert.equal(r.value.notes.length, 20000);
  });

  test('meerdere fouten komen samen terug', () => {
    const r = validateCustomer({ company_name: '', email: 'fout', vat_number: 'BE0123456748' });
    assert.equal(r.errors.length, 3);
  });
});
