import { api, probeer } from './api.js';
import { esc, modal, opties, toonFouten, toast, hoofdletter } from './util.js';

const STATUSSEN = ['prospect', 'actief', 'slapend', 'verloren'];

const veld = (naam, label, waarde = '', extra = '') =>
  `<div class="field"><label for="f-${naam}">${esc(label)}</label>
     <input id="f-${naam}" name="${naam}" value="${esc(waarde)}" ${extra}></div>`;

/** Formulier voor een nieuwe of bestaande klant. */
export function klantFormulier(klant = null, naOpslaan = () => {}) {
  const k = klant ?? {};
  modal({
    titel: klant ? `${k.company_name} bewerken` : 'Nieuwe klant',
    breed: true,
    bevestig: klant ? 'Wijzigingen opslaan' : 'Klant aanmaken',
    body: `
      <div class="fields">
        <div class="span-2">${veld('company_name', 'Bedrijfsnaam *', k.company_name, 'required autocomplete="off"')}</div>
        ${veld('contact_name', 'Contactpersoon', k.contact_name)}
        ${veld('email', 'E-mail', k.email, 'type="email"')}
        ${veld('phone', 'Telefoon', k.phone)}
        ${veld('website', 'Website', k.website)}
        ${veld('vat_number', 'BTW-nummer', k.vat_number, 'placeholder="BE 0123.456.749"')}
        <div class="field">
          <label for="f-status">Status</label>
          <select id="f-status" name="status">${opties(STATUSSEN.map((s) => [s, hoofdletter(s)]), k.status ?? 'prospect')}</select>
        </div>
        ${veld('street', 'Straat en nummer', k.street)}
        ${veld('postal_code', 'Postcode', k.postal_code)}
        ${veld('city', 'Gemeente', k.city)}
        ${veld('country', 'Land', k.country ?? 'BE', 'maxlength="2" placeholder="BE"')}
        <div class="span-2">${veld('tags', 'Tags (komma gescheiden)', (k.tags ?? []).join(', '), 'placeholder="horeca, vaste klant"')}</div>
        <div class="span-2">${veld('source', 'Hoe binnengekomen', k.source, 'placeholder="Doorverwijzing, beurs, website…"')}</div>
        <div class="field span-2">
          <label for="f-intro">Wie is deze klant?</label>
          <textarea id="f-intro" name="intro" placeholder="Waar draait het om, wie beslist, wat is de context.">${esc(k.intro ?? '')}</textarea>
        </div>
      </div>`,
    onSubmit: async (data) => {
      try {
        const resultaat = klant ? await api.wijzigKlant(k.id, data) : await api.nieuweKlant(data);
        toast(klant ? 'Klant bijgewerkt.' : 'Klant aangemaakt.');
        naOpslaan(resultaat);
      } catch (err) {
        toonFouten(err.fouten ?? [err.message]);
        return false;
      }
    },
  });
}

/** CSV-import met een voorbeeldbestand en een duidelijk rapport achteraf. */
export function importFormulier(naImport = () => {}) {
  modal({
    titel: 'Klanten importeren uit CSV',
    breed: true,
    bevestig: 'Importeren',
    body: `
      <p class="muted" style="margin-top:0">
        Plak de inhoud van je bestand of kies het hieronder. De eerste rij moet kolomnamen bevatten.
        Herkende kolommen: <span class="mono">Bedrijf, Contactpersoon, E-mail, Telefoon, Website, BTW,
        Straat, Postcode, Gemeente, Land, Status, Bron, Tags</span>. Zowel komma's als puntkomma's werken.
      </p>
      <div class="field"><input type="file" id="f-bestand" accept=".csv,text/csv"></div>
      <div class="field">
        <label for="f-csv">CSV-inhoud</label>
        <textarea id="f-csv" name="csv" style="min-height:180px" class="mono"
          placeholder="Bedrijf;E-mail;Gemeente&#10;Bakkerij Vermeulen;info@vermeulen.be;Gent"></textarea>
      </div>`,
    onSubmit: async (data, form) => {
      if (!String(data.csv ?? '').trim()) {
        toonFouten(['Plak eerst de inhoud van je CSV-bestand of kies een bestand.']);
        return false;
      }
      const rapport = await probeer(() => api.importeer(data.csv));
      const delen = [`${rapport.toegevoegd} klant(en) toegevoegd`];
      if (rapport.mislukt.length) delen.push(`${rapport.mislukt.length} rij(en) overgeslagen`);
      toast(delen.join(', ') + '.', rapport.mislukt.length ? 'fout' : 'ok');
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
