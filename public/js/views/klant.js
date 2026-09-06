import { api, probeer } from '../api.js';
import { esc, geld, geldExact, datum, geleden, vandaag, btwFormaat, opties, hoofdletter, toast } from '../util.js';
import { klantFormulier } from '../forms.js';

const CONTACTSOORTEN = ['notitie', 'telefoon', 'email', 'bezoek', 'offerte', 'klacht'];
const OPDRACHTSTATUSSEN = ['offerte', 'gewonnen', 'verloren', 'gefactureerd', 'betaald'];

const regel = (label, waarde) => (waarde
  ? `<dt>${esc(label)}</dt><dd>${waarde}</dd>`
  : '');

const link = (href, tekst) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(tekst)}</a>`;

export async function klantView(el, id) {
  const k = await api.klant(id);
  const teLaat = (d) => d < vandaag();

  el.innerHTML = `
    <div class="page-head">
      <a href="#/klanten" class="muted" style="text-decoration:none">← Terug naar klanten</a>
    </div>

    <div class="kaart-head">
      <div>
        <div class="titel">
          <h1>${esc(k.company_name)}</h1>
          <span class="badge ${esc(k.status)}">${esc(hoofdletter(k.status))}</span>
        </div>
        <p class="muted" style="margin:6px 0 0">
          Klant sinds ${esc(datum(k.created_at))} · laatste contact ${esc(geleden(k.interactions[0]?.occurred_at))}
        </p>
        <div style="margin-top:8px">${k.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" id="bewerk">Bewerken</button>
        <button class="btn btn-danger" id="verwijder">Verwijderen</button>
      </div>
    </div>

    <div class="kaart-cols">
      <div class="grid">
        <section class="card">
          <header>
            <h2>Contactmomenten</h2>
            <span class="muted" style="font-size:.82rem">${k.interactions.length} vastgelegd</span>
          </header>
          ${k.interactions.length ? `
            <ul class="tijdlijn">${k.interactions.map((i) => `
              <li>
                <span class="dot"></span>
                <div class="rij">
                  <div class="rowmain">${esc(i.subject || hoofdletter(i.type))}</div>
                  <div class="meta">
                    <span class="badge">${esc(i.type)}</span>
                    <span>${esc(datum(i.occurred_at))}</span>
                    <span>· ${esc(geleden(i.occurred_at))}</span>
                  </div>
                  ${i.body ? `<div class="tekst">${esc(i.body)}</div>` : ''}
                </div>
                <button class="btn-icon" data-weg="contact" data-id="${i.id}" title="Verwijderen">✕</button>
              </li>`).join('')}
            </ul>` : '<p class="leeg">Nog niets vastgelegd. Elk gesprek dat je hier niet noteert, ben je binnen een maand kwijt.</p>'}
          <form class="inline-form" id="form-contact">
            <select name="type" aria-label="Soort contact">${opties(CONTACTSOORTEN.map((t) => [t, hoofdletter(t)]))}</select>
            <input name="subject" placeholder="Waarover ging het?" required style="flex:2 1 200px">
            <input name="occurred_at" type="date" value="${vandaag()}" style="flex:0 1 150px">
            <button class="btn btn-primary btn-sm" type="submit">Toevoegen</button>
          </form>
        </section>

        <section class="card">
          <header>
            <h2>Opdrachten</h2>
            <strong>${esc(geldExact(k.omzet_cents))} omzet</strong>
          </header>
          ${k.deals.length ? `
            <div class="table-wrap"><table>
              <tbody>${k.deals.map((d) => `
                <tr>
                  <td>
                    <div class="rowmain">${esc(d.title)}</div>
                    <div class="rowsub">${esc(datum(d.deal_date))}</div>
                  </td>
                  <td><span class="badge ${esc(d.status)}">${esc(hoofdletter(d.status))}</span></td>
                  <td class="num">${esc(geldExact(d.amount_cents))}</td>
                  <td class="num"><button class="btn-icon" data-weg="opdrachten" data-id="${d.id}" title="Verwijderen">✕</button></td>
                </tr>`).join('')}
              </tbody>
            </table></div>` : '<p class="leeg">Nog geen opdrachten of offertes.</p>'}
          <form class="inline-form" id="form-opdracht">
            <input name="title" placeholder="Omschrijving" required style="flex:2 1 180px">
            <input name="amount" placeholder="Bedrag" inputmode="decimal" style="flex:0 1 110px">
            <select name="status" aria-label="Status">${opties(OPDRACHTSTATUSSEN.map((s) => [s, hoofdletter(s)]))}</select>
            <input name="deal_date" type="date" value="${vandaag()}" style="flex:0 1 150px">
            <button class="btn btn-primary btn-sm" type="submit">Toevoegen</button>
          </form>
        </section>
      </div>

      <div class="grid">
        <section class="card">
          <header><h2>Gegevens</h2></header>
          <div class="body">
            <dl class="gegevens">
              ${regel('Contact', esc(k.contact_name))}
              ${regel('E-mail', k.email ? link(`mailto:${k.email}`, k.email) : '')}
              ${regel('Telefoon', k.phone ? link(`tel:${k.phone.replace(/\s/g, '')}`, k.phone) : '')}
              ${regel('Website', k.website ? link(/^https?:/.test(k.website) ? k.website : `https://${k.website}`, k.website) : '')}
              ${regel('BTW', k.vat_number ? `<span class="mono">${esc(btwFormaat(k.vat_number))}</span>` : '')}
              ${regel('Adres', [k.street, [k.postal_code, k.city].filter(Boolean).join(' '), k.country]
    .filter(Boolean).map(esc).join('<br>'))}
              ${regel('Bron', esc(k.source))}
            </dl>
            ${k.intro ? `<p class="tekst" style="white-space:pre-wrap;margin:14px 0 0;color:var(--ink-2)">${esc(k.intro)}</p>` : ''}
            ${!k.contact_name && !k.email && !k.phone
    ? '<p class="muted" style="margin:12px 0 0;font-size:.86rem">Geen enkele manier om deze klant te bereiken. Vul dat aan.</p>' : ''}
          </div>
        </section>

        <section class="card">
          <header>
            <h2>Opvolging</h2>
            <span class="muted" style="font-size:.82rem">${k.tasks.filter((t) => !t.done).length} open</span>
          </header>
          ${k.tasks.length ? `
            <ul class="takenlijst">${k.tasks.map((t) => `
              <li class="${t.done ? 'done' : ''}">
                <input type="checkbox" data-taak="${t.id}" ${t.done ? 'checked' : ''} aria-label="Taak afvinken">
                <span class="titel">${esc(t.title)}</span>
                <span class="datum ${!t.done && teLaat(t.due_date) ? 'te-laat' : ''}">${esc(datum(t.due_date))}</span>
                <button class="btn-icon" data-weg="taken" data-id="${t.id}" title="Verwijderen">✕</button>
              </li>`).join('')}
            </ul>` : '<p class="leeg">Geen openstaande acties.</p>'}
          <form class="inline-form" id="form-taak">
            <input name="title" placeholder="Volgende actie" required style="flex:2 1 150px">
            <input name="due_date" type="date" value="${vandaag()}" style="flex:0 1 150px">
            <button class="btn btn-primary btn-sm" type="submit">+</button>
          </form>
        </section>
      </div>
    </div>`;

  const herlaad = () => klantView(el, id);

  el.querySelector('#bewerk').onclick = () => klantFormulier(k, herlaad);
  el.querySelector('#verwijder').onclick = async () => {
    if (!confirm(`"${k.company_name}" definitief verwijderen? Alle contactmomenten, opdrachten en taken gaan mee.`)) return;
    await probeer(() => api.verwijderKlant(id), 'Klant verwijderd.');
    location.hash = '#/klanten';
  };

  const koppel = (formId, verstuur) => {
    el.querySelector(formId).onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      await probeer(() => verstuur(data), 'Toegevoegd.');
      await herlaad();
    };
  };
  koppel('#form-contact', (d) => api.contact(id, d));
  koppel('#form-opdracht', (d) => api.opdracht(id, d));
  koppel('#form-taak', (d) => api.taak(id, d));

  for (const box of el.querySelectorAll('[data-taak]')) {
    box.onchange = async () => {
      await probeer(() => api.vinkTaak(box.dataset.taak, box.checked));
      await herlaad();
    };
  }
  for (const knop of el.querySelectorAll('[data-weg]')) {
    knop.onclick = async () => {
      if (!confirm('Definitief verwijderen?')) return;
      await probeer(() => api.verwijder(knop.dataset.weg, knop.dataset.id), 'Verwijderd.');
      await herlaad();
    };
  }
}

export async function klantNietGevonden(el, err) {
  el.innerHTML = `<div class="card"><p class="leeg">${esc(err.message)}
    <br><a href="#/klanten">Terug naar de klantenlijst</a></p></div>`;
  toast(err.message, 'fout');
}
