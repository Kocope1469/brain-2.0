---
titel: CSV-import
type: notitie
tags:
  - project/klantenkaart
---

# CSV-import

Onderdeel van [[Klantenkaart]]. Exporteer je klanten uit het CRM naar CSV en plak de
inhoud in *Filter → CSV importeren*.

> [!success] Je mag dit zo vaak herhalen als je wil
> Bestaande klanten worden herkend en bijgewerkt, niet opnieuw aangemaakt. Je
> bezoekverslagen blijven staan. Dat is de hele reden dat deze import zo gebouwd is.

## Hoe een bestaande klant herkend wordt

In deze volgorde, van betrouwbaar naar minst betrouwbaar:

1. **CRM-id** (kolom `CRM-id`, `Klantnummer`, `Referentie`)
2. **BTW-nummer**
3. **Naam + postcode**

Vind hij niets, dan wordt het een nieuwe klant.

## Wat nooit overschreven wordt

- Bezoekverslagen
- Je eigen notities op de klant
- Tags
- Een stip die je zelf op de kaart hebt gezet

Een **lege cel wist niets**: stuurt het CRM geen telefoonnummer meer mee, dan blijft
het nummer dat er stond gewoon staan.

## Herkende kolomnamen

`CRM-id` · `Bedrijf` · `Contactpersoon` · `Telefoon` · `E-mail` · `Straat` ·
`Postcode` · `Gemeente` · `Land` · `BTW` · `Tags` · `Notities` · `Breedtegraad` ·
`Lengtegraad`

Nederlandse en Engelse namen werken allebei. Komma's en de puntkomma van Excel NL/BE
worden allebei herkend.

## Na afloop

Je krijgt te zien hoeveel rijen **nieuw**, **bijgewerkt**, **ongewijzigd** of
**overgeslagen** zijn. Overgeslagen rijen staan met reden in de browserconsole.

> [!note] Adressen worden niet automatisch omgezet naar stippen
> Dat zou honderden opzoekingen betekenen bij een gratis dienst met een wachtrij.
> Neem `Breedtegraad` en `Lengtegraad` mee in je export, of plaats de stippen zelf.
