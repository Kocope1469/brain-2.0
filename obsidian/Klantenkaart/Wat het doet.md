---
titel: Wat het doet
type: notitie
tags:
  - project/klantenkaart
---

# Wat het doet

Onderdeel van [[Klantenkaart]].

![[kaart-en-dossier.png]]

## De kaart

Eén stip per klant op de kaart van België. De kleur volgt **automatisch** uit de
datum van het laatste bezoek — er is geen statusveld dat iemand moet bijhouden.

| Kleur | Betekenis | Standaard |
|---|---|---|
| 🔵 Blauw | Nog nooit bezocht | geen enkel bezoek genoteerd |
| 🟢 Groen | Recent bezocht | tot 30 dagen |
| 🟠 Oranje | Een tijdje geleden | 31 tot 90 dagen |
| 🔴 Rood | Lang niet bezocht | meer dan 90 dagen geleden |

Blauw en rood zijn bewust uit elkaar gehouden: een klant die vorige week uit het CRM
kwam is iets anders dan een klant waar je in twee jaar niet geweest bent. Eén bezoek
noteren haalt een klant uit de blauwe groep; het laatste bezoek wissen zet hem terug.

Die grenzen zijn instelbaar, zie [[Kleurgrenzen]].

Klanten zonder coördinaten krijgen géén stip — en dat wordt niet verzwegen:
linksonder staat hoeveel er ontbreken.

> [!tip] Automatisch plaatsen
> De knop **Automatisch plaatsen** zet in één keer alle klanten zonder stip op het
> midden van hun gemeente. Dat gebeurt met een ingebouwde lijst van 1720 Belgische
> plaatsnamen: geen externe dienst, geen wachtrij, 150 klanten in een tiende van
> een seconde. Van een echte klantenlijst van 153 werden er 142 herkend.
>
> Zo'n stip staat **bij benadering**, en het dossier zegt dat er ook bij. Klopt hij
> niet, versleep hem dan met *Stip verplaatsen* — wat je zelf zet wordt nooit meer
> overschreven.

Klanten in dezelfde gemeente krijgen elk een eigen plek binnen een paar honderd
meter, zodat hun stippen niet samenvallen. De stippen worden kleiner als je
uitzoomt, zodat ze op een overzicht van heel België aanklikbaar blijven.

## Kaart of lijst

Rechtsboven wissel je tussen **Kaart** en **Lijst**. Het zijn dezelfde klanten met
dezelfde filters, alleen anders getoond. In de lijst klik je op een kolomkop om te
sorteren — handig om te zien wie je het langst niet gezien hebt, of om een provincie
in één oogopslag te overlopen. Een rij aanklikken opent hetzelfde dossier als een
stip op de kaart.

## Het paneel rechts

Zolang je geen klant gekozen hebt, staat rechts van de kaart de telling per kleur en
daaronder **de klanten zelf**, op naam gesorteerd, met hun gemeente en hoe lang je er
niet geweest bent. Die lijst volgt exact de zoekterm en de filters: wat je op de kaart
ziet, staat ernaast. Handig voor wie achter een andere stip verscholen zit of buiten
beeld valt. Een naam aanklikken vliegt naar zijn stip en opent het dossier; sluit je
het dossier, dan staat de lijst er weer.

Op een gsm staat dat paneel ónder de kaart en blijft er te weinig hoogte over voor een
bruikbare lijst — daar tonen we alleen de tellingen. De knop **Lijst** bovenaan geeft
op een gsm hetzelfde overzicht over het volle scherm.

## De achtergrondkaart

Onder *Filter* staat een keuze voor de achtergrondkaart:

| Keuze | Waarvoor |
|---|---|
| **Rustig** | dezelfde kaart, maar bleker — de stippen vallen op (standaard) |
| **Standaard** | de volledige OpenStreetMap, met elk gehucht en elke landweg |
| **Grijs** | grijstinten, het dichtst bij Google Maps |
| **Straten** | wegenkaart met meer straatnamen |

De keuze wordt per browser onthouden, dus jij en je collega's kunnen elk iets anders
kiezen. Alle vier zijn ze nagekeken en werkend bevonden (september 2026).

