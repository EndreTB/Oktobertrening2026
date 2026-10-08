# Oktober, til fots

**Live:** https://endretb.github.io/Oktobertrening2026/

En oktoberutfordring for **Endre, Stine, Lars og Cathrine**, laget med Angular 22.2.1 og Three.js. Målet er **310 000 skritt hver i oktober 2026** – 10 000 i snitt over alle 31 dager. En rolig dag kan tas igjen senere.

## Prøv lokalt

Krever Node 22.22.3 eller nyere innen Node 22 (prosjektet er bygget med 22.23.1).

```sh
npm ci
npm start
```

Åpne http://localhost:3000. Med Firebase-oppsett i `public/config.json` vises **Logg inn med Google**. Uten `apiKey`/`appId` er siden en tydelig merket lokal forhåndsvisning.

### Devbar på localhost

På `localhost` ligger en devbar nederst for å hoppe mellom tilstander uten å logge inn: rolle (utlogget, Endre/Stine/Lars/Cathrine, leser, lokal, laster, feil), falsk dato, ferdige skrittdatasett (fra tom til bortenfor 1 240 000, eller midt i hver verden) simulerte feil (nettverk, nektet, utløpt innlogging) og fire eksempelbilder under **Minner** (bare i minnet, borte ved omlasting). Første klikk bytter fra Firebase til en database i minnet, og valget huskes til du trykker **Av · ekte Firebase**. Ingenting skrives til Firestore. Koden ligger i `src/app/dev/` og lastes aldri utenfor localhost.

## Innlogging og lagring i Firebase

Prosjektet er `kchallange-5e855` («10kchallange», Spark-planen holder godt).

- **Innlogging:** Firebase Authentication med Google, i popup (virker på GitHub Pages uten Firebase Hosting). Firebase husker innloggingen i nettleseren.
- **Hvem er hvem:** Hver person har én plass i `oktober-2026-plasser/{endre|stine|lars|cathrine}` med `{ uid, email }`. Første verifiserte Google-konto der delen foran `@` inneholder navnet, tar plassen; deretter er den låst. Andre kontoer med samme navn i e-posten får bare lesetilgang. Skal en plass flyttes, slett dokumentet i Firebase-konsollen – da tar neste innlogging den.
- **Lagring:** Firestore, ett dokument per person: `oktober-2026/endre` (og `stine`, `lars`, `cathrine`) med `{ days: { "2026-10-03": 8123, … }, updatedAt }`. Lagring slår sammen bare den ene dagen inn i `days`, så ingen enheter overskriver hverandre. Se `src/app/firebase-backend.ts`.
- **Live:** Alle lytter på samlingen, så nye skritt dukker opp hos de andre med en gang.
- **Minner (bilder):** Deltakerne kan dele bilder fra turene med dato og en kort tekst. Bildet krympes i nettleseren til JPEG (maks 1600 px, under 900 KB) og lagres som bytes i Firestore, fordi Cloud Storage krever Blaze-planen. Hvert minne er to dokumenter med samme id: `oktober-2026-minner/{id}` med miniatyr, dato og tekst, og `oktober-2026-bilder/{id}` med bildet i full størrelse, som hentes først når noen åpner det. Begge skrives i samme batch. Se `src/app/memories.ts` og `src/app/photo.ts`.
- **Regler:** `firestore.rules` krever innlogging for å lese, og at du bare skriver dokumentet til plassen kontoen din eier. Plasser kan opprettes én gang, aldri endres eller slettes fra appen. Minnene kan bare leses av de fire deltakerne, og hver kan bare dele og slette sine egne.

### Oppsett i Firebase-konsollen

1. **Project Overview → Add app → Web** (`</>`). Kopier `apiKey`, `messagingSenderId` og `appId` inn i `public/config.json`. Verdiene er offentlige og skal sjekkes inn.
2. **Security → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Authentication → Settings → Authorized domains:** `localhost` er med fra før. Legg til `DITT-NAVN.github.io` for GitHub Pages.
4. **Databases & Storage → Firestore Database → Create database** (production mode). Opprettet i `europe-north1` med slettebeskyttelse.
5. **Firestore → Rules:** lim inn innholdet i `firestore.rules` og trykk **Publish**. Alternativt `npx firebase-tools deploy --only firestore:rules`.

### Publisering på GitHub Pages

