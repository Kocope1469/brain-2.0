/** Escapet tekst voor gebruik in innerHTML. Alle klantdata gaat hier doorheen. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function datum(iso) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function btwFormaat(vat) {
  const v = String(vat ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!v.startsWith('BE') || v.length !== 12) return v;
  return `BE ${v.slice(2, 6)}.${v.slice(6, 9)}.${v.slice(9)}`;
}

/** Eerste letters van maximaal twee betekenisvolle woorden: "Bakkerij Vermeulen" -> "BV". */
export function initialen(naam) {
  const woorden = String(naam ?? '').trim().split(/\s+/)
    .filter((w) => !['de', 'het', 'een', 'van', 'der', 'den', '&', 'en'].includes(w.toLowerCase()));
  return woorden.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

/** Vaste kleur per naam, zodat een kaart altijd dezelfde tint houdt. */
export function kleurVoor(naam) {
  let som = 0;
  for (const teken of String(naam ?? '')) som = (som * 31 + teken.codePointAt(0)) % 360;
  return `hsl(${som} 52% 45%)`;
}

export function toast(bericht, soort = 'ok') {
  const bak = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${soort === 'fout' ? 'fout' : ''}`;
  el.textContent = bericht;
  bak.append(el);
  setTimeout(() => el.remove(), 3800);
}

/** Opent een modaal venster. onSubmit krijgt het formulier; geef false terug om open te blijven. */
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
        <button class="btn" type="button" id="modal-annuleer">Annuleren</button>
        <button class="btn btn-primary" type="submit">${esc(bevestig)}</button>
      </footer>
    </form>`;
  dlg.style[breed ? 'setProperty' : 'removeProperty']('width', 'min(820px, calc(100vw - 32px))');

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
