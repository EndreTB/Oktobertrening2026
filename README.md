# Oktober, til fots

En oktoberutfordring for **Endre, Stine og Lars**, laget med Angular 22.2.1 og Three.js. Målet er **310 000 skritt hver i oktober 2026** – 10 000 i snitt over alle 31 dager. En rolig dag kan tas igjen senere.

## Prøv lokalt

Krever Node 22.22.3 eller nyere innen Node 22 (prosjektet er bygget med 22.23.1).

```sh
npm ci
npm start
```

Åpne http://localhost:3000. Med Firebase-oppsett i `public/config.json` vises **Logg inn med Google**. Uten `apiKey`/`appId` er siden en tydelig merket lokal forhåndsvisning. **Prøv med demoskritt** nederst viser en oktober i gang; demoen er i minnet og endrer aldri ekte registreringer.

## Innlogging og lagring i Firebase

Prosjektet er `kchallange-5e855` («10kchallange», Spark-planen holder godt).

- **Innlogging:** Firebase Authentication med Google, i popup (virker på GitHub Pages uten Firebase Hosting). Firebase husker innloggingen i nettleseren.
- **Hvem er hvem:** Inneholder delen foran `@` i Google-e-posten `endre`, `stine` eller `lars`, er du den personen og registrerer skritt på deg selv. Andre som logger inn får lesetilgang. Navnet kan ikke velges manuelt når Firebase er koblet til.
- **Lagring:** Firestore, ett dokument per person: `oktober-2026/endre` (og `stine`, `lars`) med `{ days: { "2026-10-03": 8123, … }, updatedAt }`. Lagring slår sammen bare den ene dagen inn i `days`, så ingen enheter overskriver hverandre. Se `src/app/firebase-backend.ts`.
- **Live:** Alle lytter på samlingen, så nye skritt dukker opp hos de andre med en gang.
- **Regler:** `firestore.rules` krever innlogging for å lese, og at du bare skriver ditt eget dokument (verifisert e-post som matcher navnet). Vil dere stramme inn, bytt `matches(...)` med en liste over de tre e-postadressene.

### Oppsett i Firebase-konsollen

1. **Project Overview → Add app → Web** (`</>`). Kopier `apiKey`, `messagingSenderId` og `appId` inn i `public/config.json`. Verdiene er offentlige og skal sjekkes inn.
2. **Security → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Authentication → Settings → Authorized domains:** `localhost` er med fra før. Legg til `DITT-NAVN.github.io` for GitHub Pages.
4. **Databases & Storage → Firestore Database → Create database** (production mode, f.eks. `eur3`).
5. **Firestore → Rules:** lim inn innholdet i `firestore.rules` og trykk **Publish**. Alternativt `npx firebase-tools deploy --only firestore:rules`.

### Publisering på GitHub Pages

1. Legg Pages-domenet inn under Authorized domains (over).
2. **Settings → Pages → Source: GitHub Actions**, og push til `main`. Workflowen tester, stopper hvis `apiKey`/`appId` mangler i `public/config.json`, bygger og publiserer.

## Slik fungerer utfordringen

- Ett tall per person per dato. Ny registrering på samme dato **erstatter** forrige tall; den legges ikke til som en ekstra tur.
- Datoer følger **Europe/Oslo**, også om en deltaker reiser. Fremtidige datoer er sperret i grensesnittet. Registrering åpner 1. oktober. Etter oktober kan man fortsatt rette oktoberdata.
- Dagsnittet bruker antall kalenderdager som har gått, inkludert dager uten registrering. Før start vises 0.
- Nødvendig dagsnitt bruker de gjenstående dagene, inkludert i dag dersom dagen ikke er registrert. Når i dag er registrert, gjelder beregningen fra i morgen. Et registrert 0-tall teller som en registrert dag.
- Alle tre har hvert sitt mål på 310 000. Historiens felles mål er 930 000. Én person kan bidra ekstra til historien uten at de andres personlige mål markeres som nådd.
- 0,75 meter per skritt gir 232,5 km per person og 697,5 km samlet. Dette er et grovt anslag, ikke målte GPS-data. Luftlinjesammenligningene er avrundede.
- Fellesdata oppdateres live fra Firestore. En vellykket lagring bekreftes først når Firestore har svart (maks 10 sekunder). Ved nettverksfeil vises feilmelding og tallet beholdes i feltet for nytt forsøk.
- 3D-ruten følger gruppens fremdrift. Seks verdener låses opp av samlet skrittantall. Etter en vellykket registrering vises en animert turfigur med følge-kamera. Bare økningen siden forrige registrering på datoen gir ny forflytning. Three.js lastes separat fra hovedappen, pauser rendering når scenen ikke er synlig, begrenser pikseloppløsning og respekterer redusert bevegelse. Registrering virker også uten WebGL.

## Tilgang og personvern

Innloggingen er Google sin via Firebase. Appen ser bare navn og e-post på den innloggede kontoen. Alle som logger inn kan lese skrittene; bare Endre, Stine og Lars kan skrive, og bare på seg selv (håndhevet i `firestore.rules`). Ingen analyseverktøy eller GPS-sporing. Skriftene hentes fra Google Fonts, med lokale systemskrifter som reserve.

## Kontroller

```sh
npm test
npm run build
```

Testene dekker månedsgrensene, tidssone, nullverdier, dagsnitt, gjenstående dagsmål, distanse, strek, e-post → person, tolking av Firestore-dokumenter, og et simulert Firestore (`tests/fake-backend.ts`): live deling mellom brukere, lesetilgang, kun eget dokument, nettverksfeil, utlogging, lokal modus og isolert demo. Testene går ikke mot ekte Firebase.

`npm run build:pages` bygger med relativ base-adresse. Siden bruker seksjonsankere fremfor klientruter og trenger ingen SPA-404-omskriving.

Offisiell dokumentasjon: [Firebase Auth med Google](https://firebase.google.com/docs/auth/web/google-signin), [Firestore-regler](https://firebase.google.com/docs/firestore/security/get-started), [Angular-versjoner](https://angular.dev/reference/releases), [GitHub Pages med Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
