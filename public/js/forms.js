import { api, probeer } from './api.js';
import { esc, modal, toonFouten, toast } from './util.js';

const veld = (naam, label, waarde = '', extra = '') =>
  `<div class="field"><label for="f-${naam}">${esc(label)}</label>
     <input id="f-${naam}" name="${naam}" value="${esc(waarde)}" ${extra}></div>`;

/** Het enige formulier in de app: wat er op een kaart komt te staan. */
export function kaartFormulier(kaart = null, naOpslaan = () => {}) {
  const k = kaart ?? {};
  modal({
    titel: kaart ? `${k.company_name} bewerken` : 'Nieuwe kaart',
    breed: true,
    bevestig: kaart ? 'Opslaan' : 'Kaart aanmaken',
    body: `
      <div class="fields">
        <div class="span-2">${veld('company_name', 'Naam *', k.company_name, 'required autocomplete="off"')}</div>
        ${veld('contact_name', 'Contactpersoon', k.contact_name)}
        ${veld('role', 'Functie', k.role, 'placeholder="Zaakvoerder, inkoper…"')}
        ${veld('phone', 'Telefoon', k.phone)}
        ${veld('email', 'E-mail', k.email, 'type="email"')}
        ${veld('website', 'Website', k.website)}
        ${veld('vat_number', 'BTW-nummer', k.vat_number, 'placeholder="BE 0123.456.749"')}
        <div class="span-2">${veld('street', 'Straat en nummer', k.street)}</div>
        ${veld('postal_code', 'Postcode', k.postal_code)}
        ${veld('city', 'Gemeente', k.city)}
        ${veld('country', 'Land', k.country ?? 'BE', 'maxlength="2"')}
        ${veld('source', 'Hoe binnengekomen', k.source, 'placeholder="Doorverwijzing, beurs…"')}
        <div class="span-2">${veld('tags', 'Tags (komma gescheiden)', (k.tags ?? []).join(', '), 'placeholder="horeca, vaste klant"')}</div>
        <div class="field span-2">
          <label for="f-notes">Notities</label>
          <textarea id="f-notes" name="notes" rows="8"
            placeholder="Wat moet je over deze klant weten? Wie beslist, hoe je hen best bereikt, waar het over gaat.">${esc(k.notes ?? '')}</textarea>
        </div>
      </div>`,
    onSubmit: async (data) => {
      try {
        const resultaat = kaart ? await api.wijzigKlant(k.id, data) : await api.nieuweKlant(data);
        toast(kaart ? 'Kaart bijgewerkt.' : 'Kaart aangemaakt.');
        naOpslaan(resultaat);
      } catch (err) {
        toonFouten(err.fouten ?? [err.message]);
        return false;
      }
    },
  });
}

/** CSV-import: bestaande lijst in één keer omzetten naar kaarten. */
export function importFormulier(naImport = () => {}) {
  modal({
    titel: 'Kaarten importeren uit CSV',
    breed: true,
    bevestig: 'Importeren',
    body: `
      <p class="muted" style="margin-top:0">
        Plak de inhoud van je bestand of kies het hieronder. De eerste rij moet kolomnamen bevatten.
        Herkend worden onder meer <span class="mono">Bedrijf, Contactpersoon, Functie, E-mail, Telefoon,
        Website, BTW, Straat, Postcode, Gemeente, Bron, Tags, Notities</span> — komma's en puntkomma's werken allebei.
      </p>
      <div class="field"><input type="file" id="f-bestand" accept=".csv,text/csv"></div>
      <div class="field">
        <label for="f-csv">CSV-inhoud</label>
        <textarea id="f-csv" name="csv" rows="9" class="mono"
          placeholder="Bedrijf;E-mail;Gemeente&#10;Bakkerij Vermeulen;info@vermeulen.be;Gent"></textarea>
      </div>`,
    onSubmit: async (data, form) => {
      if (!String(data.csv ?? '').trim()) {
        toonFouten(['Plak eerst de inhoud van je CSV-bestand of kies een bestand.']);
        return false;
      }
      const rapport = await probeer(() => api.importeer(data.csv));
      const delen = [`${rapport.toegevoegd} kaart(en) toegevoegd`];
      if (rapport.mislukt.length) delen.push(`${rapport.mislukt.length} rij(en) overgeslagen`);
      toast(`${delen.join(', ')}.`, rapport.mislukt.length ? 'fout' : 'ok');
      if (rapport.mislukt.length) {
        console.table(rapport.mislukt.map((m) => ({ rij: m.rij, naam: m.naam, fouten: m.fouten.join(' ') })));
      }
      naImport(rapport);
      form.reset();
    },
  });

  const bestand = document.getElementById('f-bestand');
  bestand.onchange = async () => {
    const file = bestand.files?.[0];
    if (file) document.getElementById('f-csv').value = await file.text();
  };
}
