import { Entry, Person, PEOPLE, validEntry } from './challenge';

/** Web-konfigurasjonen fra Firebase-konsollen (Project settings → Your apps). Verdiene er offentlige. */
export interface FirebaseConfig {
  apiKey: string; authDomain: string; projectId: string; appId: string;
  storageBucket?: string; messagingSenderId?: string;
}
export interface AppConfig { firebase?: Partial<FirebaseConfig>; }
export interface SignedIn { email: string; name: string; }

/**
 * Skrittene ligger i Firestore, ett dokument per person: `oktober-2026/endre` med
 * `{ days: { "2026-10-03": 8123, … }, updatedAt }`. Hver person skriver bare sitt eget dokument
 * (håndhevet i firestore.rules), så ingen kan overskrive hverandre.
 */
export const COLLECTION = 'oktober-2026';
/** Hvilken Google-konto som eier hver persons plass: `oktober-2026-plasser/endre` med `{ uid, email }`. */
export const SPOTS = 'oktober-2026-plasser';
export const docId = (person: Person) => person.toLowerCase();

export class StoreError extends Error {
  constructor(readonly kind: 'unauthorized' | 'denied' | 'request', message: string) { super(message); }
}

/** Det StepsService trenger fra innlogging og lagring – liten nok til å byttes ut i tester. */
export interface Backend {
  /** Venter til Firebase vet om brukeren allerede er logget inn. */
  init(): Promise<SignedIn | null>;
  /** Null hvis brukeren lukket innloggingsvinduet. */
  login(): Promise<SignedIn | null>;
  logout(): Promise<void>;
  /**
   * Tar personens plass for den innloggede kontoen hvis den er ledig. Sann hvis kontoen eier plassen,
   * usann hvis en annen konto allerede har den.
   */
  claimSpot(person: Person): Promise<boolean>;
  readAll(): Promise<Entry[]>;
  /** Live oppdateringer av alle deltakernes dokumenter. Returnerer en funksjon som stopper lyttingen. */
  watch(next: (entries: Entry[]) => void, fail: (error: StoreError) => void): () => void;
  saveDay(person: Person, day: string, steps: number): Promise<void>;
}

/** Gjør Firestore-dokumentene om til registreringer, og hopper over ukjente personer og ugyldige dager. */
export function toEntries(docs: { id: string; data: unknown }[], today: string): Entry[] {
  return PEOPLE.flatMap(name => {
    const days = (docs.find(d => d.id === docId(name))?.data as { days?: unknown } | undefined)?.days;
    if (!days || typeof days !== 'object' || Array.isArray(days)) return [];
    return Object.entries(days)
      .filter((pair): pair is [string, number] => typeof pair[1] === 'number' && validEntry(pair[0], pair[1], today))
      .map(([day, steps]) => ({ name, day, steps }));
  }).sort((a, b) => a.day.localeCompare(b.day) || PEOPLE.indexOf(a.name) - PEOPLE.indexOf(b.name));
}
