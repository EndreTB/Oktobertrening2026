import { Injectable, signal } from '@angular/core';
import { Entry, Person, PEOPLE, osloDate, personFromEmail, validEntry } from './challenge';
import { AppConfig, Backend, FirebaseConfig, SignedIn, StoreError } from './backend';
import { Memory, NewMemory, validMemory } from './memories';

export type Mode = 'loading' | 'local' | 'login' | 'shared' | 'readonly' | 'error';

/** Devbaren (src/app/dev) finnes bare på localhost. Er den slått på, står tilstanden her og Firebase hoppes over. */
export const DEV_KEY = 'oktober-2026-dev';
export const isDevHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname);
function devActive() { try { return isDevHost() && localStorage.getItem(DEV_KEY) !== null; } catch { return false; } }

@Injectable({ providedIn: 'root' })
export class StepsService {
  readonly entries = signal<Entry[]>([]);
  readonly name = signal<Person | null>(null);
  readonly mode = signal<Mode>('loading');
  readonly error = signal('');
  readonly saving = signal(false);
  readonly lastSynced = signal<Date | null>(null);
  readonly email = signal('');
  /** Personen e-posten passer med, når plassen allerede eies av en annen konto. */
  readonly spotTaken = signal<Person | null>(null);
  /** Bildene gjengen har delt. Bare deltakerne får se dem. */
  readonly memories = signal<Memory[]>([]);
  readonly memoryError = signal('');
  readonly sharing = signal(false);
  /** Byttes ut i tester. Firebase lastes som egen chunk, bare når det er konfigurert. */
  createBackend = async (config: FirebaseConfig): Promise<Backend> => new (await import('./firebase-backend')).FirebaseBackend(config);
  private backend?: Backend;
  private unwatch?: () => void;
  private unwatchMemories?: () => void;
  /** Bilder i full størrelse som er hentet. De eldste glemmes, så minnebruken holder seg nede. */
  private images = new Map<string, Promise<string>>();
  private inFlight = false;
  private revision = 0;
  private listeningLocal = false;
  readonly storageKey = 'oktober-2026-local';
  private identityKey = 'oktober-2026-name-local';

  async initialize() {
    try {
      if (devActive()) { await (await import('./dev/dev-tools')).resumeDev(this); return; }
      const response = await fetch(new URL('config.json', document.baseURI));
      if (!response.ok) throw new Error('Konfigurasjonen kunne ikke lastes. Last siden på nytt.');
      const firebase = (await response.json() as AppConfig).firebase;
      if (firebase?.apiKey && firebase.projectId && firebase.appId) await this.connect(firebase as FirebaseConfig);
      else this.startLocal();
    } catch (error) {
      this.mode.set('error');
      this.error.set(error instanceof Error ? error.message : 'Kunne ikke starte siden. Prøv å laste på nytt.');
    }
  }

  private async connect(config: FirebaseConfig) { await this.attach(await this.createBackend(config)); }

  /** Kobler til en backend – Firebase, eller devbarens i minnet. En tidligere tilkobling stoppes. */
  async attach(backend: Backend) {
    this.disconnect(); this.mode.set('loading'); this.error.set('');
    this.backend = backend;
    let user: SignedIn | null = null;
    try { user = await backend.init(); }
    catch { this.error.set('Innloggingen feilet. Prøv igjen.'); }
    if (user) await this.start(user); else this.mode.set('login');
  }

  /** Uten Firebase: skrittene lagres bare i denne nettleseren. */
  startLocal() {
    this.disconnect(); this.backend = undefined; this.error.set('');
    this.mode.set('local');
    this.restoreName();
    this.readLocal();
    if (!this.listeningLocal) window.addEventListener('storage', () => { if (this.mode() === 'local') this.readLocal(); });
    this.listeningLocal = true;
  }

  /**
   * Innlogget: hvem du er ut fra e-posten, og live skritt fra Firestore. Passer e-posten med et navn,
   * må kontoen også eie plassen – er den tatt av en annen konto, får du bare følge med.
   */
  private async start(user: SignedIn) {
    let person = personFromEmail(user.email);
    this.email.set(user.email);
    this.error.set('');
    this.spotTaken.set(null);
    if (person) {
      try { if (!await this.backend!.claimSpot(person)) { this.spotTaken.set(person); person = null; } }
      catch { this.error.set('Fikk ikke sjekket plassen din. Last siden på nytt.'); person = null; }
    }
    this.name.set(person);
    this.mode.set(person ? 'shared' : 'readonly');
    this.watch();
    this.watchMemories();
  }

