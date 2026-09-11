import { api, probeer } from './api.js';
import { esc, modal, toonFouten, toast, vandaag, opties } from './util.js';

const veld = (naam, label, waarde = '', extra = '') =>
  `<div class="field"><label for="f-${naam}">${esc(label)}</label>
     <input id="f-${naam}" name="${naam}" value="${esc(waarde)}" ${extra}></div>`;

/**
 * Het hoofdcontact: naam, telefoon en e-mail die op de klant zelf staan. Die drie
 * velden komen uit de CRM-export, dus een wijziging hier houdt maar stand tot de
 * volgende import -- dat zegt het venster er ook bij, want stil laten overschrijven
 * is erger dan het niet kunnen wijzigen.
 */
export function hoofdcontactFormulier(klant, naOpslaan = () => {}) {
  modal({
    titel: `Hoofdcontact bij ${klant.name}`,
    bevestig: 'Opslaan',
    body: `
      <p class="terzijde">Deze drie velden staan op de klant zelf en komen uit je
        CRM-export. Levert het CRM hier bij een volgende import iets anders aan, dan
        wordt je wijziging overschreven. Iemand die het CRM niet kent, zet je beter
        als aparte contactpersoon.</p>
      <div class="fields">
        ${veld('contact_name', 'Naam', klant.contact_name, 'autocomplete="off"')}
        ${veld('phone', 'Telefoon', klant.phone)}
        <div class="span-2">${veld('email', 'E-mail', klant.email, 'type="email"')}</div>
      </div>`,
    onSubmit: async (data) => {
      try {
        await api.wijzigKlant(klant.id, data);
        toast('Hoofdcontact bijgewerkt.');
        await naOpslaan();
      } catch (err) {
        toonFouten(err.fouten ?? [err.message]);
        return false;
      }
    },
  });
}

/**
 * Een contactpersoon bij de klant toevoegen of bijwerken. Hetzelfde venster voor
 * allebei; alleen de naam is verplicht, want vaak weet je in het begin niet meer.
 */
export function contactFormulier(klant, naOpslaan = () => {}, contact = null) {
  const c = contact ?? {};
  modal({
    titel: contact ? `${c.name} bewerken` : `Contactpersoon bij ${klant.name}`,
    bevestig: contact ? 'Opslaan' : 'Contactpersoon toevoegen',
    body: `
      <div class="fields">
        ${veld('name', 'Naam *', c.name, 'required autocomplete="off"')}
        ${veld('functie', 'Functie', c.functie, 'placeholder="Zaakvoerder, technieker, boekhouding"')}
        ${veld('phone', 'Telefoon', c.phone)}
        ${veld('email', 'E-mail', c.email, 'type="email"')}
        <div class="field span-2">
          <label for="f-notes">Notitie</label>
          <textarea id="f-notes" name="notes" rows="2"
            placeholder="Bereikbaar na 16u">${esc(c.notes ?? '')}</textarea>
        </div>
      </div>`,
    onSubmit: async (data) => {
      try {
        if (contact) await api.wijzigContact(c.id, data);
        else await api.nieuwContact(klant.id, data);
        toast(contact ? 'Contactpersoon bijgewerkt.' : 'Contactpersoon toegevoegd.');
        await naOpslaan();
      } catch (err) {
        toonFouten(err.fouten ?? [err.message]);
        return false;
      }
    },
  });
}

/** De naam waaronder een collega in de app bekend staat. */
const collegaNaam = (g) => g.name?.trim() || g.email;

/**
 * De collega's, om uit te kiezen bij "Bezocht door". Eén keer opgehaald per
 * paginabezoek: er komt zelden iemand bij, en een extra wachttijd telkens je een
 * bezoek noteert weegt daar niet tegenop.
 */
let collegasBelofte;
async function collegas() {
  collegasBelofte ??= (async () => {
    const [lijst, sessie] = await Promise.all([api.gebruikers(), api.sessie()]);
    return { namen: lijst.map(collegaNaam), ik: sessie.gebruiker ? collegaNaam(sessie.gebruiker) : '' };
  })().catch((err) => { collegasBelofte = undefined; throw err; });
  return collegasBelofte;
}

