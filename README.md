# Klantenkaart

Al je klanten als stip op de kaart, gekleurd naar hoe lang geleden je er langsging.
Groen is recent, oranje is een tijdje geleden, rood is te lang. Klik een stip aan en
je ziet het klantdossier met de bezoekgeschiedenis: wanneer, met wie, en waarover.

Gemaakt voor iemand die de baan op gaat en wil zien wie er in de buurt ligt en wie
hij al te lang niet gezien heeft.

## Starten

```bash
npm run seed     # optioneel: negen voorbeeldklanten verspreid over Vlaanderen
npm start        # http://localhost:3000
```

Verder:

```bash
npm run dev      # herstart automatisch bij wijzigingen
npm test         # 66 tests, ~0,4s
```

De database is één bestand: `data/klantenkaart.db` (staat in `.gitignore`).
Een back-up is een kopie van dat bestand. Elders bewaren: `KLANTENKAART_DB=/pad/db`.
Andere poort: `PORT=8080`.

## Wat het doet

**De kaart** — één stip per klant. De kleur volgt automatisch uit het meest recente
bezoek: tot 30 dagen groen, tot 90 dagen oranje, daarna rood. Nooit bezocht is ook
rood, want dat is precies wat je wil zien.

**Zoeken en filteren** — één zoekveld voor naam, contactpersoon, gemeente, postcode
en notities. Drie knoppen om op kleurgroep te filteren, met een teller per groep.
Filteren op tag kan achter de Filter-knop. De kaart kadert zich telkens opnieuw in
op wat er overblijft.

**Het klantdossier** — contactgegevens, adres, BTW, tags, vrije notities, en
daaronder alle bezoeken van recent naar oud. Een bezoek noteren is drie velden:
datum, met wie, en waarover het ging.

**Stippen plaatsen** — klanten zonder coördinaten staan niet op de kaart, en dat
wordt niet verzwegen: linksonder staat wie er ontbreekt. Eén klik op "Op de kaart
zetten", dan klikken waar de klant ligt. Wie een adres heeft ingevuld kan het ook
automatisch laten opzoeken.

**CSV in en uit** — de import herkent Nederlandse en Engelse kolomnamen, komma's
zowel als de puntkomma van Excel NL/BE, neemt `Breedtegraad` en `Lengtegraad` mee
als je die hebt, en meldt per rij wat mislukte.

## Keuzes die bewust gemaakt zijn

**Bezoeken bepalen de kleur, niets anders.** Geen handmatig statusveld dat je moet
bijwerken en dus na drie weken liegt. Noteer je een bezoek, dan wordt de stip
groen. Doe je dat niet, dan wordt hij vanzelf rood. Dat is het hele mechanisme.

**Geen coördinaten betekent geen stip, niet stiekem op 0,0.** Een klant zonder
plaats hoort niet ergens in de Golf van Guinee te verschijnen. Hij staat gewoon in
de lijst "niet op de kaart" tot je hem plaatst.

**De kaart werkt door zonder internet.** De achtergrondtegels komen van
OpenStreetMap en hebben een verbinding nodig. Vallen ze weg, dan blijven de stippen
en hun onderlinge ligging kloppen; je krijgt een melding en verder niets.

**De adresopzoeking mag falen.** Nominatim is gratis, met een gebruiksbeleid en een
wachtrij van één verzoek per seconde. Antwoordt hij niet, dan zet je de stip zelf
met één klik. Nooit een blokkade.

**Leaflet staat in de repo, niet op een CDN.** `public/vendor/leaflet/`, 196 KB,
BSD-licentie meegeleverd. Verder nul dependencies: Node 22 heeft SQLite ingebouwd,
de rest is standaardbibliotheek. Geen `npm install`, geen buildstap.

## Structuur

```
server/
  index.js     HTTP-server, routes, statische bestanden
  db.js        SQLite-schema en verbinding
  store.js     alle queries — de enige plek waar SQL staat
  validate.js  validatie, BTW-controle, coördinaten, kleurgroepen
  geocode.js   adres -> coördinaten via Nominatim, faalt zacht
  csv.js       CSV lezen en schrijven
  seed.js      voorbeeldklanten
public/
  index.html   de schil
  css/app.css  volledige stijl, donker en licht
  js/          app.js (regie), kaart.js (Leaflet), dossier.js, forms.js, api.js, util.js
  vendor/      Leaflet
test/          66 tests: validatie, store, csv, en de API end-to-end
```

## API

Alles onder `/api`. JSON in, JSON uit. Fouten komen terug als
`{"errors": ["Naam is verplicht."]}` met status 422.

| Methode | Pad | Wat |
| --- | --- | --- |
| `GET` | `/api/klanten?q=&bucket=&tag=&opkaart=1` | klanten met stip, laatste bezoek en kleurgroep |
| `POST` | `/api/klanten` | nieuwe klant |
| `GET` | `/api/klanten/:id` | dossier met alle bezoeken |
| `PATCH` | `/api/klanten/:id` | gedeeltelijk bijwerken, ook enkel `lat`/`lon` |
| `DELETE` | `/api/klanten/:id` | klant en zijn bezoeken |
| `POST` | `/api/klanten/:id/bezoeken` | bezoek noteren |
| `DELETE` | `/api/bezoeken/:id` | bezoek verwijderen |
| `GET` | `/api/overzicht` | tellingen per kleurgroep, tags, drempels |
| `POST` | `/api/geocode` | adres omzetten naar coördinaten |
| `GET` | `/api/klanten/export.csv` | export |
| `POST` | `/api/klanten/import` | import (`{"csv": "..."}`) |

## Voor je dit online zet

Twee dingen.

**Er zit geen authenticatie in.** Lokaal of in je eigen netwerk is dat prima. Publiek
bereikbaar betekent dat iedereen je volledige klantenbestand kan lezen, aanpassen en
exporteren — persoonsgegevens dus. Zet er dan minstens een login en HTTPS voor.

**Deze opzet past niet op Vercel of een andere serverless host.** De database is een
bestand op schijf, en daar heeft een serverless functie er geen van: elke aanroep
start op een verse, tijdelijke schijf. Je klanten zouden verdwijnen. Wil je dit
online: draai het op een gewone server of VPS met een blijvende schijf (of container
met volume), of wissel SQLite om voor een gehoste database zoals Postgres. Dat laatste
raakt alleen `server/db.js` en `server/store.js` — alle SQL staat op één plek, precies
daarvoor.
