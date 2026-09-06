import { api } from './api.js';
import { esc, toast } from './util.js';
import { klantFormulier, importFormulier } from './forms.js';
import { dashboardView } from './views/dashboard.js';
import { klantenView } from './views/klanten.js';
import { klantView, klantNietGevonden } from './views/klant.js';
import { takenView } from './views/taken.js';

const view = document.getElementById('view');

/** Hash-routing: #/ , #/klanten , #/klant/12 , #/taken */
async function route() {
  const [deel = '', param = ''] = location.hash.replace(/^#\/?/, '').split('/');
  markeerNav(deel);

  try {
    if (deel === 'klanten') await klantenView(view);
    else if (deel === 'taken') await takenView(view);
    else if (deel === 'klant' && param) {
      try {
        await klantView(view, Number(param));
      } catch (err) {
        if (err.status === 404) return klantNietGevonden(view, err);
        throw err;
      }
    } else await dashboardView(view);
  } catch (err) {
    view.innerHTML = `<div class="card"><p class="leeg">Kon deze pagina niet laden.<br>
      <span class="muted">${esc(err.message)}</span></p></div>`;
    toast(err.message, 'fout');
  }
  await ververTaakteller();
}

function markeerNav(deel) {
  // een klantenkaart hoort onder Klanten, niet onder Dashboard
  const actief = deel === 'klant' ? 'klanten' : (['klanten', 'taken'].includes(deel) ? deel : '');
  for (const a of document.querySelectorAll('#nav a')) {
    a.classList.toggle('active', a.dataset.route === actief);
  }
}

/** Rode teller naast "Opvolging" met wat over de datum is. */
async function ververTaakteller() {
  const pill = document.getElementById('nav-taken');
  try {
    const stats = await api.stats();
    pill.textContent = stats.taken_te_laat;
    pill.hidden = stats.taken_te_laat === 0;
  } catch {
    pill.hidden = true;
  }
}

document.getElementById('btn-nieuw').onclick = () =>
  klantFormulier(null, (k) => { location.hash = `#/klant/${k.id}`; });
document.getElementById('btn-import').onclick = () =>
  importFormulier(() => { location.hash = '#/klanten'; route(); });

addEventListener('hashchange', route);
route();
