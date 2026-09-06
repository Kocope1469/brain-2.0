---
titel: Logboek
type: notitie
tags:
  - project/klantenkaart
---

# Logboek

Onderdeel van [[Klantenkaart]].

## 6 september 2026 — alles gebouwd op één dag

Zes commits, in deze volgorde:

| Commit | Wat |
|---|---|
| `7a12d11` | CRM-pakket — **verkeerd** |
| `61b6d21` | Weergavekaart als kaartje — **ook verkeerd** |
| `68ab065` | Landkaart met gekleurde stippen — eindelijk juist |
| `27b2074` | Login, herhaalbare import, klaar voor Vercel |
| `35e5b8f` | Beveiliging: brute-force, headers, tokens gehasht |
| `ea0c98a` | Kleurgrenzen instelbaar |

## De les uit deze dag

Het project startte met twee woorden: *"Project klantenkaart"* en een lege repo. Twee
verduidelijkingsvragen werden weggeklikt. Resultaat: een volledig CRM-pakket dat
niemand gevraagd had.

Daarna *"ik wil een weergave kaart, geen crm pakket"* — waarop een **kaartje** volgde,
want "kaart" betekent in het Nederlands twee dingen. Weer fout.

Pas de **screenshot van de schets** maakte het in tien seconden duidelijk: een
landkaart met gekleurde stippen.

> [!important] De gewoonte om te veranderen
> Drie van de vier bouwrondes waren weggegooid werk. De volledige opdracht — die
> uiteindelijk in twintig regels paste — was er de hele tijd al. Niet duidelijker
> praten is de les, maar **het volledige beeld meteen op tafel leggen** in plaats van
> het stuk voor stuk te laten uitvragen. Twintig seconden context vooraf bespaart een
> dag werk.

## Bugs die tijdens het bouwen gevonden zijn

Deze zijn opgelost, maar het patroon is leerzaam:

- **De CSV-lezer kende de kolom `CRM-id` niet.** Matchen op het betrouwbaarste veld
  werkte dus nooit. Zonder test was dit pas opgevallen bij een verdubbeld
  klantenbestand.
- **Na het wissen van de zoekterm bleef de kaart ingezoomd** op de vorige treffer,
  waardoor andere klanten permanent buiten beeld stonden.
- **`display: flex` overschreef het `hidden`-attribuut**, waardoor de filterlade en
  de plaatsbalk altijd openstonden. Alleen zichtbaar op een screenshot; de
  functionele tests liepen er vrolijk doorheen.
- **Weestags** bleven achter na het verwijderen van een klant.
- **Onbeperkt wachtwoorden raden** was mogelijk tot 6 september.

> [!tip] Twee dingen om te onthouden bij problemen
> 1. Draait de database en is `DATABASE_URL` gezet? Negen van de tien problemen zitten daar.
> 2. Een falende test betekent niet altijd dat de code stuk is. Twee keer bleek de
>    *test* fout te zitten, niet de app.