/**
 * De namen die de app al van deze klant kent, als suggestie bij "Met wie gesproken".
 * Het blijft een gewoon tekstveld: je spreekt wel vaker iemand die nog nergens
 * genoteerd staat, en dan moet je niet eerst een contactfiche gaan aanmaken.
 */
const bekendeContacten = (klant) => [...new Set([
  klant.contact_name,
  ...(klant.contacten ?? []).map((c) => c.name),
].filter(Boolean))];

/**
 * Bezoek noteren of rechtzetten: datum, wie er geweest is, wie je gesproken hebt,
 * waarover. Precies wat er in het dossier komt.
 *
 * Hetzelfde venster voor een nieuw en een bestaand bezoek. Een typfout hoort je niet
 * te dwingen het bezoek te wissen en opnieuw in te tikken.
 */
export async function bezoekFormulier(klant, naOpslaan = () => {}, bezoek = null) {
  let namen = [];
  let ik = '';
  try {
    ({ namen, ik } = await collegas());
  } catch {
    // lukt het niet, dan blijft het een gewoon tekstveld -- beter dan geen venster
  }

  const gekozen = bezoek?.author || ik;
  // een collega die intussen uit de app verdween mag niet stil uit het verslag vallen
  const keuzes = namen.includes(gekozen) || !gekozen ? namen : [gekozen, ...namen];

  modal({
    titel: bezoek ? `Bezoek bij ${klant.name} bewerken` : `Bezoek bij ${klant.name}`,
    bevestig: bezoek ? 'Wijziging opslaan' : 'Bezoek opslaan',
    body: `
      <div class="fields">
        ${veld('visit_date', 'Datum', bezoek?.visit_date ?? vandaag(), 'type="date" required')}
        ${keuzes.length
    ? `<div class="field"><label for="f-author">Bezocht door</label>
         <select id="f-author" name="author">${opties(keuzes, gekozen)}</select></div>`
    : veld('author', 'Bezocht door', gekozen)}
        ${veld('with_whom', 'Met wie gesproken',
    bezoek?.with_whom ?? klant.contact_name ?? '', 'list="bekende-contacten" placeholder="Peter"')}
        <datalist id="bekende-contacten">${opties(bekendeContacten(klant))}</datalist>
        <div class="field span-2">
          <label for="f-notes">Waarover ging het?</label>
          <textarea id="f-notes" name="notes" rows="4"
            placeholder="Nieuwe Type B voorraad besproken">${esc(bezoek?.notes ?? '')}</textarea>
        </div>
      </div>`,
    onSubmit: async (data) => {
      try {
        if (bezoek) {
          await api.wijzigBezoek(bezoek.id, data);
          toast('Bezoek bijgewerkt.');
        } else {
          await api.nieuwBezoek(klant.id, data);
          toast('Bezoek genoteerd.');
        }
        await naOpslaan();
      } catch (err) {
        toonFouten(err.fouten ?? [err.message]);
        return false;
      }
    },
  });
}

