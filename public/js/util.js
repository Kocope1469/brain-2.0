/** Escapet tekst voor gebruik in innerHTML. Alle klantdata gaat hier doorheen. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const geld = (cents) => (Number(cents || 0) / 100).toLocaleString('nl-BE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

export const geldExact = (cents) => (Number(cents || 0) / 100).toLocaleString('nl-BE', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});

export function datum(iso) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const vandaag = () => new Date().toISOString().slice(0, 10);

/** "3 dagen geleden" / "nog nooit" — leesbaarder dan een kale datum in een overzicht. */
export function geleden(iso) {
  if (!iso) return 'nog geen contact';
  const dagen = Math.floor((Date.now() - new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime()) / 86400000);
  if (Number.isNaN(dagen)) return iso;
  if (dagen <= 0) return 'vandaag';
  if (dagen === 1) return 'gisteren';
  if (dagen < 31) return `${dagen} dagen geleden`;
  if (dagen < 365) return `${Math.floor(dagen / 30)} maand${Math.floor(dagen / 30) === 1 ? '' : 'en'} geleden`;
  return `${Math.floor(dagen / 365)} jaar geleden`;
}

export function btwFormaat(vat) {
  const v = String(vat ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!v.startsWith('BE') || v.length !== 12) return v;
  return `BE ${v.slice(2, 6)}.${v.slice(6, 9)}.${v.slice(9)}`;
}

export function toast(bericht, soort = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${soort === 'fout' ? 'fout' : ''}`;
  el.textContent = bericht;
  box.append(el);
  setTimeout(() => el.remove(), 3800);
}

/** Opent een modaal venster. onSubmit krijgt het formulier; geef true terug om te sluiten. */
export function modal({ titel, body, bevestig = 'Opslaan', onSubmit, breed = false }) {
  const dlg = document.getElementById('modal');
  dlg.innerHTML = `
    <form method="dialog" id="modal-form">
      <header><h2>${esc(titel)}</h2></header>
      <div class="body">
        <div id="modal-fout"></div>
        ${body}
      </div>
      <footer>
        <button class="btn" value="annuleer" type="button" id="modal-annuleer">Annuleren</button>
        <button class="btn btn-primary" value="ok" type="submit">${esc(bevestig)}</button>
      </footer>
    </form>`;
  if (breed) dlg.style.width = 'min(860px, calc(100vw - 32px))';
  else dlg.style.removeProperty('width');

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
  const box = document.getElementById('modal-fout');
  if (!box) return toast(fouten.join(' '), 'fout');
  box.innerHTML = `<div class="foutmelding"><ul>${fouten.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
  box.scrollIntoView({ block: 'nearest' });
}

/** Vult een <select> met opties. */
export function opties(lijst, geselecteerd) {
  return lijst.map((o) => {
    const [waarde, label] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(waarde)}"${waarde === geselecteerd ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

export const hoofdletter = (s) => String(s ?? '').charAt(0).toUpperCase() + String(s ?? '').slice(1);