  private watch() {
    this.unwatch?.();
    this.unwatch = this.backend?.watch(entries => {
      this.entries.set(entries); this.lastSynced.set(new Date()); this.error.set('');
    }, error => { this.unwatch?.(); this.unwatch = undefined; this.fail(error); });
  }

  /** Bare deltakerne kan lese minnene (firestore.rules), så lesere lytter ikke. Kalles også fra «Prøv igjen». */
  watchMemories() {
    this.unwatchMemories?.(); this.unwatchMemories = undefined;
    if (this.mode() !== 'shared' || !this.backend) return;
    this.memoryError.set('');
    this.unwatchMemories = this.backend.watchMemories(memories => { this.memories.set(memories); this.memoryError.set(''); }, error => {
      this.unwatchMemories?.(); this.unwatchMemories = undefined;
      if (error.kind === 'unauthorized') this.fail(error);
      else this.memoryError.set(error.kind === 'denied' ? 'Firestore nektet tilgang til minnene. Sjekk at reglene i firestore.rules er publisert.' : 'Fikk ikke hentet minnene. Sjekk forbindelsen.');
    });
  }

  private fail(error: unknown) {
    if (error instanceof StoreError && error.kind === 'unauthorized') { this.signedOut(); this.error.set('Innloggingen har utløpt. Logg inn igjen.'); }
    else if (error instanceof StoreError && error.kind === 'denied') this.error.set('Firestore nektet tilgang. Sjekk at reglene i firestore.rules er publisert.');
    else this.error.set('Får ikke kontakt med Firebase. Sjekk forbindelsen.');
  }

  /** Kalles rett fra klikket, så nettleseren ikke blokkerer innloggingsvinduet. */
  async login() {
    if (!this.backend) return;
    try { const user = await this.backend.login(); if (user) await this.start(user); }
    catch (error) {
      this.error.set((error as { code?: string }).code === 'auth/popup-blocked'
        ? 'Nettleseren blokkerte innloggingsvinduet. Tillat popup for siden og prøv igjen.'
        : 'Innloggingen med Google feilet. Prøv igjen.');
    }
  }
  async logout() {
    this.unwatch?.(); this.unwatch = undefined;
    this.unwatchMemories?.(); this.unwatchMemories = undefined;
    await this.backend?.logout();
    this.signedOut();
  }
  private signedOut() { this.disconnect(); this.mode.set('login'); }
  /** Stopper lyttingen og glemmer brukeren og skrittene. Modusen settes av den som kaller. */
  disconnect() {
    this.unwatch?.(); this.unwatch = undefined;
    this.unwatchMemories?.(); this.unwatchMemories = undefined;
    this.email.set(''); this.lastSynced.set(null);
    this.name.set(null); this.entries.set([]); this.spotTaken.set(null);
    this.memories.set([]); this.memoryError.set(''); this.images.clear();
  }
  get online() { return this.mode() === 'shared' || this.mode() === 'readonly'; }

