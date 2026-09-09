---
titel: Openstaande punten
type: notitie
tags:
  - project/klantenkaart
  - todo
---

# Openstaande punten

Onderdeel van [[Klantenkaart]].

## Nu doen

- [ ] **Bezoekdata invoeren.** Op 9 september stonden 154 van de 156 klanten op blauw:
      geen enkel bezoek genoteerd. Zolang dat zo is, doen de kleurgrenzen niets en is
      dit een adressenkaart in plaats van een bezoekplanning. Twee wegen, of een
      mengvorm: vanaf nu elk bezoek noteren (duurt maanden voor de kaart spreekt), of
      de laatste bezoekdatum uit Excel/agenda terughalen voor de klanten die er echt
      toe doen (zwaar werk, maar dan werkt de kaart meteen).
- [ ] Twee geweigerde CSV-regels rechtzetten en opnieuw importeren: **ENERSOL SRL**
      (ongeldig btw-nummer) en **ELETECHNIK BELGIUM** (ongeldig e-mailadres). Die
      twee klanten zitten niet in de app. Zie [[CSV-import]].
- [ ] Elf klanten handmatig op de kaart zetten — vijf zonder gemeente, drie
      buitenlandse (Assen NL, Genlis FR, Le Port), drie in gemeenten die de
      plaatsenlijst niet kent (Affligem, Stasegem)
- [ ] Maandelijkse CSV-export als back-up inplannen

## Afgewerkt

- [x] **[[Online zetten]]** — draait op Vercel met Neon-database
- [x] Klanten importeren uit het CRM — 157 van de 159 regels binnen ([[CSV-import]])
- [x] Collega's toevoegen — eerste collega heeft een account (september 2026)
- [x] [[Kleurgrenzen]] gekozen: groen tot 180 dagen, oranje tot 300 dagen
- [x] Achtergrondkaart: vier keuzes, alle vier nagekeken en werkend
      ([[Wat het doet]])
- [x] Keuzelijst met klanten naast de kaart, onder de tellingen
- [x] Bij een bezoek kiezen welke collega er geweest is
- [x] Een genoteerd bezoek achteraf kunnen rechtzetten

## Bewust niet gebouwd

Dit zijn keuzes, geen vergetelheden. Zie ook [[Beslissingen]].

- **Rollen en rechten** — iedereen kan alles. Eerste ding om toe te voegen zodra het
  team groeit voorbij een handvol mensen die elkaar kennen.
- **Prullenbak / ongedaan maken** — verwijderen is nu definitief.
- **Logboek van wijzigingen** — wie wat veranderde of wiste.
- **Tweestapsverificatie**
- **Wachtwoord vergeten** — nu moet een collega het resetten.
- **Automatische CRM-koppeling** — import gaat via CSV.
- **Automatisch geocoderen bij import** — te veel opzoekingen bij een gratis dienst.

## Ideeën voor later

- Route plannen: "toon me de rode klanten binnen 20 km van hier"
- Notificatie of overzicht: "deze klanten worden volgende maand rood"
- Foto's of bijlagen bij een bezoek
