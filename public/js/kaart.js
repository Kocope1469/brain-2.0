import { KLEUREN, esc } from './util.js';

const START = { midden: [50.85, 4.35], zoom: 8 }; // België in beeld
const TEGELS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTIE = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers';

/**
 * De kaart met één stip per klant, gekleurd naar hoe lang geleden je er was.
 *
 * De achtergrondtegels komen van OpenStreetMap en hebben dus internet nodig.
 * Zijn ze onbereikbaar, dan blijven de stippen en hun onderlinge ligging gewoon
 * kloppen; we melden het en gaan door.
 */
export class Kaart {
  constructor(elementId, { onSelecteer, onPlaats, onTegelfout } = {}) {
    this.onSelecteer = onSelecteer ?? (() => {});
    this.onPlaats = onPlaats ?? (() => {});
    this.markers = new Map();
    this.plaatsModus = false;

    this.map = L.map(elementId, { zoomControl: true, attributionControl: true })
      .setView(START.midden, START.zoom);

    const laag = L.tileLayer(TEGELS, { maxZoom: 19, attribution: ATTRIBUTIE });
    let gemeld = false;
    laag.on('tileerror', () => {
      if (gemeld) return;
      gemeld = true;
      onTegelfout?.();
    });
    laag.addTo(this.map);

    this.map.on('click', (e) => {
      if (this.plaatsModus) this.onPlaats(e.latlng.lat, e.latlng.lng);
    });
  }

  /** Zet alle stippen opnieuw; klanten zonder coördinaten komen niet op de kaart. */
  toon(klanten, geselecteerdId = null) {
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

  #stijl(klant, geselecteerd) {
    const kleur = KLEUREN[klant.bucket] ?? KLEUREN.lang;
    return {
      radius: geselecteerd ? 11 : 8,
      color: geselecteerd ? '#ffffff' : 'rgba(0,0,0,.35)',
      weight: geselecteerd ? 3 : 1.5,
      fillColor: kleur,
      fillOpacity: 0.95,
      className: `stip stip-${klant.bucket}`,
    };
  }

  /** Markeert één stip als geselecteerd, zonder alles opnieuw te tekenen. */
  markeer(klanten, id) {
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
