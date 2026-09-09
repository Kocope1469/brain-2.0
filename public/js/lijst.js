import { esc, datum, geleden, BUCKETLABEL, KLEUREN } from './util.js';

/**
 * Dezelfde klanten als op de kaart, maar als lijst. Alle filters bovenaan blijven
 * gelden; dit is enkel een andere manier van kijken. Handig om te sorteren op wie
 * je het langst niet gezien hebt, of om een regio in één oogopslag te overlopen.
 */

const KOLOMMEN = [
  { sleutel: 'name', label: 'Klant', waarde: (k) => k.name },
  { sleutel: 'city', label: 'Gemeente', waarde: (k) => k.city },
  { sleutel: 'provincie', label: 'Provincie', waarde: (k) => k.provincie },
  { sleutel: 'contact_name', label: 'Contact', waarde: (k) => k.contact_name },
  { sleutel: 'laatste_bezoek', label: 'Laatste bezoek', waarde: (k) => k.laatste_bezoek ?? '' },
  { sleutel: 'aantal_bezoeken', label: 'Bezoeken', waarde: (k) => k.aantal_bezoeken, getal: true },
];

/** Sorteert; klanten zonder waarde komen achteraan, ongeacht de richting. */
export function sorteer(klanten, sleutel, omgekeerd) {
  const kolom = KOLOMMEN.find((c) => c.sleutel === sleutel) ?? KOLOMMEN[0];
  return [...klanten].sort((a, b) => {
    const x = kolom.waarde(a);
    const y = kolom.waarde(b);
    const xLeeg = x === '' || x === null || x === undefined;
    const yLeeg = y === '' || y === null || y === undefined;
    if (xLeeg !== yLeeg) return xLeeg ? 1 : -1;
    const verschil = kolom.getal
      ? Number(x) - Number(y)
      : String(x).localeCompare(String(y), 'nl', { sensitivity: 'base' });
    return omgekeerd ? -verschil : verschil;
  });
}

/**
 * Tekent de lijst.
 * @param {object} staat sortering en selectie, wordt ter plaatse bijgewerkt
 */
export function toonLijst(el, klanten, staat, { onKies, onSorteer }) {
  const gesorteerd = sorteer(klanten, staat.sorteerOp, staat.sorteerOmgekeerd);

  el.innerHTML = `
    <div class="lijstvak">
      <p class="telling">
        ${klanten.length} klant${klanten.length === 1 ? '' : 'en'}${klanten.length ? '' : ' — pas je filters aan'}
      </p>
      ${klanten.length ? `
        <div class="table-wrap">
          <table class="klantentabel">
            <thead>
              <tr>
                <th class="kleurkolom" title="Laatste bezoek"><span class="bol-kop"></span></th>
                ${KOLOMMEN.map((c) => `
                  <th data-sorteer="${c.sleutel}" class="${c.getal ? 'num ' : ''}${staat.sorteerOp === c.sleutel ? 'gesorteerd' : ''}">
                    ${esc(c.label)}${staat.sorteerOp === c.sleutel ? (staat.sorteerOmgekeerd ? ' ↓' : ' ↑') : ''}
                  </th>`).join('')}
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              ${gesorteerd.map((k) => `
                <tr data-id="${k.id}" class="${k.id === staat.geselecteerd ? 'gekozen' : ''}">
                  <td class="kleurkolom">
                    <span class="bol" style="background:${KLEUREN[k.bucket]}"
                          title="${esc(BUCKETLABEL[k.bucket] ?? '')}"></span>
                  </td>
                  <td>
                    <div class="rowmain">${esc(k.name)}</div>
                    ${k.op_kaart ? '' : '<div class="rowsub">niet op de kaart</div>'}
                  </td>
                  <td>${esc([k.postal_code, k.city].filter(Boolean).join(' '))}</td>
                  <td class="muted">${esc(k.provincie)}</td>
                  <td>${esc(k.contact_name)}</td>
                  <td title="${esc(k.laatste_bezoek ? datum(k.laatste_bezoek) : '')}">${esc(geleden(k.laatste_bezoek))}</td>
                  <td class="num">${k.aantal_bezoeken || ''}</td>
                  <td>${k.tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<p class="leeg">Geen klanten die aan deze filters voldoen.</p>'}
    </div>`;

  for (const kop of el.querySelectorAll('[data-sorteer]')) {
    kop.onclick = () => onSorteer(kop.dataset.sorteer);
  }
  for (const rij of el.querySelectorAll('tr[data-id]')) {
    rij.onclick = () => onKies(Number(rij.dataset.id));
  }
}

export { KOLOMMEN };
