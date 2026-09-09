---
titel: Online zetten (Vercel)
type: handleiding
status: nog te doen
tags:
  - project/klantenkaart
  - todo
---

# Online zetten

Onderdeel van [[Klantenkaart]]. **Dit is de eerstvolgende stap.** Reken op een halfuur.

> [!warning] Vercel alleen is niet genoeg
> Vercel draait je code maar bewaart geen bestanden: elke aanvraag begint op een
> lege, tijdelijke schijf. Je hebt er een aparte database bij nodig. De app werkt
> met allebei — SQLite lokaal, Postgres online — zonder dat er iets in de code moet
> veranderen.

![[aanmelden.png]]

## De negen stappen

1. **Code staat op GitHub** — al gebeurd, branch `claude/klantenkaart-project-rg4ksp`
   is meteen de standaardbranch, dus er valt niets te mergen.
2. **Maak een Vercel-account** op vercel.com. Inloggen met GitHub is het eenvoudigst.
3. **Importeer het project**: *Add New → Project* → kies de repository → *Import* →
   alles laten staan → *Deploy*. De app werkt nog niet volledig; dat is normaal.
4. **Maak een database**: tabblad *Storage* → *Create Database* → **Neon** (Postgres)
   → gratis plan → *Connect*.
5. **Vraagt de koppeling om een *Custom Prefix*?** Vul `DATABASE` in, dan heet de
   variabele `DATABASE_URL`. Nodig is het niet: de app zoekt zelf een Postgres-adres
   in de omgeving, onder welke naam ook.
6. **Deploy opnieuw**: *Deployments* → drie puntjes bij de bovenste → *Redeploy*.
7. **Maak je account aan**: open de URL, je krijgt "Eerste gebruiker aanmaken".
   Naam, e-mail, wachtwoord van minstens tien tekens.
8. **Voeg collega's toe**: *Filter → Collega's*.
9. **Zet je klanten erin**: *Filter → CSV importeren*. Zie [[CSV-import]].

## De twee valkuilen

> [!danger] Valkuil 1 — helemaal geen database gekoppeld
> Vroeger sloeg de app hierop stuk als de variabele anders heette; sinds 9 september
> herkent hij alle namen die Vercel en Neon gebruiken. Wat overblijft: koppel je
> helemaal geen database, dan schrijft hij naar een tijdelijke schijf en **verdwijnt
> je data bij elke aanvraag**. De app zet dan bij het opstarten een luide
> waarschuwing in de logs — kijk daar als iets niet blijft staan.

> [!danger] Valkuil 2 — vergeten opnieuw te deployen
> De app leest de database bij het opstarten. Koppel je de database zonder daarna
> te redeployen, dan blijft de oude versie zonder database draaien.

> [!example] "Kon de klanten niet laden" na de eerste deploy
> Dat is normaal en verwacht: de app staat er, maar er is nog geen database. De
> melding zegt zelf wat je moet doen. Ga verder met stap 4.

## Als er iets misgaat

Kijk eerst in de Vercel-logs naar de regel `[klantenkaart] opslag: …` bij het
opstarten. Die zegt letterlijk waar je gegevens heen gaan. Staat daar een
waarschuwing, dan is er geen database gekoppeld — dat is negen van de tien keer het
probleem. Pas daarna naar de code kijken.

## Eigen domein

*Settings → Domains* in Vercel, domeinnaam invullen, instructies volgen. Het
beveiligingscertificaat regelt Vercel zelf.

## Op de gsm zetten

Open de URL op je telefoon.
- **Android**: menu → *App installeren*
- **iPhone (Safari)**: deelknop → *Zet op beginscherm*
