# Klantenkaart

Al je klanten als stip op de kaart van België, gekleurd naar hoe lang geleden je er
langsging. Groen is recent, oranje is een tijdje geleden, rood is te lang. Klik een
stip aan en je ziet wie het is, wanneer je er laatst was, en alles wat er bij vorige
bezoeken besproken werd.

Vervangt het Excel-overzicht van Comsoltech. Gemaakt om te gebruiken terwijl je op de
baan bent: je staat bij een klant en ziet meteen wie er nog in de buurt zit.

## In het kort

- **Kaart** met een stip per klant, kleur volgt automatisch uit het laatste bezoek
- **Zoeken** op naam, contactpersoon, gemeente, postcode en notities
- **Filters** op laatste bezoek (drie knoppen), regio (provincie) en tag
- **Kleurgrenzen zelf instelbaar** — bepaal of rood na 3 maanden begint of na 6
- **Klantdossier** met bedrijfsgegevens en een tijdlijn van bezoeken: datum, met wie,
  en wat er besproken is
- **CSV-import** uit je CRM die je zo vaak mag herhalen als je wil — bezoekverslagen
  gaan nooit verloren
- **Login** voor jou en je collega's, iedereen ziet en beheert dezelfde gegevens
- **Werkt op de gsm** en kan als icoontje op je startscherm

## Lokaal starten

```bash
npm install
npm run seed     # optioneel: negen voorbeeldklanten om mee te spelen
npm start        # http://localhost:3000
```

De eerste keer dat je de app opent, maak je meteen je eigen account aan. Daarna kan
niemand zich nog zelf registreren — collega's voeg je toe via **Filter → Collega's**.

Lokaal draait alles op één bestand: `data/klantenkaart.db`. Een back-up is een kopie
van dat bestand.

```bash
npm run dev      # herstart automatisch bij wijzigingen
npm test         # 123 tests op SQLite
```

## Online zetten op Vercel — stap voor stap

Vercel draait je code, maar heeft géén plek om bestanden te bewaren: elke aanvraag
begint op een lege, tijdelijke schijf. Daarom heb je er een aparte database bij nodig.
De app werkt met allebei: SQLite als je lokaal werkt, Postgres zodra je een
`DATABASE_URL` instelt. Je moet daarvoor niets in de code veranderen.

**1. Zet de code op GitHub.** Als je dit leest vanuit de repository, staat hij er al.

