import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidVat, normalizeVat, formatVat, toCents,
  validateCustomer, validateInteraction, validateDeal, validateTask,
} from '../server/validate.js';

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

describe('bedragen omzetten naar centen', () => {
  const gevallen = [
    ['1.250,50', 125050], ['1250.50', 125050], ['1250,50', 125050],
    ['€ 2.000', 200000], ['2,000', 200000], ['1.234.567,89', 123456789],
    ['12.5', 1250], [99.9, 9990], ['0', 0], ['', 0], [null, 0], ['onzin', 0],
  ];
  for (const [invoer, verwacht] of gevallen) {
    test(`${JSON.stringify(invoer)} -> ${verwacht}`, () => assert.equal(toCents(invoer), verwacht));
  }
});

describe('klantvalidatie', () => {
  test('bedrijfsnaam is verplicht', () => {
    const r = validateCustomer({ company_name: '   ' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('Bedrijfsnaam')));
  });

  test('e-mail wordt gecontroleerd en in kleine letters bewaard', () => {
    assert.equal(validateCustomer({ company_name: 'X', email: 'geen-mail' }).ok, false);
    assert.equal(validateCustomer({ company_name: 'X', email: 'Info@Test.BE' }).value.email, 'info@test.be');
  });

  test('onbekende status wordt geweigerd', () => {
    assert.equal(validateCustomer({ company_name: 'X', status: 'vip' }).ok, false);
    assert.equal(validateCustomer({ company_name: 'X' }).value.status, 'prospect');
  });

  test('tags worden ontdubbeld, verkleind en getrimd', () => {
    const r = validateCustomer({ company_name: 'X', tags: ' Horeca , horeca,  GENT , ,' });
    assert.deepEqual(r.value.tags, ['horeca', 'gent']);
  });

  test('gedeeltelijke update raakt alleen de meegegeven velden', () => {
    const r = validateCustomer({ city: 'Gent' }, { partial: true });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.value), ['city']);
  });

  test('lange invoer wordt afgekapt in plaats van geweigerd', () => {
    const r = validateCustomer({ company_name: 'a'.repeat(500) });
    assert.equal(r.value.company_name.length, 200);
  });
});

describe('validatie van kaartonderdelen', () => {
  test('contactmoment heeft onderwerp of tekst nodig', () => {
    assert.equal(validateInteraction({ type: 'telefoon' }).ok, false);
    assert.equal(validateInteraction({ type: 'telefoon', subject: 'Gebeld' }).ok, true);
  });

  test('contactmoment weigert een onbekend type en een foute datum', () => {
    assert.equal(validateInteraction({ type: 'duif', subject: 'x' }).ok, false);
    assert.equal(validateInteraction({ subject: 'x', occurred_at: '12-05-2026' }).ok, false);
  });

  test('opdracht rekent het bedrag om en eist een omschrijving', () => {
    assert.equal(validateDeal({ amount: '100' }).ok, false);
    assert.equal(validateDeal({ title: 'Site', amount: '1.500,00' }).value.amount_cents, 150000);
  });

  test('taak eist een omschrijving en een geldige datum', () => {
    assert.equal(validateTask({}).ok, false);
    assert.equal(validateTask({ title: 'Bellen', due_date: 'morgen' }).ok, false);
    assert.equal(validateTask({ title: 'Bellen' }).value.done, 0);
  });
});