/** Klantgegevens. Met een knop die het adres probeert om te zetten naar een stip. */
export function klantFormulier(klant = null, naOpslaan = () => {}) {
  const k = klant ?? {};
  modal({
    titel: klant ? `${k.name} bewerken` : 'Nieuwe klant',
    breed: true,
    bevestig: klant ? 'Opslaan' : 'Klant aanmaken',
    body: `
      <div class="fields">
        <div class="span-2">${veld('name', 'Naam *', k.name, 'required autocomplete="off"')}</div>
        ${veld('contact_name', 'Contactpersoon', k.contact_name)}
        ${veld('phone', 'Telefoon', k.phone)}
        ${veld('email', 'E-mail', k.email, 'type="email"')}
        ${veld('vat_number', 'BTW-nummer', k.vat_number, 'placeholder="BE 0123.456.749"')}
        <div class="span-2">${veld('street', 'Straat en nummer', k.street)}</div>
        ${veld('postal_code', 'Postcode', k.postal_code)}
        ${veld('city', 'Gemeente', k.city)}
        <div class="span-2">${veld('tags', 'Tags (komma gescheiden)', (k.tags ?? []).join(', '), 'placeholder="melkvee, limburg"')}</div>

        <div class="span-2 coords">
          ${veld('lat', 'Breedtegraad', k.lat ?? '', 'inputmode="decimal" placeholder="51.0596"')}
          ${veld('lon', 'Lengtegraad', k.lon ?? '', 'inputmode="decimal" placeholder="3.7256"')}
          <button type="button" class="btn btn-sm" id="zoek-adres">Zoek op adres</button>
        </div>
        <p class="hint span-2" id="coord-hint">
          Leeg laten mag: de klant staat dan nog niet op de kaart en je kunt de stip
          later met één klik plaatsen.
        </p>

        <div class="field span-2">
          <label for="f-notes">Notities</label>
          <textarea id="f-notes" name="notes" rows="5"
            placeholder="Wie beslist, wanneer bel je best, waar moet je op letten.">${esc(k.notes ?? '')}</textarea>
        </div>
      </div>`,
    onSubmit: async (data) => {
      try {
        const resultaat = klant ? await api.wijzigKlant(k.id, data) : await api.nieuweKlant(data);
        toast(klant ? 'Klant bijgewerkt.' : 'Klant aangemaakt.');
        await naOpslaan(resultaat);
      } catch (err) {
        toonFouten(err.fouten ?? [err.message]);
        return false;
      }
    },
  });

  const knop = document.getElementById('zoek-adres');
  const hint = document.getElementById('coord-hint');
  knop.onclick = async () => {
    const adres = ['street', 'postal_code', 'city']
      .map((n) => document.getElementById(`f-${n}`).value.trim()).filter(Boolean).join(', ');
    if (!adres) {
      hint.textContent = 'Vul eerst een straat of gemeente in.';
      return;
    }
    knop.disabled = true;
    hint.textContent = 'Adres opzoeken…';
    try {
      const treffer = await api.geocode(`${adres}, België`);
      if (treffer.gevonden === false) {
        hint.textContent = 'Niet gevonden. Sluit dit venster en gebruik "Op de kaart zetten" om de stip zelf te plaatsen.';
      } else {
        document.getElementById('f-lat').value = treffer.lat.toFixed(6);
        document.getElementById('f-lon').value = treffer.lon.toFixed(6);
        hint.textContent = `Gevonden: ${treffer.omschrijving}`;
      }
    } catch {
      hint.textContent = 'De adresdienst is niet bereikbaar. Plaats de stip zelf op de kaart.';
    } finally {
      knop.disabled = false;
    }
  };
}

/** CSV-import van een bestaande klantenlijst. */
export function importFormulier(naImport = () => {}) {
  modal({
    titel: 'Klanten importeren uit CSV',
    breed: true,
    bevestig: 'Importeren',
    body: `
      <p class="muted" style="margin-top:0">
        Eerste rij = kolomnamen. Herkend worden onder meer <span class="mono">Bedrijf, Contactpersoon,
        Telefoon, E-mail, Straat, Postcode, Gemeente, BTW, Tags, Notities</span>, en als je ze hebt
        <span class="mono">Breedtegraad</span> en <span class="mono">Lengtegraad</span>.
        Komma's en puntkomma's werken allebei.
      </p>
      <p class="muted" style="margin-top:0">
        <strong>Je kunt dit gerust herhalen.</strong> Klanten die al bestaan worden herkend aan hun
        CRM-id, BTW-nummer of naam&nbsp;+&nbsp;postcode en worden bijgewerkt, niet opnieuw aangemaakt.
        Bezoekverslagen, notities, tags en zelf geplaatste stippen blijven staan.
      </p>
      <div class="field"><input type="file" id="f-bestand" accept=".csv,text/csv"></div>
      <div class="field">
        <label for="f-csv">CSV-inhoud</label>
        <textarea id="f-csv" name="csv" rows="9" class="mono"
          placeholder="Bedrijf;Gemeente;Telefoon&#10;Hoeve Peeters;Geel;014 55 22 11"></textarea>
      </div>`,
    onSubmit: async (data, form) => {
      if (!String(data.csv ?? '').trim()) {
        toonFouten(['Plak eerst de inhoud van je CSV-bestand of kies een bestand.']);
        return false;
      }
      const r = await probeer(() => api.importeer(data.csv));
      const delen = [];
      if (r.nieuw) delen.push(`${r.nieuw} nieuw`);
      if (r.bijgewerkt) delen.push(`${r.bijgewerkt} bijgewerkt`);
      if (r.ongewijzigd) delen.push(`${r.ongewijzigd} ongewijzigd`);
      if (r.mislukt.length) delen.push(`${r.mislukt.length} overgeslagen`);
      toast(`${r.gelezen} rij(en) gelezen — ${delen.join(', ') || 'niets te doen'}.`,
        r.mislukt.length ? 'fout' : 'ok');
      if (r.mislukt.length) console.table(r.mislukt);
      await naImport(r);
      form.reset();
    },
  });

  const bestand = document.getElementById('f-bestand');
  bestand.onchange = async () => {
    const file = bestand.files?.[0];
    if (file) document.getElementById('f-csv').value = await file.text();
  };
}


