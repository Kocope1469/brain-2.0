import { api, probeer } from '../api.js';
import { esc, datum, vandaag } from '../util.js';

/** Alle openstaande opvolging over alle klanten heen, oudste eerst. */
export async function takenView(el) {
  const taken = await api.taken();
  const teLaat = taken.filter((t) => t.due_date < vandaag());

  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Opvolging</h1>
        <p>${taken.length
    ? `${taken.length} openstaande actie${taken.length === 1 ? '' : 's'}${teLaat.length ? ` — ${teLaat.length} over de datum` : ''}.`
    : 'Niets openstaand.'}</p>
      </div>
    </div>

    <div class="card">
      ${taken.length ? `
        <ul class="takenlijst">${taken.map((t) => `
          <li>
            <input type="checkbox" data-taak="${t.id}" aria-label="Taak afvinken">
            <span class="titel">
              ${esc(t.title)}
              <a href="#/klant/${t.customer_id}" class="rowsub" style="display:block;text-decoration:none">${esc(t.company_name)}</a>
            </span>
            <span class="datum ${t.due_date < vandaag() ? 'te-laat' : ''}">${esc(datum(t.due_date))}</span>
          </li>`).join('')}
        </ul>`
    : '<p class="leeg">Geen openstaande taken. Zet je volgende actie op de kaart van een klant.</p>'}
    </div>`;

  for (const box of el.querySelectorAll('[data-taak]')) {
    box.onchange = async () => {
      await probeer(() => api.vinkTaak(box.dataset.taak, true), 'Afgevinkt.');
      await takenView(el);
    };
  }
}