**Waarom Rustig de standaard is.** *Rustig* en *Standaard* halen hun kaartbeeld bij
OpenStreetMap; dat is de bron die de app altijd al gebruikt. *Rustig* is geen andere
kaart maar dezelfde, in je browser bleker gemaakt — daar kan dus niets aan wegvallen.
*Grijs* en *Straten* komen van Esri, een externe dienst. Die werken, maar het is niet
onze dienst: zie je daar ooit een watermerk of een lege kaart verschijnen, schakel dan
terug naar *Rustig*. Een eerdere poging met een derde aanbieder (CARTO) is precies
daarop stukgelopen — die begon plots een API-sleutel te eisen, met een watermerk over
de hele kaart als gevolg.

## Zoeken en filteren

Eén zoekveld doorzoekt naam, contactpersoon, gemeente, postcode, straat én notities.
Daarnaast:

- **Drie kleurknoppen** bovenaan, met een teller per groep
- **Regio** (provincie) — afgeleid uit de postcode, hoef je niet in te vullen
- **Tag** — vrije labels die je zelf kiest

De kaart kadert zich telkens opnieuw in op wat er overblijft.

## Het klantdossier

Klik een stip aan en rechts (op gsm: eronder) opent het dossier:

- Bedrijfsnaam, initialen in een gekleurde bol, **laatste bezoek in woorden**
  ("3 weken geleden")
- Adres, BTW-nummer, tags
- Vrije notities over de klant
- **Contactpersonen**: zoveel als je wil per bedrijf, met functie, telefoon, e-mail
  en een notitie
- **De bezoektijdlijn**: per bezoek de datum, welke collega er geweest is, met wie je
  sprak, en waarover het ging

### Meerdere contactpersonen

Een bedrijf is zelden één persoon: de zaakvoerder, de technieker, iemand van de
boekhouding. Klik op **+ Toevoegen** bij *Contactpersonen*. Alleen de naam is
verplicht — vaak weet je in het begin niet meer dan dat. Elke contactpersoon heeft een
potloodje om hem bij te werken.

De eerste in de lijst draagt het label **uit CRM**. Dat is de contactpersoon die uit
je CRM-export komt (naam, telefoon, e-mail op de klant zelf). Ook die heeft een
potloodje, dus je kan hem gewoon aanvullen — handig bij klanten waar het CRM enkel een
e-mailadres meegaf en de naam leeg staat. Staat er nog helemaal niets, dan zie je
*Nog niet ingevuld* met hetzelfde potloodje.

Hou wel in gedachten dat die drie velden bij **elke import ververst** worden. Levert
je CRM daar later iets anders aan, dan is je wijziging weg. Het venster zegt dat er
ook bij. Iemand die je CRM niet kent, zet je dus beter als aparte contactpersoon —
wat je zelf toevoegt, raakt de import nooit aan.

Zoeken werkt ook op contactpersonen, op naam én functie. Typ "janssens" of
"technieker" en je vindt het bedrijf terug, ook als je de bedrijfsnaam kwijt bent.

Bij *Bezoek noteren* stelt het veld **Met wie gesproken** de namen voor die de app al
van die klant kent. Het blijft een gewoon tekstveld: je spreekt wel vaker iemand die
nog nergens genoteerd staat, en dan hoef je niet eerst een fiche aan te maken.

Een bezoek noteren is vier velden: datum, **bezocht door**, met wie gesproken,
waarover.

*Bezocht door* is een keuzelijst met de collega's die een account hebben. Standaard
sta jij er, maar je kan een collega kiezen: wie het bezoek intikt is niet altijd wie
er geweest is — je werkt de week van een collega bij, of je noteert het achteraf voor
iemand anders.

*Met wie gesproken* is een ander veld: dat is de persoon **bij de klant**. Twee
verschillende mensen dus — de ene werkt bij Comsoltech, de andere bij de klant.

Elk genoteerd bezoek heeft een **potloodje** om het achteraf recht te zetten: datum,
collega, gesprekspartner of verslag. Een typfout hoort je niet te dwingen het bezoek
te wissen en opnieuw in te tikken, want dan raak je de rest van het verslag kwijt.
Een bezoek in de toekomst wordt geweigerd en dan verandert er niets.

Verdwijnt een collega later uit de app, dan blijft zijn naam in de bezoeken staan.
Wat er gebeurd is, is gebeurd.

![[klantdossier.png]]

## Op de gsm

![[op-de-gsm.png]]

## Verder

- **CSV in en uit** — zie [[CSV-import]]
- **Collega's** toevoegen, wachtwoord resetten, toegang intrekken
- **Op het startscherm** van je gsm te zetten, opent schermvullend zonder browserbalk
- **Donker en licht thema**, volgt je toestel
