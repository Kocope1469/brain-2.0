# Klantenkaart

Een klantenkaart voor KMO's: per klant één scherm met wie ze zijn, wat je met hen
besproken hebt, wat het opgeleverd heeft en wat je nog moet doen. Geen abonnement,
geen cloud, geen dertig velden die je nooit invult.

**Nul dependencies.** Node 22 heeft SQLite ingebouwd; de rest is standaardbibliotheek,
vanilla JS en CSS. Geen `npm install`, geen buildstap, geen lockfile die verrot.

## Starten

```bash
npm run seed     # optioneel: vult de database met vijf voorbeeldklanten
npm start        # http://localhost:3000
```

Verder:

```bash
npm run dev      # herstart automatisch bij wijzigingen
npm test         # 75 tests, ~0,3s
```

De database staat in `data/klantenkaart.db` en staat in `.gitignore`. Wil je hem
elders? Zet `KLANTENKAART_DB=/pad/naar/db`. Andere poort: `PORT=8080`.
Een back-up is een kopie van dat ene bestand.

## Wat het doet

**Dashboard** — klanten per status, omzet dit jaar, openstaande offertes, taken over
de datum, en het onderdeel dat er echt toe doet: *te lang stil* — actieve klanten en
prospects waarmee je 60+ dagen geen contact had. Dat is waar geld weglekt.

**Klantenlijst** — zoeken over naam, contactpersoon, e-mail, gemeente, telefoon en
BTW-nummer. Filteren op status en tag, sorteren op naam, laatste contact, omzet of
datum van aanmaak.

**De klantenkaart zelf** — vier blokken op één scherm:
- *Gegevens*: contact, adres, BTW-nummer, website, hoe de klant binnenkwam, en een
  vrij tekstveld voor de context die je nergens anders kwijt kunt.
- *Contactmomenten*: chronologische tijdlijn van telefoons, mails, bezoeken,
  offertes en klachten. In twee kliks toegevoegd, onderaan het blok.
- *Opdrachten*: offertes en werk met bedrag en status. Omzet telt enkel gewonnen,
  gefactureerde en betaalde opdrachten — een offerte is geen omzet.
- *Opvolging*: de volgende actie, met vervaldatum. Over de datum kleurt rood.

**Opvolging** — alle openstaande taken over alle klanten heen, oudste eerst. De
rode teller in het menu telt wat over de datum is.

**Import en export** — CSV in beide richtingen. De import herkent zowel Nederlandse
als Engelse kolomnamen (`Bedrijf`, `E-mail`, `BTW`, `Gemeente`, …), zowel komma's
als de puntkomma van Excel NL/BE, en rapporteert per rij wat mislukte in plaats van
er stilletjes de helft te laten vallen. De export begint met een BOM zodat Excel de
accenten niet verminkt, en kan zo weer geïmporteerd worden.

## Keuzes die bewust gemaakt zijn

**BTW-nummers worden echt gecontroleerd.** Een Belgisch nummer moet door de
modulo-97-controle: `BE0123456749` mag, `BE0123456748` niet. Formaat maakt niet uit
— `be 0123.456.749` wordt genormaliseerd. Buitenlandse nummers worden enkel op vorm
gecontroleerd, want elk land heeft zijn eigen regels.

**Bedragen zijn hele centen, geen floats.** `1.250,50`, `1250.50` en `€ 2.000`
worden alle drie correct gelezen; `€ 2.000` is tweeduizend euro, niet twee.
Nooit een afrondingsfout in je omzetcijfer.

**Validatie zit op de server, niet in het formulier.** De API is de waarheid; de
interface is maar één manier om hem te gebruiken. Wat je via `curl` niet stuk krijgt,
krijgt een gebruiker ook niet stuk.

**Verwijderen verwijdert echt.** Foreign keys staan aan met `ON DELETE CASCADE`: een
klant weg betekent zijn contactmomenten, opdrachten en taken weg. Geen weesrecords.
Wil je een klant bewaren maar uit de lijst hebben: zet hem op `archived`.

## Structuur

```
server/
  index.js     HTTP-server, routes, statische bestanden
  db.js        SQLite-schema en verbinding
  store.js     alle queries — de enige plek waar SQL staat
  validate.js  validatie en normalisatie (BTW, bedragen, datums)
  csv.js       CSV lezen en schrijven
  seed.js      voorbeelddata
public/
  index.html   de schil
  css/app.css  volledige stijl, licht en donker
  js/          api.js, util.js, forms.js, views/
test/          75 tests: validatie, store, csv, en de API end-to-end
```

## API

Alles onder `/api`. JSON in, JSON uit. Fouten komen terug als
`{"errors": ["Bedrijfsnaam is verplicht."]}` met status 422.

| Methode | Pad | Wat |
| --- | --- | --- |
| `GET` | `/api/klanten?q=&status=&tag=&sort=` | lijst met omzet, laatste contact en open taken |
| `POST` | `/api/klanten` | nieuwe klant |
| `GET` | `/api/klanten/:id` | volledige kaart met tijdlijn, opdrachten en taken |
| `PATCH` | `/api/klanten/:id` | gedeeltelijk bijwerken |
| `DELETE` | `/api/klanten/:id` | klant en alles eronder |
| `POST` | `/api/klanten/:id/contact` | contactmoment |
| `POST` | `/api/klanten/:id/opdrachten` | opdracht of offerte |
| `POST` | `/api/klanten/:id/taken` | taak |
| `PATCH` | `/api/taken/:id` | afvinken (`{"done": true}`) |
| `DELETE` | `/api/{contact,opdrachten,taken}/:id` | onderdeel verwijderen |
| `GET` | `/api/taken` | alle open taken over alle klanten |
| `GET` | `/api/stats` | dashboardcijfers |
| `GET` | `/api/meta` | statussen, contactsoorten, bestaande tags |
| `GET` | `/api/klanten/export.csv` | export |
| `POST` | `/api/klanten/import` | import (`{"csv": "..."}`) |

## Voor je dit op internet zet

Er zit **geen authenticatie** in. Op je eigen machine of in je eigen netwerk is dat
prima. Zodra dit publiek bereikbaar is, kan iedereen je volledige klantenbestand
lezen, aanpassen en exporteren — en dat is persoonsgegevens. Zet er dan minstens
een login en HTTPS voor. Dat is bewust niet meegeleverd: half werkende
authenticatie is gevaarlijker dan duidelijk géén.