1. Legg `endretb.github.io` inn under Authorized domains (over).
2. **Settings → Pages → Source: GitHub Actions**, og push til `main`. Workflowen tester, stopper hvis `apiKey`/`appId` mangler i `public/config.json`, bygger og publiserer.

## Slik fungerer utfordringen

- Ett tall per person per dato. Ny registrering på samme dato **erstatter** forrige tall; den legges ikke til som en ekstra tur.
- Datoer følger **Europe/Oslo**, også om en deltaker reiser. Fremtidige datoer er sperret i grensesnittet. Registrering åpner 1. oktober. Etter oktober kan man fortsatt rette oktoberdata.
- Dagsnittet bruker antall kalenderdager som har gått, inkludert dager uten registrering. Før start vises 0.
- Nødvendig dagsnitt bruker de gjenstående dagene, inkludert i dag dersom dagen ikke er registrert. Når i dag er registrert, gjelder beregningen fra i morgen. Et registrert 0-tall teller som en registrert dag.
- Alle fire har hvert sitt mål på 310 000. Historiens felles mål er 1 240 000. Fellesmålet og alle portalgrenser skaleres med antall deltakere i `src/app/participants.ts`, slik at innsatsen per person til neste verden er den samme. Én person kan bidra ekstra til historien uten at de andres personlige mål markeres som nådd.
- 0,75 meter per skritt gir 232,5 km per person og 930 km samlet. Dette er et grovt anslag, ikke målte GPS-data. Luftlinjesammenligningene er avrundede.
- «Skritt dag for dag» viser hver deltakers registrering og summen for hver dag, nyeste først. Manglende registrering vises som en strek, mens registrert 0 vises som 0.
- Fellesdata oppdateres live fra Firestore. En vellykket lagring bekreftes først når Firestore har svart (maks 10 sekunder). Ved nettverksfeil vises feilmelding og tallet beholdes i feltet for nytt forsøk.
- 3D-ruten følger gruppens fremdrift. Seks verdener låses opp av samlet skrittantall. De er skjult til gjengen når dem – navn, ikon og innhold vises først da, og bare oppdagede verdener kan utforskes. Etter en vellykket registrering vises en animert turfigur med følge-kamera. Bare økningen siden forrige registrering på datoen gir ny forflytning. Når siden åpnes eller du kommer tilbake til fanen, vises gjeldende fremdrift direkte uten en automatisk oppsummeringstur. Three.js lastes separat fra hovedappen, pauser rendering når scenen ikke er synlig, begrenser pikseloppløsning og respekterer redusert bevegelse. Registrering virker også uten WebGL.

## Tilgang og personvern

Innloggingen er Google sin via Firebase. Appen ser bare navn og e-post på den innloggede kontoen. Alle som logger inn kan lese skrittene; bare Endre, Stine, Lars og Cathrine kan skrive, og bare på seg selv (håndhevet i `firestore.rules`). Bilder er frivillige og synes bare for de fire deltakerne – ikke for andre som logger inn. Bildet tegnes på nytt før deling, så posisjon og annen EXIF-info blir ikke med. Den som delte et bilde kan slette det for alle. Ingen analyseverktøy eller GPS-sporing. Skriftene hentes fra Google Fonts, med lokale systemskrifter som reserve.

## Kontroller

```sh
npm test
npm run build
```

Testene dekker månedsgrensene, tidssone, nullverdier, dagsnitt, gjenstående dagsmål, distanse, strek, e-post → person, tolking av Firestore-dokumenter, og et simulert Firestore (`tests/fake-backend.ts`): live deling mellom brukere, lesetilgang, kun eget dokument, nettverksfeil, utlogging og lokal modus – og for minner: tolking av dokumentene, grenser for dato, tekst og bildestørrelse, deling live, at lesere ikke ser bildene, nytt forsøk uten duplikat og at bare eieren kan slette. Testene går ikke mot ekte Firebase.

`npm run build:pages` bygger med relativ base-adresse. Siden bruker seksjonsankere fremfor klientruter og trenger ingen SPA-404-omskriving.

Offisiell dokumentasjon: [Firebase Auth med Google](https://firebase.google.com/docs/auth/web/google-signin), [Firestore-regler](https://firebase.google.com/docs/firestore/security/get-started), [Angular-versjoner](https://angular.dev/reference/releases), [GitHub Pages med Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
