import { api, probeer } from './api.js';
import { esc, modal, toonFouten, toast, vandaag } from './util.js';

const veld = (naam, label, waarde = '', extra = '') =>
  `<div class="field"><label for="f-${naam}">${esc(label)}</label>
     <input id="f-${naam}" name="${naam}" value="${esc(waarde)}" ${extra}></div>`;

/** Bezoek noteren: datum, met wie, waarover. Precies wat er in het dossier komt. */
export function bezoekFormulier(klant, naOpslaan = () => {}) {
  modal({
    titel: `Bezoek bij ${klant.name}`,
    bevestig: 'Bezoek opslaan',
    body: `
      <div class="fields">
        ${veld('visit_date', 'Datum', vandaag(), 'type="date" required')}
        ${veld('with_whom', 'Met wie', klant.contact_name?.split(' ')[0] ?? '', 'placeholder="Peter"')}
        <div class="field span-2">
          <label for="f-notes">Waarover ging het?</label>
          <textarea id="f-notes" name="notes" rows="4"
            placeholder="Nieuwe Type B voorraad besproken"></textarea>
        </div>
      </div>`,
    onSubmit: async (data) => {
      try {
        await api.nieuwBezoek(klant.id, data);
        toast('Bezoek genoteerd.');
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
      const rapport = await probeer(() => api.importeer(data.csv));
      const delen = [`${rapport.toegevoegd} klant(en) toegevoegd`];
      if (rapport.mislukt.length) delen.push(`${rapport.mislukt.length} rij(en) overgeslagen`);
      toast(`${delen.join(', ')}.`, rapport.mislukt.length ? 'fout' : 'ok');
      if (rapport.mislukt.length) console.table(rapport.mislukt);
      await naImport(rapport);
      form.reset();
    },
  });

  const bestand = document.getElementById('f-bestand');
  bestand.onchange = async () => {
    const file = bestand.files?.[0];
    if (file) document.getElementById('f-csv').value = await file.text();
  };
}
