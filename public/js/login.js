const form = document.getElementById('form');
const foutvak = document.getElementById('fout');
const knop = document.getElementById('knop');

/** Bij een lege installatie maakt het eerste bezoek meteen de beheerder aan. */
const sessie = await (await fetch('/api/sessie')).json();
const eersteStart = sessie.eerste_start;

if (sessie.ingelogd) location.replace('/');

if (eersteStart) {
  document.getElementById('titel').textContent = 'Eerste gebruiker aanmaken';
  document.getElementById('uitleg').textContent =
    'Er is nog niemand geregistreerd. Maak hier het account waarmee jij en je collega\'s straks inloggen.';
  document.getElementById('naamveld').hidden = false;
  document.getElementById('wachtwoord').setAttribute('autocomplete', 'new-password');
  knop.textContent = 'Account aanmaken';
}

const toonFout = (regels) => {
  foutvak.innerHTML = `<div class="foutmelding"><ul>${regels
    .map((r) => `<li>${r.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`)
    .join('')}</ul></div>`;
};

form.onsubmit = async (e) => {
  e.preventDefault();
  knop.disabled = true;
  foutvak.innerHTML = '';
  const data = Object.fromEntries(new FormData(form));
  try {
    const res = await fetch(eersteStart ? '/api/gebruikers' : '/api/sessie', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) {
      toonFout(body.errors ?? ['Aanmelden lukte niet.']);
      return;
    }
    location.replace('/');
  } catch {
    toonFout(['Geen verbinding met de server.']);
  } finally {
    knop.disabled = false;
  }
};
