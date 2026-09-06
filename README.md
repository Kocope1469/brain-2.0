# Klantenkaart

Eén kaart per klant. Je zoekt iemand op, klikt de kaart open, en ziet in één
oogopslag alles wat je over hen weet — contactgegevens, adres, BTW-nummer en je
eigen notities. Meer niet.

Dit is **geen CRM**. Er zitten geen pipelines, taken, omzetrapporten of
opvolgingsprocessen in, en die komen er ook niet in. Een kaartenbak die je
openslaat, niet een systeem dat je moet onderhouden.

**Nul dependencies.** Node 22 heeft SQLite ingebouwd; de rest is
standaardbibliotheek, vanilla JS en CSS. Geen `npm install`, geen buildstap.

## Starten

```bash
npm run seed     # optioneel: vijf ingevulde voorbeeldkaarten
npm start        # http://localhost:3000
```

Verder:

```bash
npm run dev      # herstart automatisch bij wijzigingen
npm test         # 50 tests, ~0,3s
```

De database is één bestand: `data/klantenkaart.db` (staat in `.gitignore`).
Een back-up is een kopie van dat bestand. Elders bewaren: `KLANTENKAART_DB=/pad/db`.
Andere poort: `PORT=8080`.

## Twee schermen, meer is het niet

**De kaartenbak** — alle klanten als kaartje naast elkaar. Eén zoekveld dat door
*alles* zoekt wat op de kaarten staat, notities inbegrepen. Dat is het punt: je
weet nog dat iemand "iets met scholen" deed maar niet meer hoe hij heette, en dan
vind je hem terug. Filteren op tag, sorteren op naam, gemeente of laatst gewijzigd.

**De kaart** — één klant op één blad: naam, contactpersoon en functie, telefoon,
e-mail, website, adres, BTW-nummer, hoe ze binnenkwamen, tags, en een vrij
notitieveld voor alles wat je nergens anders kwijt kunt. Wie beslist er echt,
wanneer bel je hem best, wat is de voorgeschiedenis.

Knop **Afdrukken** geeft de kaart alleen — zonder menu, knoppen of achtergrond.

Daarnaast: CSV eruit, CSV erin. De import herkent Nederlandse en Engelse
kolomnamen, komma's zowel als de puntkomma van Excel NL/BE, en zegt per rij wat er
mislukte in plaats van stilletjes de helft te laten vallen.

## Keuzes die bewust gemaakt zijn

**Notities zijn één vrij tekstveld, geen tijdlijn.** Een tijdlijn met contactsoorten
en datums is CRM-gedrag: je moet hem bijhouden, anders is hij misleidend. Een
notitieveld dat je bijwerkt wanneer je er zin in hebt, blijft altijd waar.

**Zoeken gaat ook door de notities.** Anders is het notitieveld een gat waar
informatie in verdwijnt.

**BTW-nummers worden echt gecontroleerd.** Een Belgisch nummer moet door de
modulo-97-controle: `BE0123456749` mag, `BE0123456748` niet. Formaat maakt niet uit —
`be 0123.456.749` wordt genormaliseerd. Buitenlandse nummers alleen op vorm, want
elk land heeft zijn eigen regels.

**Validatie zit op de server.** De API is de waarheid; de interface is maar één
manier om hem te gebruiken.

**Geen status, geen archief, geen "klanttype".** Dat zijn velden die je één keer
invult en daarna nooit meer bijwerkt, en dan lieg je tegen jezelf. Wil je klanten
groeperen: gebruik tags.

## Structuur

```
server/
  index.js     HTTP-server, routes, statische bestanden
  db.js        SQLite-schema en verbinding
  store.js     alle queries — de enige plek waar SQL staat
  validate.js  validatie en normalisatie (BTW, e-mail, tags)
  csv.js       CSV lezen en schrijven
  seed.js      voorbeeldkaarten
public/
  index.html   de schil
  css/app.css  volledige stijl, licht, donker en afdruk
  js/          api.js, util.js, forms.js, views/kaartenbak.js, views/kaart.js
test/          50 tests: validatie, kaarten, en de API end-to-end
```

## API

Alles onder `/api`. JSON in, JSON uit. Fouten komen terug als
`{"errors": ["Naam is verplicht — zonder naam is het geen kaart."]}` met status 422.

| Methode | Pad | Wat |
| --- | --- | --- |
| `GET` | `/api/klanten?q=&tag=&sort=` | alle kaarten, gefilterd |
| `POST` | `/api/klanten` | nieuwe kaart |
| `GET` | `/api/klanten/:id` | één kaart |
| `PATCH` | `/api/klanten/:id` | gedeeltelijk bijwerken |
| `DELETE` | `/api/klanten/:id` | kaart verwijderen |
| `GET` | `/api/tags` | bestaande tags met aantallen |
| `GET` | `/api/klanten/export.csv` | export |
| `POST` | `/api/klanten/import` | import (`{"csv": "..."}`) |

## Voor je dit op internet zet

Er zit **geen authenticatie** in. Op je eigen machine of in je eigen netwerk is dat
prima. Zodra dit publiek bereikbaar is, kan iedereen je volledige klantenbestand
lezen, aanpassen en exporteren — en dat zijn persoonsgegevens. Zet er dan minstens
een login en HTTPS voor. Dat is bewust niet meegeleverd: half werkende
authenticatie is gevaarlijker dan duidelijk géén.
