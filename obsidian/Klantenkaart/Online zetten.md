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
5. **Controleer de variabele** onder *Settings → Environment Variables*. Er moet
   `DATABASE_URL` staan.
6. **Deploy opnieuw**: *Deployments* → drie puntjes bij de bovenste → *Redeploy*.
7. **Maak je account aan**: open de URL, je krijgt "Eerste gebruiker aanmaken".
   Naam, e-mail, wachtwoord van minstens tien tekens.
8. **Voeg collega's toe**: *Filter → Collega's*.
9. **Zet je klanten erin**: *Filter → CSV importeren*. Zie [[CSV-import]].

## De twee valkuilen

> [!danger] Valkuil 1 — de verkeerde variabelenaam
> Vercel maakt bij Neon soms alleen `POSTGRES_URL` aan. Staat er geen `DATABASE_URL`,
> dan valt de app terug op een tijdelijke database en **verdwijnt je data bij elke
> klik**. Maak die variabele desnoods zelf bij met dezelfde waarde.

> [!danger] Valkuil 2 — vergeten opnieuw te deployen
> De app leest de database bij het opstarten. Koppel je de database zonder daarna
> te redeployen, dan blijft de oude versie zonder database draaien.

## Als er iets misgaat

Eerste vraag is altijd: **draait de database en is `DATABASE_URL` gezet?** Negen van
de tien problemen zitten daar. Pas daarna naar de code kijken.

## Eigen domein

*Settings → Domains* in Vercel, domeinnaam invullen, instructies volgen. Het
beveiligingscertificaat regelt Vercel zelf.

## Op de gsm zetten

Open de URL op je telefoon.
- **Android**: menu → *App installeren*
- **iPhone (Safari)**: deelknop → *Zet op beginscherm*