**2. Maak een Vercel-account** op [vercel.com](https://vercel.com) — inloggen met je
GitHub-account is het eenvoudigst.

**3. Importeer het project.** Klik *Add New → Project*, kies deze repository en klik
*Import*. Laat alle instellingen staan zoals ze zijn en klik *Deploy*. De eerste keer
werkt de app nog niet volledig; dat is normaal, de database komt in de volgende stap.

**4. Maak een database.** Ga in je project naar het tabblad *Storage* → *Create
Database* → kies **Neon** (Postgres). Neem het gratis plan; dat is ruim voldoende voor
een paar honderd klanten. Klik *Connect* om hem aan dit project te koppelen.

Vercel zet daarbij zelf een omgevingsvariabele klaar. Hoe die heet maakt niet uit:
de app aanvaardt `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`,
`POSTGRES_PRISMA_URL` en `NEON_DATABASE_URL`. Staat er geen enkele van, dan meldt de
app dat bij het opstarten in de logs met een duidelijke waarschuwing.

**5. Deploy opnieuw.** Ga naar *Deployments*, klik rechts bij de bovenste op de drie
puntjes en kies *Redeploy*. Dit is nodig omdat de app de database pas bij het opstarten
inleest.

**6. Maak je account aan.** Open de URL die Vercel je geeft. Je krijgt het scherm
"Eerste gebruiker aanmaken". Vul je naam, e-mailadres en een wachtwoord van minstens
tien tekens in. Vanaf dat moment is de app afgeschermd.

**7. Voeg je collega's toe.** Klik op *Filter* → *Collega's*, vul naam, e-mailadres en
een wachtwoord in. Geef dat wachtwoord door en laat hen het nadien wijzigen.

**8. Zet je klanten erin.** *Filter* → *CSV importeren*. Exporteer je klanten uit het
CRM naar CSV, plak de inhoud of kies het bestand.

**9. Op het startscherm zetten.** Open de URL op je gsm. Op Android: menu → *App
installeren*. Op iPhone in Safari: deelknop → *Zet op beginscherm*. Je krijgt een
icoontje en de app opent schermvullend, zonder browserbalk.

### Later opnieuw importeren

Dat is de bedoeling: draai de import zo vaak je wil. Bestaande klanten worden herkend
en bijgewerkt, nieuwe komen erbij, en je bezoekverslagen blijven staan. Zie hieronder
hoe dat herkennen werkt.

### Een eigen domein

*Settings → Domains* in Vercel, vul je domeinnaam in en volg de instructies die er
verschijnen. Vercel regelt het beveiligingscertificaat zelf.

## De kleurgrenzen instellen

Standaard is een klant groen tot 30 dagen na het laatste bezoek, oranje tot 90 dagen,
daarna rood. Past dat niet bij jouw ritme — een voederleverancier ziet zijn klanten
nu eenmaal vaker dan een machineverkoper — dan pas je het aan via **Filter →
Kleurgrenzen**.

Je kunt kiezen uit vier voorstellen (van "strak: 2 en 6 weken" tot "ruim: 3 maanden
en 1 jaar") of zelf twee getallen invullen. Onderaan het venster staat in gewone taal
wat je keuze betekent.

Een paar dingen die belangrijk zijn:

- **De instelling staat in de database, niet in de browser.** Pas jij ze aan, dan zien
  je collega's meteen dezelfde kleuren. Er is dus één waarheid, geen ruzie over wie
  wat ziet.
- **Er gaat niets verloren.** Alleen de kleuren verschuiven; klanten, bezoeken en
  notities blijven exact zoals ze waren. Zet je het terug, dan zijn de oude kleuren
  er weer.
- **Onmogelijke waarden worden geweigerd.** "Oranje" moet verder liggen dan "groen",
  en de app zegt het als dat niet zo is in plaats van iets raars te doen.
- **Nooit bezochte klanten blijven altijd rood**, welke grens je ook kiest. Dat is
  het punt van de kleur.
- De filterknoppen boven de kaart tonen bij het aanwijzen wat de huidige grenzen zijn.

## Hoe de CSV-import je gegevens beschermt

Bij elke rij zoekt de app eerst of die klant al bestaat, in deze volgorde:

1. het **CRM-id** (kolom `CRM-id`, `Klantnummer` of `Referentie`) — het betrouwbaarst
2. het **BTW-nummer**
3. **naam + postcode**

Bestaat de klant al, dan worden alleen de bedrijfsgegevens bijgewerkt. Wat nooit
overschreven wordt:

- **bezoekverslagen** — die staan los van de import
- **je eigen notities** op de klant
- **tags**
- **een stip die je zelf op de kaart hebt gezet**

Een lege cel in de export wist niets: als het CRM geen telefoonnummer meer meestuurt,
blijft het nummer dat er stond gewoon staan. Na afloop krijg je te zien hoeveel rijen
nieuw, bijgewerkt, ongewijzigd of overgeslagen zijn.

Herkende kolomnamen: `CRM-id`, `Bedrijf`, `Contactpersoon`, `Telefoon`, `E-mail`,
`Straat`, `Postcode`, `Gemeente`, `Land`, `BTW`, `Tags`, `Notities`, en als je ze hebt
`Breedtegraad` en `Lengtegraad`. Nederlandse en Engelse namen werken allebei, net als
komma's en de puntkomma van Excel NL/BE.

## Beveiliging — wat er wel en niet in zit

**Wat beschermd is**

- **Alles zit achter een login.** Zonder aanmelding geeft elk eindpunt 401 en komt er
  geen enkel klantgegeven naar buiten. Er zijn tests die dat per eindpunt nagaan.
- **Wachtwoorden staan nooit leesbaar in de database.** Ze gaan door scrypt met een
  eigen salt per gebruiker, dus twee mensen met hetzelfde wachtwoord krijgen een
  andere hash. Vergelijken gebeurt in constante tijd.
- **Sessietokens staan gehasht in de database.** Wie de database ooit in handen zou
  krijgen, kan met die rijen niet inloggen. De cookie is `HttpOnly` (geen enkel script
  kan hem lezen), `SameSite=Lax` (beschermt tegen verzoeken vanaf andere websites) en
  `Secure` zodra je online draait.
- **Wachtwoorden raden wordt geblokkeerd.** Na acht mislukte pogingen op één account,
  of vijfentwintig vanaf één IP-adres, gaat de deur vijftien minuten dicht — ook voor
  het juiste wachtwoord. De teller staat in de database, niet in het geheugen, zodat
  hij ook op Vercel werkt waar elke aanvraag op een andere machine kan draaien.
- **Het inlogscherm verraadt niet welke adressen bestaan.** Een onbekend e-mailadres
  krijgt exact hetzelfde antwoord en dezelfde rekentijd als een fout wachtwoord.
- **SQL-injectie is uitgesloten.** Elke waarde gaat als parameter de query in; alleen
  kolomnamen uit een vaste lijst worden in de SQL zelf geplaatst.
- **XSS is afgedekt.** Alle klantgegevens gaan door een escape-functie voor ze op het
  scherm komen, en de contentbeleidsregel verbiedt inline scripts helemaal.
- **Beveiligingsheaders** staan op elke pagina: een strikte `Content-Security-Policy`
  (eigen scripts, kaarttegels alleen van OpenStreetMap), `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy` en HSTS zodra je op HTTPS draait.
- **Een wachtwoord wijzigen meldt alle bestaande sessies van die gebruiker af.**
- **De server serveert geen bestanden buiten de publieke map.**

**Wat er niet in zit — lees dit voor je klantgegevens invoert**

- **Geen rollen.** Iedereen die kan inloggen kan alles, ook klanten en bezoeken
  definitief verwijderen. Er is geen prullenbak.
- **Geen logboek.** Je ziet wie een bezoek noteerde, maar niet wie iets wijzigde of
  wiste.
- **Geen tweestapsverificatie.** Een uitgelekt wachtwoord is voldoende om binnen te
  raken.
- **Geen "wachtwoord vergeten".** Een collega die zijn wachtwoord kwijt is, krijgt een
  nieuw van iemand die wel binnen geraakt.
- **Back-ups zijn jouw verantwoordelijkheid.** Neon houdt beperkt geschiedenis bij;
  ga na wat je plan biedt en maak zelf regelmatig een export.
- **Dit zijn persoonsgegevens.** Namen, telefoonnummers en gespreksnotities van
  klanten vallen onder de GDPR. Zet erin wat zakelijk nodig is, niet meer, en geef
  alleen toegang aan wie ze nodig heeft.

Wat hier staat is niet zomaar beweerd: er draaien dertig tests die het nagaan, op
beide databases. Ze staan in `test/beveiliging.test.js` en falen zodra iemand een van
deze beschermingen wegneemt.

## Keuzes die bewust gemaakt zijn

**Bezoeken bepalen de kleur, niets anders.** Geen statusveld dat je met de hand moet
bijhouden en dus na drie weken liegt. Noteer je een bezoek, dan wordt de stip groen;
doe je niets, dan wordt hij vanzelf rood.

**De regio komt uit de postcode.** Geen extra veld om in te vullen: de Belgische
postcodereeksen bepalen de provincie. Dat werkt ook voor klanten die je uit het CRM
importeert zonder dat je iets moet doen.

**Geen coördinaten betekent geen stip, niet stiekem op 0,0.** Klanten zonder locatie
staan linksonder in beeld vermeld, en je zet ze met één klik op de kaart. Wie een adres
heeft, kan het automatisch laten opzoeken.

**De kaart werkt door zonder internet.** De achtergrond komt van OpenStreetMap. Valt
die weg, dan blijven de stippen en hun onderlinge ligging kloppen en krijg je een
melding — geen leeg scherm.

**Wachtwoorden staan niet leesbaar in de database.** Ze gaan door scrypt met een eigen
salt per gebruiker. De sessiecookie is `HttpOnly`, dus geen enkel script kan hem lezen.
Wijzig je een wachtwoord, dan worden alle bestaande sessies van die gebruiker afgemeld.

**Weinig afhankelijkheden.** Eén npm-pakket (`pg`, voor Postgres). Leaflet staat in de
repository zelf, niet op een CDN. Node 22 heeft SQLite ingebouwd. Geen buildstap.

## Structuur

```
api/index.js     ingang voor Vercel
server/
  index.js       HTTP-server, routes, toegangscontrole
  db.js          SQLite én Postgres achter één adapter
  store.js       alle queries en de import — de enige plek met SQL
  auth.js        wachtwoorden, sessies, gebruikers
  validate.js    validatie, BTW, coördinaten, kleurgroepen, provincies
  instellingen.js  de kleurgrenzen, aanpasbaar zonder deploy
  geocode.js     adres naar coördinaten, faalt zacht
  csv.js         CSV lezen en schrijven
  seed.js        voorbeeldklanten
public/          de interface: kaart, dossier, formulieren, inlogpagina, iconen
  beveiliging.js hashes, sessietokens, inlogpogingen, headers
test/            197 tests, die allemaal op beide databases draaien
```

## Testen

```bash
npm test                                              # SQLite
TEST_DATABASE_URL=postgres://... npm test             # SQLite én Postgres
```

De tweede vorm is de belangrijke: online draait de app op Postgres, en een verschil
tussen de twee databases merk je anders pas als een collega ermee werkt.

## Wat er nog niet in zit

- **Geen rollen.** Zie de beveiligingsparagraaf hierboven.
- **Geen automatische koppeling met het CRM.** De import gaat via een CSV die je zelf
  exporteert. Dat is bewust: een echte koppeling is veel meer werk en gaat stuk zodra
  het CRM verandert.
- **Adressen worden niet automatisch omgezet naar stippen bij een import.** Dat zou
  honderden opzoekingen betekenen bij een gratis dienst met een wachtrij. Je zet ze
  handmatig, of je neemt `Breedtegraad` en `Lengtegraad` mee in je export.
