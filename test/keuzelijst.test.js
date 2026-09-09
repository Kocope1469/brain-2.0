import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { keuzelijst } from '../public/js/dossier.js';

/**
 * De keuzelijst staat naast de kaart en toont dezelfde klanten als de stippen.
 * Wat hier misgaat valt niet op in een screenshot -- een naam in de verkeerde
 * volgorde of een ontbrekende rij zie je pas als je iemand kwijt bent.
 */
const klanten = [
  { id: 1, name: 'Ökotop', city: 'Eupen', postal_code: '4700', bucket: 'recent', op_kaart: true, laatste_bezoek: '2026-09-01' },
  { id: 2, name: 'alfa bvba', city: 'Aalst', postal_code: '9300', bucket: 'lang', op_kaart: true, laatste_bezoek: '2025-01-05' },
  { id: 3, name: 'Zonder Stip', city: '', postal_code: '', bucket: 'nieuw', op_kaart: false, laatste_bezoek: '' },
  { id: 4, name: 'Beta', city: 'Gent', postal_code: '9000', bucket: 'tijdje', op_kaart: true, laatste_bezoek: '2026-05-01' },
];

const namen = (html) => [...html.matchAll(/<strong>([^<]*)<\/strong>/g)].map((m) => m[1]);

describe('de keuzelijst naast de kaart', () => {
  test('toont elke klant precies één keer', () => {
    const html = keuzelijst(klanten);
    assert.equal(namen(html).length, klanten.length);
    assert.equal([...html.matchAll(/class="zijrij"/g)].length, klanten.length);
  });

  test('sorteert op naam, ongeacht hoofdletters of accenten', () => {
    assert.deepEqual(namen(keuzelijst(klanten)), ['alfa bvba', 'Beta', 'Ökotop', 'Zonder Stip']);
  });

  /**
   * De app geeft hier `staat.klanten` door -- dezelfde lijst waarmee de kaart
   * getekend wordt. Sorteert de keuzelijst die ter plekke, dan verandert ze de
   * volgorde onder de kaart vandaan. Een eigen, verse lijst dus, anders meet deze
   * test wat een eerdere test al gesorteerd heeft.
   */
  test('laat de meegegeven klanten ongemoeid', () => {
    const eigen = [{ id: 1, name: 'Zeta' }, { id: 2, name: 'Alfa' }];
    keuzelijst(eigen);
    assert.deepEqual(eigen.map((k) => k.name), ['Zeta', 'Alfa'],
      'sorteren hoort de lijst van de app niet om te gooien');
  });

  test('elke rij draagt het id van zijn klant, zodat aanklikken het juiste dossier opent', () => {
    const html = keuzelijst(klanten);
    for (const k of klanten) assert.match(html, new RegExp(`data-id="${k.id}"`));
  });

  test('een klant zonder stip krijgt een holle bol, net als in de legende', () => {
    const rij = keuzelijst([klanten.find((k) => !k.op_kaart)]);
    assert.match(rij, /class="bol leeg"/);
    assert.ok(!/background:/.test(rij), 'zonder plaats op de kaart hoort er geen kleur bij');
  });

  test('de kop telt en zegt het erbij als er gefilterd is', () => {
    assert.match(keuzelijst(klanten, { totaal: 4 }), /4 klanten<\/p>/);
    assert.match(keuzelijst(klanten, { totaal: 157 }), /4 klanten \(gefilterd\)<\/p>/);
    assert.match(keuzelijst([klanten[0]], { totaal: 157 }), /1 klant \(gefilterd\)<\/p>/);
  });

  test('zonder treffers zegt de lijst dat, in plaats van leeg te blijven', () => {
    const html = keuzelijst([], { totaal: 157 });
    assert.match(html, /Geen klant voldoet aan de filters/);
    assert.ok(!/class="zijrij"/.test(html));
  });

  /**
   * Klantnamen komen uit een CSV van het CRM en zijn dus niet te vertrouwen.
   * Een naam met < of " erin mag geen HTML worden.
   */
  test('een naam met tekens uit HTML wordt onschadelijk gemaakt', () => {
    const html = keuzelijst([{ id: 9, name: '<img src=x onerror=alert(1)>', city: 'Gent', bucket: 'nieuw', op_kaart: true }]);
    assert.ok(!html.includes('<img'), 'de naam hoort tekst te blijven, geen element te worden');
    assert.match(html, /&lt;img/);
  });
});
