import { KLEUREN, esc } from './util.js';

/** De eerder gekozen kaartlaag, of de standaard. */
function gekozenLaag() {
  try {
    return localStorage.getItem('kk_kaartlaag') ?? STANDAARDLAAG;
  } catch {
    return STANDAARDLAAG;
  }
}

const START = { midden: [50.85, 4.35], zoom: 8 }; // België in beeld

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers';
const CARTO = `${OSM}, &copy; <a href="https://carto.com/attributions">CARTO</a>`;

/**
 * De achtergrondkaart. De standaardkaart van OpenStreetMap toont élk gehucht en
 * elke landweg; met honderden stippen erover wordt dat druk. De rustige varianten
 * laten weg wat er voor dit doel niet toe doet, zodat de stippen opvallen.
 */
export const KAARTLAGEN = {
  rustig: {
    naam: 'Rustig',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attributie: CARTO,
    maxZoom: 20,
  },
  kleur: {
    naam: 'Kleur',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attributie: CARTO,
    maxZoom: 20,
  },
  donker: {
    naam: 'Donker',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attributie: CARTO,
    maxZoom: 20,
  },
  detail: {
    naam: 'Alle details',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attributie: OSM,
    maxZoom: 19,
  },
};

export const STANDAARDLAAG = 'rustig';

/**
 * De kaart met één stip per klant, gekleurd naar hoe lang geleden je er was.
 *
 * De achtergrondtegels komen van OpenStreetMap en hebben dus internet nodig.
 * Zijn ze onbereikbaar, dan blijven de stippen en hun onderlinge ligging gewoon
 * kloppen; we melden het en gaan door.
 */
export class Kaart {
  /** Welke achtergrondkaart is er nu gekozen? */
  get laagnaam() {
    return this.huidigeLaag;
  }

  /**
   * Wisselt van achtergrondkaart. De keuze wordt per browser onthouden; het is een
   * kwestie van smaak, niet iets dat voor iedereen hetzelfde hoeft te zijn.
   */
  zetLaag(sleutel) {
    const keuze = KAARTLAGEN[sleutel] ? sleutel : STANDAARDLAAG;
    if (this.huidigeLaag === keuze && this.laag) return;
    this.huidigeLaag = keuze;
    const spec = KAARTLAGEN[keuze];

    if (this.laag) this.laag.remove();
    this.laag = L.tileLayer(spec.url, {
      maxZoom: spec.maxZoom,
      attribution: spec.attributie,
      subdomains: spec.subdomains,
    });
    let gemeld = false;
    this.laag.on('tileerror', () => {
      if (gemeld) return;
      gemeld = true;
      this.onTegelfout?.();
    });
    this.laag.addTo(this.map);

    try {
      localStorage.setItem('kk_kaartlaag', keuze);
    } catch {
      // privémodus of geblokkeerde opslag: dan geldt de keuze alleen deze sessie
    }
  }

  constructor(elementId, { onSelecteer, onPlaats, onTegelfout } = {}) {
    this.onSelecteer = onSelecteer ?? (() => {});
    this.onPlaats = onPlaats ?? (() => {});
    this.markers = new Map();
    this.plaatsModus = false;
    this.geselecteerd = null;

    this.map = L.map(elementId, { zoomControl: true, attributionControl: true })
      .setView(START.midden, START.zoom);

    this.onTegelfout = onTegelfout;
    this.laag = null;
    this.zetLaag(gekozenLaag());

    this.map.on('click', (e) => {
      if (this.plaatsModus) this.onPlaats(e.latlng.lat, e.latlng.lng);
    });

    // uitgezoomd op heel België liggen honderden stippen over elkaar en kun je de
    // onderste niet meer aanklikken; kleiner tekenen houdt ze uit elkaar
    this.map.on('zoomend', () => this.#herteken());
  }

  /** Zet alle stippen opnieuw; klanten zonder coördinaten komen niet op de kaart. */
  toon(klanten, geselecteerdId = null) {
    this.geselecteerd = geselecteerdId;
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();

    for (const k of klanten) {
      if (!k.op_kaart) continue;
      const marker = L.circleMarker([k.lat, k.lon], this.#stijl(k, k.id === geselecteerdId));
      marker.bindTooltip(`${esc(k.name)}${k.city ? ` — ${esc(k.city)}` : ''}`, { direction: 'top' });
      marker.on('click', () => this.onSelecteer(k.id));
      marker.addTo(this.map);
      this.markers.set(k.id, marker);
    }
  }

  /** Hoe groot een stip mag zijn op dit zoomniveau. */
  #straal() {
    const zoom = this.map.getZoom();
    if (zoom <= 8) return 4;
    if (zoom <= 10) return 5;
    if (zoom <= 12) return 6;
    return 8;
  }

  #herteken() {
    const straal = this.#straal();
    for (const [id, marker] of this.markers) {
      marker.setStyle({
        radius: id === this.geselecteerd ? straal + 3 : straal,
        weight: id === this.geselecteerd ? 3 : 1.5,
      });
    }
  }

  #stijl(klant, geselecteerd) {
    const kleur = KLEUREN[klant.bucket] ?? KLEUREN.lang;
    const straal = this.#straal();
    return {
      radius: geselecteerd ? straal + 3 : straal,
      color: geselecteerd ? '#ffffff' : 'rgba(0,0,0,.35)',
      weight: geselecteerd ? 3 : 1.5,
      fillColor: kleur,
      fillOpacity: 0.95,
      className: `stip stip-${klant.bucket}`,
    };
  }

  /** Markeert één stip als geselecteerd, zonder alles opnieuw te tekenen. */
  markeer(klanten, id) {
    this.geselecteerd = id;
    for (const k of klanten) {
      const marker = this.markers.get(k.id);
      if (marker) marker.setStyle(this.#stijl(k, k.id === id));
    }
    const gekozen = this.markers.get(id);
    if (gekozen) gekozen.bringToFront();
  }

  /** Schuift de kaart naar de getoonde klanten; doet niets als er geen stippen zijn. */
  pasAan(klanten) {
    const punten = klanten.filter((k) => k.op_kaart).map((k) => [k.lat, k.lon]);
    if (!punten.length) return;
    if (punten.length === 1) this.map.setView(punten[0], Math.max(this.map.getZoom(), 12));
    else this.map.fitBounds(L.latLngBounds(punten).pad(0.15));
  }

  vlieg(klant, zoom = 14) {
    if (klant?.op_kaart) this.map.flyTo([klant.lat, klant.lon], zoom, { duration: 0.6 });
  }

  zetPlaatsModus(aan) {
    this.plaatsModus = aan;
    this.map.getContainer().classList.toggle('plaatsen', aan);
  }

  herbereken() {
    this.map.invalidateSize();
  }
}