/** Collega's beheren: wie kan er inloggen, en wachtwoorden opnieuw zetten. */
export function gebruikersFormulier() {
  modal({
    titel: "Collega's",
    breed: true,
    bevestig: 'Collega toevoegen',
    body: `
      <div id="gebruikerslijst" class="gebruikerslijst">Laden…</div>
      <hr class="scheiding">
      <div class="fields">
        ${veld('name', 'Naam', '', 'placeholder="Voornaam Achternaam"')}
        ${veld('email', 'E-mailadres', '', 'type="email" required')}
        ${veld('wachtwoord', 'Wachtwoord', '', 'type="password" required autocomplete="new-password" minlength="10"')}
      </div>
      <p class="hint">Minstens 10 tekens. Geef het wachtwoord door en laat je collega het nadien wijzigen.</p>`,
    onSubmit: async (data, form) => {
      try {
        await api.nieuweGebruiker(data);
        toast(`${data.email} kan nu inloggen.`);
        form.reset();
        await vulGebruikers();
        return false; // venster openhouden zodat je er meerdere na elkaar kunt toevoegen
      } catch (err) {
        toonFouten(err.fouten ?? [err.message]);
        return false;
      }
    },
  });
  vulGebruikers();
}

async function vulGebruikers() {
  const bak = document.getElementById('gebruikerslijst');
  if (!bak) return;
  try {
    const lijst = await api.gebruikers();
    bak.innerHTML = lijst.map((g) => `
      <div class="gebruiker">
        <div>
          <strong>${esc(g.name || g.email)}</strong>
          ${g.name ? `<div class="muted">${esc(g.email)}</div>` : ''}
        </div>
        <button class="linklike" data-wachtwoord="${g.id}">Nieuw wachtwoord</button>
        <button class="linklike gevaar" data-weg="${g.id}" data-naam="${esc(g.email)}">Verwijderen</button>
      </div>`).join('');

    for (const knop of bak.querySelectorAll('[data-weg]')) {
      knop.onclick = async () => {
        if (!confirm(`${knop.dataset.naam} de toegang ontnemen?`)) return;
        try {
          await api.verwijderGebruiker(knop.dataset.weg);
          toast('Toegang ingetrokken.');
          await vulGebruikers();
        } catch (err) {
          toonFouten(err.fouten ?? [err.message]);
        }
      };
    }
    for (const knop of bak.querySelectorAll('[data-wachtwoord]')) {
      knop.onclick = async () => {
        const nieuw = prompt('Nieuw wachtwoord (minstens 10 tekens):');
        if (!nieuw) return;
        try {
          await api.wijzigWachtwoord(knop.dataset.wachtwoord, nieuw);
          toast('Wachtwoord gewijzigd. Bestaande sessies zijn afgemeld.');
        } catch (err) {
          toonFouten(err.fouten ?? [err.message]);
        }
      };
    }
  } catch (err) {
    bak.textContent = err.message;
  }
}

/** Hoeveel dagen een grens is, in gewone taal. */
function inWoorden(dagen) {
  const n = Number(dagen);
  if (!Number.isFinite(n) || n < 1) return '';
  if (n < 14) return `${n} dagen`;
  if (n < 60) return `${Math.round(n / 7)} weken`;
  if (n % 365 === 0) return `${n / 365} jaar`;
  const maanden = Math.round(n / 30.44);
  return `${maanden} maand${maanden === 1 ? '' : 'en'}`;
}

