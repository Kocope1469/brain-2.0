import { api, probeer } from './api.js';
import { esc, datum, geleden, vandaag, btwFormaat, initialen, BUCKETLABEL, KLEUREN } from './util.js';
import { klantFormulier, bezoekFormulier } from './forms.js';

const regel = (label, waarde) => (waarde ? `<div class="veld"><dt>${esc(label)}</dt><dd>${waarde}</dd></div>` : '');

/** Het lege dossier: welke klant je ook kiest, hier komt hij terecht. */
export function toonLeeg(el, tellingen) {
  el.innerHTML = `
    <div class="dossier-leeg">
      <h2>Kies een klant</h2>
      <p>Klik een stip op de kaart, of zoek bovenaan op naam of stad.</p>
      ${tellingen ? `
        <ul class="legende">
          <li><span class="bol" style="background:${KLEUREN.recent}"></span> ${tellingen.recent} recent bezocht</li>
          <li><span class="bol" style="background:${KLEUREN.tijdje}"></span> ${tellingen.tijdje} een tijdje geleden</li>
          <li><span class="bol" style="background:${KLEUREN.lang}"></span> ${tellingen.lang} lang niet bezocht</li>
          ${tellingen.zonder_stip ? `<li><span class="bol leeg"></span> ${tellingen.zonder_stip} nog niet op de kaart</li>` : ''}
        </ul>` : ''}
    </div>`;
}

/**
 * Het klantdossier zoals in de schets: kop met laatste bezoek, daaronder de
 * bezoekgeschiedenis — datum, met wie, en waarover het ging.
 */
export async function toonDossier(el, id, { naWijziging, opPlaatsen }) {
  const k = await api.klant(id);
  const adres = [k.street, [k.postal_code, k.city].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>');

  el.innerHTML = `
    <article class="dossier-kaart">
      <header class="dossier-kop">
        <span class="avatar" style="--kleur:${KLEUREN[k.bucket]}">${esc(initialen(k.name))}</span>
        <div class="dossier-titel">
          <h2>${esc(k.name)}</h2>
          <p class="laatste ${esc(k.bucket)}">Laatste bezoek: ${esc(geleden(k.laatste_bezoek))}</p>
        </div>
        <button class="btn-icoon" id="sluit" title="Sluiten" aria-label="Dossier sluiten">✕</button>
      </header>

      <div class="dossier-acties">
        <button class="btn btn-primary btn-sm" id="bezoek">+ Bezoek noteren</button>
        <button class="btn btn-sm" id="bewerk">Bewerken</button>
        ${k.op_kaart
    ? '<button class="btn btn-sm" id="verplaats">Stip verplaatsen</button>'
    : '<button class="btn btn-sm knipper" id="verplaats">Op de kaart zetten</button>'}
      </div>

      ${!k.op_kaart ? '<p class="waarschuwing">Deze klant staat nog niet op de kaart.</p>' : ''}

      <dl class="velden">
        ${regel('Contact', esc(k.contact_name))}
        ${regel('Telefoon', k.phone ? `<a href="tel:${esc(k.phone.replace(/\s/g, ''))}">${esc(k.phone)}</a>` : '')}
        ${regel('E-mail', k.email ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : '')}
        ${regel('Adres', adres)}
        ${regel('BTW', k.vat_number ? `<span class="mono">${esc(btwFormaat(k.vat_number))}</span>` : '')}
        ${regel('Tags', k.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(''))}
      </dl>

      ${k.notes ? `<section class="notitie"><h3>Notities</h3><div class="notitie-tekst">${esc(k.notes)}</div></section>` : ''}

      <section class="bezoeken">
        <h3>Bezoeken <span class="muted">(${k.visits.length})</span></h3>
        ${k.visits.length ? `
          <ol class="bezoeklijst">${k.visits.map((b) => `
            <li>
              <div class="bezoek-kop">
                <strong>${esc(datum(b.visit_date))}</strong>
                ${b.with_whom ? `<span class="muted">— met ${esc(b.with_whom)}</span>` : ''}
                <button class="btn-icoon" data-bezoek="${b.id}" title="Bezoek verwijderen" aria-label="Bezoek verwijderen">✕</button>
              </div>
              ${b.notes ? `<p class="bezoek-tekst">${esc(b.notes)}</p>` : ''}
            </li>`).join('')}
          </ol>`
    : '<p class="leeg">Nog geen bezoek genoteerd. Dat is waarom deze stip rood is.</p>'}
      </section>

      <footer class="dossier-voet">
        <button class="linklike gevaar" id="verwijder">Klant verwijderen</button>
      </footer>
    </article>`;

  const ververs = async () => { await naWijziging(); };

  el.querySelector('#sluit').onclick = () => naWijziging({ deselecteer: true });
  el.querySelector('#bezoek').onclick = () => bezoekFormulier(k, ververs);
  el.querySelector('#bewerk').onclick = () => klantFormulier(k, ververs);
  el.querySelector('#verplaats').onclick = () => opPlaatsen(k);
  el.querySelector('#verwijder').onclick = async () => {
    if (!confirm(`"${k.name}" en al zijn bezoeken definitief verwijderen?`)) return;
    await probeer(() => api.verwijderKlant(k.id), 'Klant verwijderd.');
    await naWijziging({ deselecteer: true });
  };
  for (const knop of el.querySelectorAll('[data-bezoek]')) {
    knop.onclick = async () => {
      if (!confirm('Dit bezoek verwijderen?')) return;
      await probeer(() => api.verwijderBezoek(knop.dataset.bezoek), 'Bezoek verwijderd.');
      await ververs();
    };
  }
  return k;
}

export { vandaag };
