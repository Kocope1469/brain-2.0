---
titel: Klantenkaart
type: project
status: gebouwd, nog niet online
klant: Comsoltech
gestart: 2026-09-06
tags:
  - project/klantenkaart
  - status/actief
---

# Klantenkaart

Webapp die het Excel-overzicht van Comsoltech vervangt. Alle klanten als stip op de
kaart van België, gekleurd naar hoe lang geleden je er langsging. Klik een stip aan
en je ziet het klantdossier met de volledige bezoekgeschiedenis.

> [!info] Waarom dit bestaat
> Tijdens een klantbezoek meteen zien welke andere bedrijven in de buurt zitten, en
> na een half jaar kunnen terugvinden wat er besproken is.

![[kaart-en-dossier.png]]

> [!note] De grijze achtergrond op deze schermafbeeldingen
> Ze zijn gemaakt in een omgeving zonder toegang tot OpenStreetMap, dus de
> kaarttegels ontbreken. De stippen staan wél op hun echte coördinaten. Bij jou zie
> je daaronder gewoon de kaart van België.

## Stand van zaken

| | |
|---|---|
| **Code** | `github.com/Kocope1469/brain-2.0`, branch `claude/klantenkaart-project-rg4ksp` |
| **Online** | ❌ nog niet — zie [[Online zetten]] |
| **Schaal** | ~100 klanten nu, groeiend naar enkele honderden |
| **Gebruikers** | Kobe + collega's, iedereen dezelfde rechten |
| **Tests** | 244 (160 op SQLite, de rest ook op Postgres) |
| **Omvang** | ~3.000 regels eigen code, 1 npm-pakket |

## De notities

- [[Wat het doet]] — functionaliteit, scherm per scherm
- [[Online zetten]] — het stappenplan voor Vercel, met de valkuilen
- [[CSV-import]] — hoe herimporteren werkt zonder dataverlies
- [[Kleurgrenzen]] — groen/oranje/rood zelf instellen
- [[Beveiliging]] — wat beschermd is en wat niet
- [[Beslissingen]] — waarom het is zoals het is
- [[Openstaande punten]] — wat er nog niet in zit
- [[Technisch overzicht]] — architectuur, commando's, bestanden
- [[Logboek]] — hoe dit tot stand kwam, inclusief de missers

## Eerstvolgende stap

[[Online zetten]] doorlopen aan het bureau. Reken op een halfuur. Alles daarna —
klanten importeren, collega's toevoegen, kleurgrenzen kiezen — is een kwestie van
minuten.
