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

## De achtergrondkaart

Onder *Filter* staat een keuze voor de achtergrondkaart:

| Keuze | Waarvoor |
|---|---|
| **Rustig** | dezelfde kaart, maar bleker — de stippen vallen op (standaard) |
| **Standaard** | de volledige OpenStreetMap, met elk gehucht en elke landweg |
| **Grijs (uitproberen)** | grijstinten, het dichtst bij Google Maps |
| **Straten (uitproberen)** | wegenkaart met meer straatnamen |

De keuze wordt per browser onthouden, dus jij en je collega's kunnen elk iets anders
kiezen.

**Waarom "uitproberen"?** *Rustig* en *Standaard* halen hun kaartbeeld bij
OpenStreetMap; dat is de kaart die de app altijd al gebruikt en die blijft werken.
*Rustig* is geen andere kaart maar dezelfde, in je browser bleker gemaakt — daar kan
dus niets aan wegvallen. *Grijs* en *Straten* komen van Esri, een externe dienst.
Die zijn niet vanuit de ontwikkelomgeving te testen: werken ze bij jou, hou ze; zie
je een watermerk of een lege kaart, gebruik dan *Rustig*. Een eerdere poging met een
andere aanbieder (CARTO) is precies daarop stukgelopen — die begon plots een
API-sleutel te eisen.

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
- Contactpersoon, telefoon, e-mail, adres, BTW-nummer, tags
- Vrije notities over de klant
- **De bezoektijdlijn**: per bezoek de datum, met wie je sprak, en waarover het ging

Een bezoek noteren is drie velden: datum, met wie, waarover. Er wordt automatisch
bijgehouden wie het schreef.

![[klantdossier.png]]

## Op de gsm

![[op-de-gsm.png]]

## Verder

- **CSV in en uit** — zie [[CSV-import]]
- **Collega's** toevoegen, wachtwoord resetten, toegang intrekken
- **Op het startscherm** van je gsm te zetten, opent schermvullend zonder browserbalk
- **Donker en licht thema**, volgt je toestel
