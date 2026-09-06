import { api } from '../api.js';
import { esc, opties, initialen, kleurVoor } from '../util.js';
import { kaartFormulier } from '../forms.js';

let filters = { q: '', tag: '', sort: 'naam' };

/** Het overzicht: elke klant een kaartje, klikbaar naar de volledige kaart. */
export async function kaartenbakView(el) {
  const tags = await api.tags();

  el.innerHTML = `
    <div class="zoekbalk">
      <input class="zoek" id="q" type="search" autocomplete="off"
             placeholder="Zoek in alles wat op de kaarten staat — naam, contact, gemeente, notities…"
             value="${esc(filters.q)}">
      <select id="tag" aria-label="Filter op tag">
        <option value="">Alle tags</option>${opties(tags.map((t) => [t.name, `${t.name} (${t.aantal})`]), filters.tag)}
      </select>
      <select id="sort" aria-label="Sorteren">${opties([
    ['naam', 'Op naam'], ['gemeente', 'Op gemeente'],
    ['gewijzigd', 'Laatst gewijzigd'], ['nieuw', 'Nieuwste eerst'],
  ], filters.sort)}</select>
    </div>
    <div id="bak"></div>`;

  const bak = el.querySelector('#bak');

  const herlaad = async () => {
    const kaarten = await api.klanten(filters);
    if (!kaarten.length) {
      bak.innerHTML = `<p class="leeg">${filters.q || filters.tag
        ? 'Geen kaart die hierop past.'
        : 'Nog geen kaarten. Maak er een aan, of importeer je bestaande lijst.'}</p>`;
      return;
    }
    bak.innerHTML = `
      <p class="telling">${kaarten.length} kaart${kaarten.length === 1 ? '' : 'en'}</p>
      <div class="bak">${kaarten.map((k) => `
        <article class="kaartje" data-id="${k.id}" tabindex="0" role="link"
                 aria-label="Kaart van ${esc(k.company_name)}">
          <div class="kaartje-kop">
            <span class="avatar" style="--kleur:${kleurVoor(k.company_name)}">${esc(initialen(k.company_name))}</span>
            <div class="kaartje-titel">
              <h2>${esc(k.company_name)}</h2>
              <p>${esc([k.contact_name, k.role].filter(Boolean).join(' · ') || '—')}</p>
            </div>
          </div>
          <dl class="kaartje-regels">
            ${k.city ? `<div><dt>Plaats</dt><dd>${esc([k.postal_code, k.city].filter(Boolean).join(' '))}</dd></div>` : ''}
            ${k.phone ? `<div><dt>Tel</dt><dd>${esc(k.phone)}</dd></div>` : ''}
            ${k.email ? `<div><dt>Mail</dt><dd class="knip">${esc(k.email)}</dd></div>` : ''}
          </dl>
          ${k.tags.length ? `<div class="kaartje-tags">${k.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </article>`).join('')}
      </div>`;

    for (const kaartje of bak.querySelectorAll('.kaartje')) {
      const open = () => { location.hash = `#/kaart/${kaartje.dataset.id}`; };
      kaartje.onclick = open;
      kaartje.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    }
  };

  let timer;
  el.querySelector('#q').oninput = (e) => {
    filters.q = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(herlaad, 180);
  };
  for (const naam of ['tag', 'sort']) {
    el.querySelector(`#${naam}`).onchange = (e) => { filters[naam] = e.target.value; herlaad(); };
  }

  bak.innerHTML = '<p class="leeg">Laden…</p>';
  await herlaad();
}

export { kaartFormulier };
