import { api } from '../api.js';
import { esc, geld, geleden, opties, hoofdletter } from '../util.js';
import { klantFormulier } from '../forms.js';

const STATUSSEN = ['prospect', 'actief', 'slapend', 'verloren'];
let filters = { q: '', status: '', tag: '', sort: 'company_name' };

export async function klantenView(el) {
  const meta = await api.meta();

  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Klanten</h1>
        <p>Klik een rij open voor de volledige kaart.</p>
      </div>
      <button class="btn btn-primary" id="nieuw">+ Nieuwe klant</button>
    </div>

    <div class="toolbar">
      <input class="search" id="q" type="search" placeholder="Zoek op naam, contact, e-mail, gemeente of BTW…" value="${esc(filters.q)}">
      <select id="status"><option value="">Alle statussen</option>${opties(STATUSSEN.map((s) => [s, hoofdletter(s)]), filters.status)}</select>
      <select id="tag"><option value="">Alle tags</option>${opties(meta.tags.map((t) => [t.name, `${t.name} (${t.aantal})`]), filters.tag)}</select>
      <select id="sort">${opties([
    ['company_name', 'Sorteer op naam'], ['recent', 'Laatste contact'],
    ['omzet', 'Hoogste omzet'], ['nieuw', 'Nieuwste eerst'],
  ], filters.sort)}</select>
    </div>

    <div class="card"><div id="lijst"></div></div>`;

  const lijst = el.querySelector('#lijst');
  el.querySelector('#nieuw').onclick = () => klantFormulier(null, (k) => { location.hash = `#/klant/${k.id}`; });

  const herlaad = async () => {
    lijst.innerHTML = '<p class="leeg">Laden…</p>';
    const klanten = await api.klanten(filters);
    if (!klanten.length) {
      lijst.innerHTML = `<p class="leeg">${filters.q || filters.status || filters.tag
        ? 'Geen klanten die aan deze filters voldoen.'
        : 'Nog geen klanten. Maak er een aan of importeer je bestaande lijst via CSV.'}</p>`;
      return;
    }
    lijst.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Klant</th><th>Status</th><th>Tags</th><th>Laatste contact</th>
          <th class="num">Omzet</th><th class="num">Open</th>
        </tr></thead>
        <tbody>${klanten.map((k) => `
          <tr data-id="${k.id}">
            <td>
              <div class="rowmain">${esc(k.company_name)}</div>
              <div class="rowsub">${esc([k.contact_name, k.city, k.email].filter(Boolean).join(' · ') || '—')}</div>
            </td>
            <td><span class="badge ${esc(k.status)}">${esc(hoofdletter(k.status))}</span></td>
            <td>${k.tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('') || '<span class="muted">—</span>'}</td>
            <td class="rowsub">${esc(geleden(k.laatste_contact))}</td>
            <td class="num">${k.omzet_cents ? esc(geld(k.omzet_cents)) : '<span class="muted">—</span>'}</td>
            <td class="num">${k.open_taken ? `<span class="badge slapend">${k.open_taken}</span>` : '<span class="muted">—</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
    for (const rij of lijst.querySelectorAll('tr[data-id]')) {
      rij.onclick = () => { location.hash = `#/klant/${rij.dataset.id}`; };
    }
  };

  let timer;
  el.querySelector('#q').oninput = (e) => {
    filters.q = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(herlaad, 200);
  };
  for (const naam of ['status', 'tag', 'sort']) {
    el.querySelector(`#${naam}`).onchange = (e) => { filters[naam] = e.target.value; herlaad(); };
  }

  await herlaad();
}
