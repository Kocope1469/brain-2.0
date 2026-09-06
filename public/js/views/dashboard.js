import { api } from '../api.js';
import { esc, geld, geleden, hoofdletter } from '../util.js';

const kaart = (label, waarde, sub = '', klasse = '') => `
  <div class="card stat ${klasse}">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(waarde)}</div>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  </div>`;

export async function dashboardView(el) {
  const s = await api.stats();
  const perStatus = Object.fromEntries(s.per_status.map((r) => [r.status, r.aantal]));

  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p>Waar je zaak vandaag staat — en wie je dreigt te vergeten.</p>
      </div>
    </div>

    <div class="stats">
      ${kaart('Klanten', s.klanten, `${perStatus.actief ?? 0} actief · ${perStatus.prospect ?? 0} prospect`)}
      ${kaart('Omzet dit jaar', geld(s.omzet_jaar_cents), `${geld(s.omzet_totaal_cents)} sinds de start`)}
      ${kaart('Open offertes', geld(s.openstaande_offertes_cents), 'nog niet gewonnen of verloren')}
      ${kaart('Openstaande taken', s.open_taken, s.taken_te_laat ? `${s.taken_te_laat} over de datum` : 'alles op schema',
    s.taken_te_laat ? 'alert' : '')}
    </div>

    <div class="grid cols-2">
      <section class="card">
        <header>
          <h2>Te lang stil</h2>
          <span class="muted" style="font-size:.82rem">geen contact in 60+ dagen</span>
        </header>
        ${s.stille_klanten.length ? `
          <div class="table-wrap"><table>
            <tbody>${s.stille_klanten.map((k) => `
              <tr data-id="${k.id}">
                <td>
                  <div class="rowmain">${esc(k.company_name)}</div>
                  <div class="rowsub">${esc(geleden(k.laatste_contact))}</div>
                </td>
                <td class="num"><span class="badge ${esc(k.status)}">${esc(hoofdletter(k.status))}</span></td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : '<p class="leeg">Iedereen is recent gesproken. Netjes.</p>'}
      </section>

      <section class="card">
        <header><h2>Laatste activiteit</h2></header>
        ${s.recente_activiteit.length ? `
          <ul class="tijdlijn">${s.recente_activiteit.map((i) => `
            <li data-id="${i.customer_id}" style="cursor:pointer">
              <span class="dot"></span>
              <div class="rij">
                <div class="rowmain">${esc(i.subject || hoofdletter(i.type))}</div>
                <div class="meta">${esc(i.company_name)} · ${esc(i.type)} · ${esc(geleden(i.occurred_at))}</div>
              </div>
            </li>`).join('')}
          </ul>` : '<p class="leeg">Nog geen contactmomenten vastgelegd.</p>'}
      </section>
    </div>`;

  for (const rij of el.querySelectorAll('[data-id]')) {
    rij.onclick = () => { location.hash = `#/klant/${rij.dataset.id}`; };
  }
}
