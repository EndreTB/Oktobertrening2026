import { Injectable, signal } from '@angular/core';
import { Entry, Person, PEOPLE, osloDate, personFromEmail, validEntry } from './challenge';
import { AppConfig, Backend, FirebaseConfig, SignedIn, StoreError } from './backend';

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
  /** Byttes ut i tester. Firebase lastes som egen chunk, bare når det er konfigurert. */
  createBackend = async (config: FirebaseConfig): Promise<Backend> => new (await import('./firebase-backend')).FirebaseBackend(config);
  private backend?: Backend;
  private unwatch?: () => void;
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
    if (user) this.start(user); else this.mode.set('login');
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

  /** Innlogget: hvem du er ut fra e-posten, og live skritt fra Firestore. */
  private start(user: SignedIn) {
    const person = personFromEmail(user.email);
    this.email.set(user.email);
    this.name.set(person);
    this.mode.set(person ? 'shared' : 'readonly');
    this.error.set('');
    this.watch();
  }

  private watch() {
    this.unwatch?.();
    this.unwatch = this.backend?.watch(entries => {
      this.entries.set(entries); this.lastSynced.set(new Date()); this.error.set('');
    }, error => { this.unwatch?.(); this.unwatch = undefined; this.fail(error); });
  }

  private fail(error: unknown) {
    if (error instanceof StoreError && error.kind === 'unauthorized') { this.signedOut(); this.error.set('Innloggingen har utløpt. Logg inn igjen.'); }
    else if (error instanceof StoreError && error.kind === 'denied') this.error.set('Firestore nektet tilgang. Sjekk at reglene i firestore.rules er publisert.');
    else this.error.set('Får ikke kontakt med Firebase. Sjekk forbindelsen.');
  }

  /** Kalles rett fra klikket, så nettleseren ikke blokkerer innloggingsvinduet. */
  async login() {
    if (!this.backend) return;
    try { const user = await this.backend.login(); if (user) this.start(user); }
    catch (error) {
      this.error.set((error as { code?: string }).code === 'auth/popup-blocked'
        ? 'Nettleseren blokkerte innloggingsvinduet. Tillat popup for siden og prøv igjen.'
        : 'Innloggingen med Google feilet. Prøv igjen.');
    }
  }
  async logout() {
    this.unwatch?.(); this.unwatch = undefined;
    await this.backend?.logout();
    this.signedOut();
  }
  private signedOut() { this.disconnect(); this.mode.set('login'); }
  /** Stopper lyttingen og glemmer brukeren og skrittene. Modusen settes av den som kaller. */
  disconnect() {
    this.unwatch?.(); this.unwatch = undefined;
    this.email.set(''); this.lastSynced.set(null);
    this.name.set(null); this.entries.set([]);
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
  shareLink() { return `${location.origin}${location.pathname}`; }
}
