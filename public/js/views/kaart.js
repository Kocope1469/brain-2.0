import { api, probeer } from '../api.js';
import { esc, datum, btwFormaat, initialen, kleurVoor, toast } from '../util.js';
import { kaartFormulier } from '../forms.js';

const rij = (label, waarde) => (waarde ? `<div class="veld"><dt>${esc(label)}</dt><dd>${waarde}</dd></div>` : '');
const link = (href, tekst) => `<a href="${esc(href)}">${esc(tekst)}</a>`;

/** De kaart zelf: alles wat je over deze klant weet, op één blad. */
export async function kaartView(el, id) {
  const k = await api.klant(id);

  const adres = [k.street, [k.postal_code, k.city].filter(Boolean).join(' '), k.country === 'BE' ? '' : k.country]
    .filter(Boolean).map(esc).join('<br>');
  const website = k.website ? (/^https?:/.test(k.website) ? k.website : `https://${k.website}`) : '';
  const leeg = !k.contact_name && !k.email && !k.phone && !k.city && !k.notes;

  el.innerHTML = `
    <div class="kaart-balk">
      <a href="#/" class="terug">← Alle kaarten</a>
      <div class="kaart-knoppen">
        <button class="btn" id="print">Afdrukken</button>
        <button class="btn" id="bewerk">Bewerken</button>
        <button class="btn btn-danger" id="verwijder">Verwijderen</button>
      </div>
    </div>

    <article class="blad">
      <header class="blad-kop">
        <span class="avatar groot" style="--kleur:${kleurVoor(k.company_name)}">${esc(initialen(k.company_name))}</span>
        <div>
          <h1>${esc(k.company_name)}</h1>
          ${k.contact_name || k.role
    ? `<p class="onder">${esc([k.contact_name, k.role].filter(Boolean).join(' · '))}</p>` : ''}
          ${k.tags.length ? `<div class="blad-tags">${k.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      </header>

      <dl class="velden">
        ${rij('Telefoon', k.phone ? link(`tel:${k.phone.replace(/\s/g, '')}`, k.phone) : '')}
        ${rij('E-mail', k.email ? link(`mailto:${k.email}`, k.email) : '')}
        ${rij('Website', website ? `<a href="${esc(website)}" target="_blank" rel="noopener">${esc(k.website)}</a>` : '')}
        ${rij('Adres', adres)}
        ${rij('BTW', k.vat_number ? `<span class="mono">${esc(btwFormaat(k.vat_number))}</span>` : '')}
        ${rij('Bron', esc(k.source))}
      </dl>

      ${k.notes ? `
        <section class="notitie">
          <h2>Notities</h2>
          <div class="notitie-tekst">${esc(k.notes)}</div>
        </section>` : ''}

      ${leeg ? '<p class="leeg">Deze kaart is nog leeg. Klik op Bewerken en vul aan wat je weet.</p>' : ''}

      <footer class="blad-voet">
        Aangemaakt ${esc(datum(k.created_at))}${k.updated_at !== k.created_at ? ` · bijgewerkt ${esc(datum(k.updated_at))}` : ''}
      </footer>
    </article>`;

  el.querySelector('#print').onclick = () => window.print();
  el.querySelector('#bewerk').onclick = () => kaartFormulier(k, () => kaartView(el, id));
  el.querySelector('#verwijder').onclick = async () => {
    if (!confirm(`De kaart van "${k.company_name}" definitief verwijderen?`)) return;
    await probeer(() => api.verwijderKlant(id), 'Kaart verwijderd.');
    location.hash = '#/';
  };
}

export async function kaartNietGevonden(el, err) {
  el.innerHTML = `<p class="leeg">${esc(err.message)}<br><a href="#/">Terug naar alle kaarten</a></p>`;
  toast(err.message, 'fout');
}
