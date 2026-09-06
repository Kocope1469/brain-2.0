---
titel: Beveiliging
type: notitie
tags:
  - project/klantenkaart
  - beveiliging
---

# Beveiliging

Onderdeel van [[Klantenkaart]]. Nagekeken op 2026-09-06; er zaten toen twee echte
gaten in die meteen gedicht zijn.

## Wat beschermd is

- **Alles zit achter een login.** Zonder aanmelding geeft elk eindpunt 401 en komt
  er geen enkel klantgegeven naar buiten.
- **Wachtwoorden** gaan door scrypt met een eigen salt per gebruiker. Twee mensen
  met hetzelfde wachtwoord krijgen een andere hash. Vergelijken in constante tijd.
- **Sessietokens staan gehasht in de database.** Wie de database in handen krijgt,
  kan er niet mee inloggen. De cookie is `HttpOnly`, `SameSite=Lax` en `Secure`.
- **Wachtwoorden raden wordt geblokkeerd**: na 8 mislukte pogingen op één account of
  25 vanaf één IP gaat de deur 15 minuten dicht, ook voor het juiste wachtwoord. De
  teller staat in de database zodat het ook op Vercel werkt.
- **Het inlogscherm verraadt niet welke adressen bestaan** — zelfde antwoord én
  zelfde rekentijd voor een onbekend adres als voor een fout wachtwoord.
- **SQL-injectie uitgesloten**: elke waarde gaat als parameter de query in.
- **XSS afgedekt**: alle klantdata wordt geëscaped, inline scripts zijn verboden via
  de contentbeleidsregel.
- **Beveiligingsheaders** op elke pagina: CSP, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, HSTS op HTTPS.
- **Een wachtwoord wijzigen** meldt alle bestaande sessies van die gebruiker af.

30 tests bewaken dit, op beide databases. Ze staan in `test/beveiliging.test.js` en
falen zodra iemand een van deze beschermingen wegneemt.

## Wat er niet in zit

> [!warning] Lees dit voor je klantgegevens invoert
> - **Geen rollen en geen prullenbak.** Iedereen die kan inloggen kan alles, ook een
>   klant met tien jaar geschiedenis definitief wissen.
> - **Geen logboek.** Je ziet wie een bezoek noteerde, niet wie iets wijzigde of wiste.
> - **Geen tweestapsverificatie.** Eén uitgelekt wachtwoord volstaat.
> - **Geen "wachtwoord vergeten".** Een collega krijgt een nieuw van iemand die wel
>   binnen geraakt.
> - **Back-ups zijn jouw verantwoordelijkheid.** Exporteer maandelijks je CSV en
>   bewaar die elders. Twee minuten werk, je enige echte vangnet.
> - **Dit zijn persoonsgegevens.** Namen, telefoonnummers en gespreksnotities vallen
>   onder de GDPR. Zet erin wat zakelijk nodig is, niet meer.

## Eerlijk eindoordeel

Degelijk beveiligd voor een intern werkinstrument van een klein team. Geen
bankomgeving, en dat hoeft ook niet. Maar "er zit een login op" is niet hetzelfde
als veilig — de gaten die op 6 september gedicht zijn, zaten er de dag ervoor nog in.
