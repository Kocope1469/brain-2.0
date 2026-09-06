import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, detectDelimiter, toCsv, mapHeaders, csvToCustomers } from '../server/csv.js';

describe('CSV lezen', () => {
  test('leest velden met quotes, komma\'s en newlines', () => {
    const rows = parseCsv('a,b\n"met, komma","regel\nafbreking"');
    assert.deepEqual(rows, [['a', 'b'], ['met, komma', 'regel\nafbreking']]);
  });

  test('verdubbelde quotes worden een echte quote', () => {
    assert.deepEqual(parseCsv('naam\n"Bakkerij ""De Ster"""'), [['naam'], ['Bakkerij "De Ster"']]);
  });

  test('werkt met Windows-regeleindes en negeert lege regels', () => {
    assert.deepEqual(parseCsv('a\r\nb\r\n\r\nc'), [['a'], ['b'], ['c']]);
  });

  test('herkent de puntkomma van Excel NL/BE', () => {
    assert.equal(detectDelimiter('naam;email;stad'), ';');
    assert.equal(detectDelimiter('naam,email,stad'), ',');
  });
});

describe('kolommen herkennen', () => {
  test('koppelt Nederlandse en Engelse koppen aan velden', () => {
    assert.deepEqual(
      mapHeaders(['Bedrijf', 'E-mail', 'BTW-nummer', 'Gemeente', 'Onzin']),
      ['name', 'email', 'vat_number', 'city', null],
    );
  });

  test('trekt zich niets aan van hoofdletters, spaties of een BOM', () => {
    assert.deepEqual(mapHeaders(['﻿bedrijfsnaam', '  TELEFOON  ']), ['name', 'phone']);
  });
});

describe('CSV omzetten naar klanten', () => {
  test('zet rijen om en meldt kolommen die genegeerd worden', () => {
    const { customers, unmapped } = csvToCustomers(
      'Bedrijf;E-mail;Onbekend\nAlfa nv;info@alfa.be;xyz\nBeta bv;;abc',
    );
    assert.equal(customers.length, 2);
    assert.equal(customers[0].email, 'info@alfa.be');
    assert.deepEqual(unmapped, ['Onbekend']);
  });

  test('slaat rijen zonder bedrijfsnaam over', () => {
    const { customers } = csvToCustomers('Bedrijf;E-mail\n;wees@nergens.be\nAlfa nv;a@b.be');
    assert.deepEqual(customers.map((c) => c.name), ['Alfa nv']);
  });

  test('een leeg bestand levert geen klanten en geen fout', () => {
    assert.deepEqual(csvToCustomers(''), { customers: [], unmapped: [] });
  });
});

describe('CSV schrijven', () => {
  test('escapet scheidingstekens en quotes en begint met een BOM voor Excel', () => {
    const csv = toCsv([{ a: 'x;y', b: 'zeg "hoi"' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
    assert.ok(csv.startsWith('﻿'));
    assert.equal(csv.split('\r\n')[1], '"x;y";"zeg ""hoi"""');
  });

  test('berekende kolommen werken', () => {
    const csv = toCsv([{ cents: 150000 }], [{ key: 'bedrag', label: 'Bedrag', value: (r) => r.cents / 100 }]);
    assert.equal(csv.split('\r\n')[1], '1500');
  });

  test('wat je exporteert kun je terug inlezen', () => {
    const origineel = [{ name: 'Bakkerij; "De Ster"', email: 'info@ster.be' }];
    const csv = toCsv(origineel, [{ key: 'name', label: 'Bedrijf' }, { key: 'email', label: 'E-mail' }]);
    assert.deepEqual(csvToCustomers(csv).customers, origineel);
  });
});
