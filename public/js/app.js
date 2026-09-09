import { api, probeer } from './api.js';
import { esc, toast, opties } from './util.js';
import { Kaart } from './kaart.js';
import { toonDossier, toonLeeg } from './dossier.js';
import { klantFormulier, importFormulier, gebruikersFormulier, instellingenFormulier } from './forms.js';

const el = {
  zoek: document.getElementById('zoek'),
  filter: document.getElementById('filter'),
  lade: document.getElementById('filterlade'),
  chips: document.getElementById('chips'),
  tag: document.getElementById('tag'),
  provincie: document.getElementById('provincie'),
  dossier: document.getElementById('dossier'),
  melding: document.getElementById('kaartmelding'),
  plaatsbalk: document.getElementById('plaatsbalk'),
  plaatstekst: document.getElementById('plaatstekst'),
};

const staat = { q: '', bucket: '', tag: '', provincie: '', zonderStipOpen: false, klanten: [], geselecteerd: null, plaatstVoor: null };

const kaart = new Kaart('kaart', {
  onSelecteer: (id) => selecteer(id, { vlieg: false }),
  onPlaats: plaatsStip,
  onTegelfout: () => {
    el.melding.hidden = false;
    el.melding.textContent = 'Kaartachtergrond niet bereikbaar — de stippen en hun onderlinge ligging kloppen wel.';
  },
});

/** Haalt de gefilterde klantenlijst op en tekent de kaart opnieuw. */
async function ververs({ pasAan = false } = {}) {
  staat.klanten = await api.klanten({
    q: staat.q, bucket: staat.bucket, tag: staat.tag, provincie: staat.provincie,
  });
  kaart.toon(staat.klanten, staat.geselecteerd);
  if (pasAan) kaart.pasAan(staat.klanten);

  const zichtbaar = staat.klanten.some((k) => k.id === staat.geselecteerd);
  if (staat.geselecteerd && !zichtbaar) kaart.markeer(staat.klanten, staat.geselecteerd);

  await ververTellingen();
  toonZonderStip();
}

async function ververTellingen() {
  const { tellingen, tags, provincies, drempels } = await api.overzicht();
  const grens = drempels ?? tellingen.drempels;
  const uitleg = {
    recent: `tot ${grens.recent} dagen na het laatste bezoek`,
    tijdje: `tussen ${grens.recent} en ${grens.tijdje} dagen`,
    lang: `langer dan ${grens.tijdje} dagen geleden, of nog nooit`,
  };
  for (const chip of el.chips.querySelectorAll('.chip')) {
    chip.querySelector('span').textContent = tellingen[chip.dataset.bucket];
    chip.title = uitleg[chip.dataset.bucket];
  }
  const huidige = el.tag.value;
  el.tag.innerHTML = `<option value="">Alle tags</option>${opties(tags.map((t) => [t.name, `${t.name} (${t.aantal})`]), huidige)}`;
  el.tag.value = staat.tag;

  // alleen provincies waar ook echt klanten zitten, met hun aantal erbij
  const metKlanten = new Map(tellingen.per_provincie);
  el.provincie.innerHTML = `<option value="">Heel België (${tellingen.totaal})</option>${opties(
    provincies.filter((p) => metKlanten.has(p)).map((p) => [p, `${p} (${metKlanten.get(p)})`]), staat.provincie)}`;
  el.provincie.value = staat.provincie;

  staat.tellingen = tellingen;
}

/**
 * Klanten zonder coördinaten kunnen niet op de kaart. Dat verzwijgen we niet, maar
 * bij honderden klanten mag die melding het scherm ook niet opeten: standaard alleen
 * een telling en een knop die ze in één keer plaatst.
 */
function toonZonderStip() {
  const zonder = staat.klanten.filter((k) => !k.op_kaart);
  let bak = document.getElementById('zonderstip');
  if (!zonder.length) {
    bak?.remove();
    return;
  }
  if (!bak) {
    bak = document.createElement('div');
    bak.id = 'zonderstip';
    bak.className = 'zonderstip';
    document.querySelector('.kaartvak').append(bak);
  }

  const uitgeklapt = staat.zonderStipOpen && zonder.length > 1;
  bak.innerHTML = `
    <div class="zonderstip-kop">
      <strong>${zonder.length} niet op de kaart</strong>
      <button class="btn btn-sm btn-primary" id="plaats-alles">Automatisch plaatsen</button>
      ${zonder.length > 1 ? `<button class="linklike" id="toon-lijst">${uitgeklapt ? 'verbergen' : 'toon lijst'}</button>` : ''}
    </div>
    <div class="zonderstip-lijst"${uitgeklapt || zonder.length === 1 ? '' : ' hidden'}>
      ${zonder.map((k) => `<button class="linklike" data-id="${k.id}">${esc(k.name)}</button>`).join(', ')}
    </div>`;

  for (const knop of bak.querySelectorAll('[data-id]')) {
    knop.onclick = () => selecteer(Number(knop.dataset.id), { vlieg: false });
  }
  const toon = bak.querySelector('#toon-lijst');
  if (toon) {
    toon.onclick = () => { staat.zonderStipOpen = !staat.zonderStipOpen; toonZonderStip(); };
  }
  bak.querySelector('#plaats-alles').onclick = plaatsAllemaal;
}

