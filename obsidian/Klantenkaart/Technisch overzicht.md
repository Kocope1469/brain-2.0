---
titel: Technisch overzicht
type: notitie
tags:
  - project/klantenkaart
  - technisch
---

# Technisch overzicht

Onderdeel van [[Klantenkaart]].

## Stack

- **Node 22** — SQLite zit ingebouwd (`node:sqlite`), geen buildstap
- **Eén npm-pakket**: `pg` (Postgres)
- **Leaflet** staat in `public/vendor/`, niet op een CDN
- **Kaarttegels** van OpenStreetMap (het enige dat internet nodig heeft)
- **Adresopzoeking** via Nominatim, faalt zacht

## Commando's

```bash
npm install
npm run seed     # negen voorbeeldklanten
npm start        # http://localhost:3000
npm run dev      # herstart bij wijzigingen
npm test         # 160 tests op SQLite

# de belangrijke testvorm: ook tegen Postgres
TEST_DATABASE_URL=postgres://... npm test    # 244 tests
```

Omgevingsvariabelen: een Postgres-adres onder `DATABASE_URL`, `POSTGRES_URL`,
`POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL` of `NEON_DATABASE_URL` (anders
SQLite), `KLANTENKAART_DB` (pad naar het SQLite-bestand), `PORT`.

Bij het opstarten logt de app één regel — `[klantenkaart] opslag: …` — die zegt waar
de gegevens heen gaan. Dat is het eerste wat je nakijkt als er iets niet blijft staan.

## Bestanden

```
api/index.js        ingang voor Vercel
server/
  index.js          HTTP-server, routes, toegangscontrole
  db.js             SQLite én Postgres achter één adapter
  store.js          alle queries en de import — enige plek met SQL
  auth.js           wachtwoorden, sessies, gebruikers
  beveiliging.js    headers, inlogpogingen, tokenhashes
  instellingen.js   de kleurgrenzen
  validate.js       validatie, BTW, coördinaten, kleurgroepen, provincies
  geocode.js        adres naar coördinaten
  csv.js            CSV lezen en schrijven
  seed.js           voorbeeldklanten
public/             interface: kaart, dossier, formulieren, inlogpagina, iconen
test/               244 tests, allemaal op beide databases
```

## Database

Tabellen: `customers`, `visits`, `tags`, `customer_tags`, `users`, `sessions`,
`login_attempts`, `settings`.

De kleur van een klant staat **niet** in de database — die wordt berekend uit
`MAX(visit_date)` en de ingestelde grenzen. Datzelfde geldt voor de provincie, die
uit de postcode komt. Zo kan er niets verouderen.

## Van SQLite naar een andere database

Alle SQL staat in `server/db.js` en `server/store.js`. Wil je ooit iets anders dan
Postgres, dan is dat de enige plek die je aanraakt.
