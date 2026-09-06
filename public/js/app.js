import { esc, toast } from './util.js';
import { kaartFormulier, importFormulier } from './forms.js';
import { kaartenbakView } from './views/kaartenbak.js';
import { kaartView, kaartNietGevonden } from './views/kaart.js';

const view = document.getElementById('view');

/** Twee schermen: de kaartenbak (#/) en één kaart (#/kaart/12). */
async function route() {
  const [deel = '', param = ''] = location.hash.replace(/^#\/?/, '').split('/');
  document.body.classList.toggle('op-kaart', deel === 'kaart');

  try {
    if (deel === 'kaart' && param) {
      try {
        await kaartView(view, Number(param));
      } catch (err) {
        if (err.status === 404) return kaartNietGevonden(view, err);
        throw err;
      }
    } else {
      await kaartenbakView(view);
    }
  } catch (err) {
    view.innerHTML = `<p class="leeg">Kon dit niet laden.<br><span class="muted">${esc(err.message)}</span></p>`;
    toast(err.message, 'fout');
  }
}

document.getElementById('btn-nieuw').onclick = () =>
  kaartFormulier(null, (k) => { location.hash = `#/kaart/${k.id}`; });
document.getElementById('btn-import').onclick = () =>
  importFormulier(() => { location.hash = '#/'; route(); });

addEventListener('hashchange', route);
route();
