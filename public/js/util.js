/** Escapet tekst voor gebruik in innerHTML. Alle klantdata gaat hier doorheen. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const KLEUREN = { recent: '#22a559', tijdje: '#d98324', lang: '#d3453d' };
export const BUCKETLABEL = {
  recent: 'Recent bezocht',
  tijdje: 'Een tijdje geleden',
  lang: 'Lang niet bezocht',
};

export function datum(iso) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const vandaag = () => new Date().toISOString().slice(0, 10);

/** "3 weken geleden" — zoals op de kaart in de schets. */
export function geleden(iso) {
  if (!iso) return 'nog nooit bezocht';
  const dagen = Math.floor((Date.now() - new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime()) / 86400000);
  if (Number.isNaN(dagen)) return iso;
  if (dagen <= 0) return 'vandaag';
  if (dagen === 1) return 'gisteren';
  if (dagen < 14) return `${dagen} dagen geleden`;
  if (dagen < 60) return `${Math.floor(dagen / 7)} weken geleden`;
  if (dagen < 365) return `${Math.round(dagen / 30)} maanden geleden`;
  const jaren = Math.floor(dagen / 365);
  return `${jaren} jaar geleden`;
}

export function btwFormaat(vat) {
  const v = String(vat ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!v.startsWith('BE') || v.length !== 12) return v;
  return `BE ${v.slice(2, 6)}.${v.slice(6, 9)}.${v.slice(9)}`;
}

export function initialen(naam) {
  const woorden = String(naam ?? '').trim().split(/\s+/)
    .filter((w) => !['de', 'het', 'een', 'van', 'der', 'den', '&', 'en'].includes(w.toLowerCase()));
  return woorden.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

export function toast(bericht, soort = 'ok') {
  const bak = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${soort === 'fout' ? 'fout' : ''}`;
  el.textContent = bericht;
  bak.append(el);
  setTimeout(() => el.remove(), 4000);
}

export function modal({ titel, body, bevestig = 'Opslaan', onSubmit, breed = false }) {
  const dlg = document.getElementById('modal');
  dlg.innerHTML = `
    <form method="dialog" id="modal-form">
      <header><h2>${esc(titel)}</h2></header>
      <div class="body"><div id="modal-fout"></div>${body}</div>
      <footer>
        <button class="btn" type="button" id="modal-annuleer">Annuleren</button>
        <button class="btn btn-primary" type="submit">${esc(bevestig)}</button>
      </footer>
    </form>`;
  dlg.classList.toggle('breed', breed);

  const form = dlg.querySelector('#modal-form');
  dlg.querySelector('#modal-annuleer').onclick = () => dlg.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const knop = form.querySelector('[type=submit]');
    knop.disabled = true;
    try {
      if (await onSubmit(Object.fromEntries(new FormData(form)), form) !== false) dlg.close();
    } catch (err) {
      toonFouten(err.fouten ?? [err.message]);
    } finally {
      knop.disabled = false;
    }
  };
  dlg.showModal();
  dlg.querySelector('input, select, textarea')?.focus();
  return dlg;
}

export function toonFouten(fouten) {
  const bak = document.getElementById('modal-fout');
  if (!bak) return toast(fouten.join(' '), 'fout');
  bak.innerHTML = `<div class="foutmelding"><ul>${fouten.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
  bak.scrollIntoView({ block: 'nearest' });
}

export function opties(lijst, geselecteerd) {
  return lijst.map((o) => {
    const [waarde, label] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(waarde)}"${waarde === geselecteerd ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
}