const VOORSTELLEN = [
  { label: 'Strak — je ziet klanten om de paar weken', recent: 14, tijdje: 45 },
  { label: 'Standaard — 1 en 3 maanden', recent: 30, tijdje: 90 },
  { label: 'Rustig — 2 en 6 maanden', recent: 60, tijdje: 180 },
  { label: 'Ruim — 3 maanden en 1 jaar', recent: 90, tijdje: 365 },
];

/**
 * De kleurgrenzen instellen. Dit geldt meteen voor iedereen: de waarden staan
 * in de database, niet in de browser van wie ze aanpast.
 */
export function instellingenFormulier(naOpslaan = () => {}) {
  modal({
    titel: 'Wanneer wordt een stip oranje of rood?',
    breed: true,
    bevestig: 'Opslaan',
    body: `
      <p class="muted" style="margin-top:0">
        De kleur van elke stip volgt uit de datum van het laatste bezoek. Hier bepaal je
        vanaf wanneer een klant niet meer "recent" is. Je aanpassing geldt onmiddellijk
        voor jou en je collega's; er gaan geen gegevens verloren, alleen de kleuren
        verschuiven.
      </p>

      <div class="field">
        <label for="f-voorstel">Snel instellen</label>
        <select id="f-voorstel">
          <option value="">Kies een ritme…</option>
          ${VOORSTELLEN.map((v, i) => `<option value="${i}">${esc(v.label)}</option>`).join('')}
        </select>
      </div>

      <div class="drempels">
        <div class="drempel groen">
          <span class="bol" style="background:var(--groen)"></span>
          <label for="f-drempel_recent">Groen tot en met</label>
          <input id="f-drempel_recent" name="drempel_recent" type="number" min="1" max="3650" required>
          <span class="eenheid">dagen</span>
        </div>
        <div class="drempel oranje">
          <span class="bol" style="background:var(--oranje)"></span>
          <label for="f-drempel_tijdje">Oranje tot en met</label>
          <input id="f-drempel_tijdje" name="drempel_tijdje" type="number" min="2" max="3650" required>
          <span class="eenheid">dagen</span>
        </div>
        <div class="drempel rood">
          <span class="bol" style="background:var(--rood)"></span>
          <span>Daarna rood</span>
        </div>
      </div>

      <p class="uitleg" id="uitleg">Laden…</p>`,
    onSubmit: async (data) => {
      try {
        await api.zetInstellingen(data);
        toast('Kleurgrenzen aangepast.');
        await naOpslaan();
      } catch (err) {
        toonFouten(err.fouten ?? [err.message]);
        return false;
      }
    },
  });

  const recent = document.getElementById('f-drempel_recent');
  const tijdje = document.getElementById('f-drempel_tijdje');
  const uitleg = document.getElementById('uitleg');

  const ververs = () => {
    const r = Number(recent.value);
    const t = Number(tijdje.value);
    if (!(r >= 1) || !(t > r)) {
      uitleg.textContent = '"Oranje" moet verder liggen dan "groen".';
      uitleg.classList.add('fout');
      return;
    }
    uitleg.classList.remove('fout');
    uitleg.innerHTML = `Groen tot <strong>${esc(inWoorden(r))}</strong> na het laatste bezoek, `
      + `oranje tot <strong>${esc(inWoorden(t))}</strong>, daarna rood.`;
  };

  recent.oninput = ververs;
  tijdje.oninput = ververs;
  document.getElementById('f-voorstel').onchange = (e) => {
    const keuze = VOORSTELLEN[e.target.value];
    if (!keuze) return;
    recent.value = keuze.recent;
    tijdje.value = keuze.tijdje;
    ververs();
  };

  (async () => {
    try {
      const huidig = await api.instellingen();
      recent.value = huidig.drempel_recent;
      tijdje.value = huidig.drempel_tijdje;
      ververs();
    } catch (err) {
      uitleg.textContent = err.message;
    }
  })();
}
