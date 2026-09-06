---
titel: Beslissingen
type: notitie
tags:
  - project/klantenkaart
  - architectuur
---

# Beslissingen

Onderdeel van [[Klantenkaart]]. Waarom het is zoals het is — zodat niemand over zes
maanden iets "verbetert" dat expres zo gebouwd is.

## Bezoeken bepalen de kleur, niets anders

Geen handmatig statusveld. Zo'n veld vul je één keer in en werk je daarna nooit meer
bij; na drie weken liegt het. Noteer je een bezoek, dan wordt de stip groen. Doe je
niets, dan wordt hij vanzelf rood. Dat is het hele mechanisme, en het is de reden dat
dit werkt en een CRM niet.

## Geen coördinaten betekent geen stip, niet stiekem op 0,0

Een klant zonder plaats hoort niet in de Golf van Guinee te verschijnen. Hij staat in
de lijst "niet op de kaart" tot iemand hem plaatst.

## De regio komt uit de postcode

Geen extra veld om in te vullen. De Belgische postcodereeksen bepalen de provincie,
dus het werkt automatisch voor geïmporteerde klanten.

## De import overschrijft nooit wat mensen zelf invoerden

Zie [[CSV-import]]. Bedrijfsgegevens uit het CRM mogen bijgewerkt worden;
bezoekverslagen, notities, tags en handgeplaatste stippen niet.

## De kaart werkt door zonder internet

Vallen de kaarttegels weg, dan blijven de stippen en hun onderlinge ligging kloppen.
Je krijgt een melding, geen leeg scherm.

## De adresopzoeking mag falen

Nominatim is gratis, met een gebruiksbeleid en een wachtrij van één verzoek per
seconde. Antwoordt hij niet, dan zet je de stip zelf met één klik. Nooit een blokkade.

## Twee databases achter één adapter

SQLite lokaal (geen installatie nodig), Postgres online (want Vercel bewaart geen
bestanden). Alle queries staan één keer geschreven. Tijdstempels komen uit JavaScript
en zoeken gebeurt met `LOWER()`, zodat beide dialecten zich gelijk gedragen. **Alle
tests draaien tegen allebei** — een dialectverschil merk je anders pas als een
collega ermee werkt.

## Weinig afhankelijkheden

Eén npm-pakket (`pg`). Leaflet staat in de repository zelf, niet op een CDN. Node 22
heeft SQLite ingebouwd. Geen buildstap, geen lockfile die over acht maanden verrot.

## Geen automatische koppeling met het CRM

Een echte koppeling is vijf keer het werk en gaat stuk zodra het CRM iets verandert.
Een CSV die je maandelijks in twintig seconden importeert geeft hetzelfde resultaat
zonder dat onderhoud.
