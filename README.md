# Tveter Fraktbrev

En installérbar nettapp for å opprette PDF-fraktbrev for korntransport.

## Funksjoner

- Samler avsender, mottaker, fraktfører, gods, kolli, vekt og sendingsdetaljer.
- Krever uttrykkelig erklæring om plantevernstatus og økologisk status.
- Merker økologisk vare med `NO-ØKO-01` og sertifikatnummer.
- Lager PDF med dokumentnummer og avsendererklæring.
- Sender PDF til avsender, mottaker, fraktfører og interne kopimottakere.
- Har lokalt arkiv og fungerer som installérbar PWA.
- Har lokal innlogging med administrator- og brukerroller.
- Registrerer hvilken innlogget bruker som opprettet fraktbrevet.

## Innlogging og brukere

Ved første oppstart oppretter du en administrator. Administratoren kan deretter
opprette, redigere og deaktivere brukere under **Innstillinger → Brukere**.
Passord lagres som PBKDF2-hash med individuelt salt, ikke i klartekst.

Denne utgaven er fortsatt en statisk GitHub Pages-app. Brukere, kontakter og
fraktbrev lagres lokalt i nettleseren og deles ikke automatisk mellom enheter.
Innloggingen beskytter mot vanlig tilgang på en delt enhet, men er ikke en
erstatning for serverbasert autentisering og tilgangskontroll. For reell
flerbrukerdrift på tvers av enheter må appen kobles til en autentisert database
eller identitetstjeneste.

PDF-en har felt for avsenders og fraktførers signatur/stempel. Appen leverer
ikke i seg selv en pålitelig elektronisk signatur etter vegfraktloven § 8 a.

## Lokal start

Kjør `start-app.cmd`, og åpne adressen som vises.

## GitHub Pages

Legg filene i et GitHub-repository med hovedgren `main`. Arbeidsflyten i
`.github/workflows/deploy-pages.yml` publiserer nettstedet automatisk. Velg
**GitHub Actions** som kilde under **Settings → Pages**.

## E-post

1. Opprett et Google Apps Script-prosjekt.
2. Lim inn innholdet fra `apps-script/Code.gs`.
3. Velg **Deploy → New deployment → Web app**.
4. Kjør som deg selv og velg et passende tilgangsnivå.
5. Lim inn nettadressen til webappen under **Innstillinger** i Tveter Fraktbrev.
6. Send et testfraktbrev og kontroller både PDF og mottakere.

E-post sendes via Google-kontoen som eier Apps Script-prosjektet. Vurder
tilgangsstyring, personvern, lagringstid og leverandørens sendebegrensninger før
produksjonsbruk. En offentlig tilgjengelig webapp bør erstattes med en
autentisert serverintegrasjon dersom løsningen skal brukes bredt.

## Viktig om økologimerking

`NO-ØKO-01` er kontrollorgankoden for Debio. Koden skal bare brukes når
virksomheten og varen omfattes av gyldig økologisk sertifisering. Appen er en
dokumentasjonsmal og erstatter ikke kontroll av regelverk eller sertifikat.

## Regelverkskilder

- [Vegfraktloven §§ 7-10](https://lovdata.no/dokument/NL/lov/1974-12-20-68)
- [Mattilsynet: økologisk landbruk](https://www.mattilsynet.no/planter-og-dyrking/okologisk-landbruk)
- [Debio: økologisk merking](https://debio.no/merker/okologisk/)