  private restoreName() {
    const saved = localStorage.getItem(this.identityKey);
    if (PEOPLE.includes(saved as Person)) this.name.set(saved as Person);
  }
  /** Bare lokalt – med Firebase bestemmer e-posten hvem du er. */
  chooseName(name: Person) {
    if (this.online) return;
    this.name.set(name);
    try { localStorage.setItem(this.identityKey, name); } catch { this.error.set('Nettleseren kunne ikke huske navnet ditt.'); }
  }
  readLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      this.entries.set(Array.isArray(data) ? data.filter((e: Entry) => PEOPLE.includes(e.name) && validEntry(e.day, e.steps, osloDate())) : []);
    } catch { this.error.set('Kunne ikke lese lokal lagring. Eksisterende data er ikke overskrevet.'); }
  }
  /** Henter alt på nytt og starter lyttingen igjen om den har stoppet («Prøv igjen»). */
  async refresh() {
    if (!this.backend || !this.online || this.inFlight || this.saving()) return;
    this.inFlight = true;
    const revision = this.revision;
    try {
      const entries = await this.backend.readAll();
      if (revision === this.revision) { this.entries.set(entries); this.lastSynced.set(new Date()); this.error.set(''); }
      if (!this.unwatch) this.watch();
    } catch (error) { this.fail(error); }
    finally { this.inFlight = false; }
  }
  async save(day: string, steps: number): Promise<boolean> {
    const name = this.name();
    if (!name || !validEntry(day, steps, osloDate()) || this.saving()) return false;
    if (this.mode() !== 'shared' && this.mode() !== 'local') return false;
    this.saving.set(true); this.error.set(''); this.revision++;
    if (this.mode() === 'local') this.readLocal();
    try {
      const next = [...this.entries().filter(e => !(e.name === name && e.day === day)), {name, day, steps}];
      if (this.mode() === 'shared' && this.backend) {
        await this.backend.saveDay(name, day, steps);
        this.entries.set(next); this.lastSynced.set(new Date());
      } else if (this.mode() === 'local') { localStorage.setItem(this.storageKey, JSON.stringify(next)); this.entries.set(next); }
      else throw new Error('Ingen forbindelse');
      return true;
    } catch (error) {
      this.error.set(error instanceof StoreError && error.kind === 'unauthorized'
        ? 'Innloggingen har utløpt, så skrittene ble ikke lagret. Logg inn igjen og prøv på nytt.'
        : error instanceof StoreError && error.kind === 'denied'
        ? 'Firestore nektet lagringen, så skrittene ble ikke lagret. Sjekk at reglene i firestore.rules er publisert.'
        : 'Skrittene ble ikke lagret. Behold tallet og prøv igjen når forbindelsen er tilbake.');
      return false;
    }
    finally { this.saving.set(false); }
  }
  /** Deler et bilde med gjengen. Teksten trimmes; et nytt forsøk med samme id overskriver i stedet for å lage duplikat. */
  async shareMemory(memory: NewMemory): Promise<boolean> {
    const name = this.name();
    if (!name || this.mode() !== 'shared' || !this.backend || this.sharing()) return false;
    const trimmed = { ...memory, caption: memory.caption.trim() };
    if (!validMemory(trimmed, osloDate())) { this.memoryError.set('Minnet ble ikke delt. Velg en dato i oktober til og med i dag, og skriv maks 280 tegn.'); return false; }
    this.sharing.set(true); this.memoryError.set('');
    try { await this.backend.saveMemory(name, trimmed); return true; }
    catch (error) {
      this.memoryError.set(error instanceof StoreError && error.kind === 'unauthorized'
        ? 'Innloggingen har utløpt, så bildet ble ikke delt. Logg inn igjen og prøv på nytt.'
        : error instanceof StoreError && error.kind === 'denied'
        ? 'Firestore nektet delingen. Sjekk at reglene i firestore.rules er publisert.'
        : 'Bildet ble ikke delt. Prøv igjen når forbindelsen er tilbake.');
      return false;
    }
    finally { this.sharing.set(false); }
  }
  /** Bare dine egne minner kan slettes. Bildet forsvinner for alle. */
  async deleteMemory(memory: Memory): Promise<boolean> {
    if (!this.backend || this.mode() !== 'shared' || memory.name !== this.name()) return false;
    this.memoryError.set('');
    try {
      await this.backend.deleteMemory(memory.id);
      this.images.delete(memory.id);
      this.memories.update(list => list.filter(m => m.id !== memory.id));
      return true;
    } catch (error) {
      this.memoryError.set(error instanceof StoreError && error.kind === 'unauthorized'
        ? 'Innloggingen har utløpt, så minnet ble ikke slettet. Logg inn igjen og prøv på nytt.'
        : 'Minnet ble ikke slettet. Prøv igjen når forbindelsen er tilbake.');
      return false;
    }
  }
  /** Bildet i full størrelse, hentet først når noen åpner det. */
  image(id: string): Promise<string> {
    if (!this.backend || this.mode() !== 'shared') return Promise.reject(new StoreError('unauthorized', 'Ikke innlogget.'));
    let image = this.images.get(id);
    if (!image) {
      image = this.backend.loadImage(id);
      image.catch(() => { if (this.images.get(id) === image) this.images.delete(id); });
      this.images.set(id, image);
      if (this.images.size > 12) this.images.delete(this.images.keys().next().value!);
    }
    return image;
  }
  shareLink() { return `${location.origin}${location.pathname}`; }
}