/** Zet in één keer alle klanten zonder stip op het midden van hun gemeente. */
async function plaatsAllemaal() {
  const knop = document.getElementById('plaats-alles');
  knop.disabled = true;
  knop.textContent = 'Bezig…';
  try {
    const r = await probeer(() => api.plaatsOpKaart());
    const delen = [`${r.geplaatst} klant(en) op de kaart gezet`];
    if (r.nietGevonden.length) delen.push(`${r.nietGevonden.length} zonder herkenbare gemeente`);
    toast(`${delen.join(', ')}.`, r.nietGevonden.length ? 'fout' : 'ok');
    if (r.nietGevonden.length) console.table(r.nietGevonden);
    staat.zonderStipOpen = r.nietGevonden.length > 0 && r.nietGevonden.length <= 20;
    await ververs({ pasAan: true });
  } catch {
    knop.disabled = false;
    knop.textContent = 'Automatisch plaatsen';
  }
}

async function selecteer(id, { vlieg = true } = {}) {
  staat.geselecteerd = id;
  kaart.markeer(staat.klanten, id);
  const klant = staat.klanten.find((k) => k.id === id);
  if (vlieg) kaart.vlieg(klant);

  await toonDossier(el.dossier, id, {
    naWijziging: async ({ deselecteer = false } = {}) => {
      if (deselecteer) {
        staat.geselecteerd = null;
        await ververs();
        toonLeeg(el.dossier, staat.tellingen);
      } else {
        await ververs();
        await selecteer(id, { vlieg: false });
      }
    },
    opPlaatsen: startPlaatsen,
  });
  el.dossier.scrollTop = 0;
}

// ---------- stip plaatsen door op de kaart te klikken ----------

function startPlaatsen(klant) {
  staat.plaatstVoor = klant;
  kaart.zetPlaatsModus(true);
  el.plaatsbalk.hidden = false;
  el.plaatstekst.textContent = `Klik op de kaart waar "${klant.name}" ligt.`;
}

function stopPlaatsen() {
  staat.plaatstVoor = null;
  kaart.zetPlaatsModus(false);
  el.plaatsbalk.hidden = true;
}

async function plaatsStip(lat, lon) {
  const klant = staat.plaatstVoor;
  if (!klant) return;
  stopPlaatsen();
  await probeer(
    () => api.wijzigKlant(klant.id, {
      lat: lat.toFixed(6), lon: lon.toFixed(6), locatie_bron: 'handmatig',
    }),
    `${klant.name} staat nu op de kaart.`,
  );
  await ververs();
  await selecteer(klant.id, { vlieg: false });
}

document.getElementById('plaatsstop').onclick = stopPlaatsen;
addEventListener('keydown', (e) => { if (e.key === 'Escape' && staat.plaatstVoor) stopPlaatsen(); });

// ---------- zoeken en filteren ----------

let zoekTimer;
el.zoek.oninput = () => {
  clearTimeout(zoekTimer);
  zoekTimer = setTimeout(async () => {
    staat.q = el.zoek.value.trim();
    // ook bij het wissen opnieuw inkaderen: anders blijft de kaart ingezoomd
    // op de vorige treffer en staan de andere klanten buiten beeld
    await ververs({ pasAan: true });
  }, 200);
};

for (const chip of el.chips.querySelectorAll('.chip')) {
  chip.onclick = async () => {
    staat.bucket = staat.bucket === chip.dataset.bucket ? '' : chip.dataset.bucket;
    for (const c of el.chips.querySelectorAll('.chip')) {
      const aan = c.dataset.bucket === staat.bucket;
      c.classList.toggle('aan', aan);
      c.setAttribute('aria-pressed', String(aan));
    }
    await ververs({ pasAan: true });
  };
}

el.filter.onclick = () => {
  el.lade.hidden = !el.lade.hidden;
  el.filter.setAttribute('aria-expanded', String(!el.lade.hidden));
  kaart.herbereken();
};

el.tag.onchange = async () => { staat.tag = el.tag.value; await ververs({ pasAan: true }); };
el.provincie.onchange = async () => { staat.provincie = el.provincie.value; await ververs({ pasAan: true }); };

document.getElementById('wis').onclick = async () => {
  staat.q = staat.bucket = staat.tag = staat.provincie = '';
  el.zoek.value = '';
  el.tag.value = '';
  el.provincie.value = '';
  for (const c of el.chips.querySelectorAll('.chip')) {
    c.classList.remove('aan');
    c.setAttribute('aria-pressed', 'false');
  }
  await ververs({ pasAan: true });
};

document.getElementById('nieuw').onclick = () => klantFormulier(null, async (k) => {
  await ververs();
  await selecteer(k.id);
});
document.getElementById('import').onclick = () => importFormulier(() => ververs({ pasAan: true }));
document.getElementById('gebruikers').onclick = () => gebruikersFormulier();
document.getElementById('instellingen').onclick = () => instellingenFormulier(async () => {
  await ververs();
  // het dossier toont de kleurgroep ook, dus dat moet mee
  if (staat.geselecteerd) await selecteer(staat.geselecteerd, { vlieg: false });
  else toonLeeg(el.dossier, staat.tellingen);
});
document.getElementById('uitloggen').onclick = async () => {
  await api.uitloggen();
  location.replace('/login');
};

// ---------- start ----------

(async () => {
  try {
    await ververs({ pasAan: true });
    toonLeeg(el.dossier, staat.tellingen);
  } catch (err) {
    toast(err.message, 'fout');
    el.dossier.innerHTML = `<p class="leeg">Kon de klanten niet laden.<br><span class="muted">${esc(err.message)}</span></p>`;
  }
})();
