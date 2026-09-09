import { api, probeer } from './api.js';
import { esc, datum, geleden, vandaag, btwFormaat, initialen, BUCKETLABEL, KLEUREN } from './util.js';
import { klantFormulier, bezoekFormulier } from './forms.js';

/* Het potlood als tekening: de tekens ✎ en ✏ vallen per lettertype anders uit,
   van bijna onzichtbaar dun tot een gekleurde emoji. */
const POTLOOD = `<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
  <path d="M11.6 1.2a1.4 1.4 0 0 1 2 0l1.2 1.2a1.4 1.4 0 0 1 0 2l-.9.9-3.2-3.2zM9.8 3l3.2 3.2-7 7H2.8v-3.2z"/>
</svg>`;

const regel = (label, waarde) => (waarde ? `<div class="veld"><dt>${esc(label)}</dt><dd>${waarde}</dd></div>` : '');

/**
 * Op naam sorteren, zoals in een telefoonboek: `localeCompare` zet Ç bij C en
 * negeert hoofdletters, wat een gewone `<` niet doet.
 */
const opNaam = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'nl', { sensitivity: 'base' });

/**
 * De klantenlijst onder de tellingen, als HTML. Apart gehouden zodat de volgorde,
 * het aantal en het ontsnappen van namen te testen zijn zonder browser.
 */
export function keuzelijst(klanten = [], tellingen = null) {
  const lijst = [...klanten].sort(opNaam);
  const totaal = tellingen?.totaal ?? lijst.length;
  return `
    <div class="zijlijst">
      <p class="zijlijst-kop">${lijst.length === 1 ? '1 klant' : `${lijst.length} klanten`}${
  lijst.length < totaal ? ' (gefilterd)' : ''}</p>
      ${lijst.length
    ? `<ul class="zijlijst-rijen">${lijst.map(zijlijstRij).join('')}</ul>`
    : '<p class="zijlijst-leeg">Geen klant voldoet aan de filters.</p>'}
    </div>`;
}

/** Eén regel in de zijlijst. */
function zijlijstRij(k) {
  const plaats = [k.postal_code, k.city].filter(Boolean).join(' ');
  return `
    <li>
      <button type="button" class="zijrij" data-id="${k.id}"
              title="${esc(k.name)} — ${esc(geleden(k.laatste_bezoek))}">
        <span class="bol${k.op_kaart ? '' : ' leeg'}" style="${k.op_kaart ? `background:${KLEUREN[k.bucket]}` : ''}"></span>
        <span class="zijrij-tekst">
          <strong>${esc(k.name)}</strong>
          ${plaats ? `<span class="zijrij-plaats">${esc(plaats)}</span>` : ''}
        </span>
        <span class="zijrij-tijd">${esc(geleden(k.laatste_bezoek))}</span>
      </button>
    </li>`;
}

/**
 * Het lege dossier: welke klant je ook kiest, hier komt hij terecht.
 *
 * Zolang er geen klant gekozen is, staat er bovenaan de telling per kleur en
 * daaronder de klanten zelf. Die lijst volgt exact de zoekterm en de filters, dus
 * je ziet altijd wie er nú op de kaart staat -- ook wie buiten beeld valt of achter
 * een andere stip verscholen zit.
 */
export function toonLeeg(el, tellingen, klanten = [], { onKies } = {}) {
  el.classList.add('toont-keuze');
  el.innerHTML = `
    <div class="dossier-leeg">
      <h2>Kies een klant</h2>
      <p>Klik een stip op de kaart, of kies er hieronder een uit de lijst.</p>
      ${tellingen ? `
        <ul class="legende">
          <li><span class="bol" style="background:${KLEUREN.nieuw}"></span> ${tellingen.nieuw ?? 0} nog nooit bezocht</li>
          <li><span class="bol" style="background:${KLEUREN.recent}"></span> ${tellingen.recent} recent bezocht</li>
          <li><span class="bol" style="background:${KLEUREN.tijdje}"></span> ${tellingen.tijdje} een tijdje geleden</li>
          <li><span class="bol" style="background:${KLEUREN.lang}"></span> ${tellingen.lang} lang niet bezocht</li>
          ${tellingen.zonder_stip ? `<li><span class="bol leeg"></span> ${tellingen.zonder_stip} nog niet op de kaart</li>` : ''}
        </ul>` : ''}
    </div>
    ${keuzelijst(klanten, tellingen)}`;

  for (const knop of el.querySelectorAll('.zijrij')) {
    knop.onclick = () => onKies?.(Number(knop.dataset.id));
  }
}

/**
 * Het klantdossier zoals in de schets: kop met laatste bezoek, daaronder de
 * bezoekgeschiedenis — datum, met wie, en waarover het ging.
 */
export async function toonDossier(el, id, { naWijziging, opPlaatsen }) {
  const k = await api.klant(id);
  el.classList.remove('toont-keuze');
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
      ${k.locatie_bron === 'gemeente'
    ? '<p class="terzijde">Stip staat op het midden van de gemeente, dus bij benadering. Klik op "Stip verplaatsen" om hem juist te zetten.</p>'
    : ''}

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
                <span class="bezoek-knoppen">
                  <button class="btn-icoon" data-bewerk-bezoek="${b.id}" title="Bezoek bewerken" aria-label="Bezoek bewerken">${POTLOOD}</button>
                  <button class="btn-icoon" data-bezoek="${b.id}" title="Bezoek verwijderen" aria-label="Bezoek verwijderen">✕</button>
                </span>
              </div>
              ${b.author || b.with_whom ? `<p class="bezoek-wie">${[
    b.author ? `door ${esc(b.author)}` : '',
    b.with_whom ? `met ${esc(b.with_whom)}` : '',
  ].filter(Boolean).join(' — ')}</p>` : ''}
              ${b.notes ? `<p class="bezoek-tekst">${esc(b.notes)}</p>` : ''}
            </li>`).join('')}
          </ol>`
    : '<p class="leeg">Nog geen bezoek genoteerd. Dat is waarom deze stip blauw is.</p>'}
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
  for (const knop of el.querySelectorAll('[data-bewerk-bezoek]')) {
    knop.onclick = () => bezoekFormulier(
      k, ververs, k.visits.find((b) => String(b.id) === knop.dataset.bewerkBezoek));
  }
  return k;
}

export { vandaag };
