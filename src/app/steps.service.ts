import { Injectable, signal } from '@angular/core';
import { Entry, Person, PEOPLE, demoEntries, osloDate, personFromEmail, validEntry } from './challenge';
import { AppConfig, Backend, FirebaseConfig, SignedIn, StoreError } from './backend';

export type Mode = 'loading' | 'local' | 'login' | 'shared' | 'readonly' | 'error';

@Injectable({ providedIn: 'root' })
export class StepsService {
  readonly entries = signal<Entry[]>([]);
  readonly name = signal<Person | null>(null);
  readonly mode = signal<Mode>('loading');
  readonly demo = signal(false);
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
  private storageKey = 'oktober-2026-local';
  private identityKey = 'oktober-2026-name-local';

  async initialize() {
    try {
      const response = await fetch(new URL('config.json', document.baseURI));
      if (!response.ok) throw new Error('Konfigurasjonen kunne ikke lastes. Last siden på nytt.');
      const firebase = (await response.json() as AppConfig).firebase;
      if (firebase?.apiKey && firebase.projectId && firebase.appId) await this.connect(firebase as FirebaseConfig);
      else {
        this.mode.set('local');
        this.restoreName();
        this.readLocal();
        window.addEventListener('storage', () => { if (!this.demo()) this.readLocal(); });
      }
    } catch (error) {
      this.mode.set('error');
      this.error.set(error instanceof Error ? error.message : 'Kunne ikke starte siden. Prøv å laste på nytt.');
    }
  }

  private async connect(config: FirebaseConfig) {
    const backend = this.backend = await this.createBackend(config);
    let user: SignedIn | null = null;
    try { user = await backend.init(); }
    catch { this.error.set('Innloggingen feilet. Prøv igjen.'); }
    if (user) this.start(user); else this.mode.set('login');
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
      if (this.demo()) return;
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
  private signedOut() {
    this.unwatch?.(); this.unwatch = undefined;
    this.mode.set('login'); this.email.set(''); this.lastSynced.set(null);
    if (!this.demo()) { this.name.set(null); this.entries.set([]); }
  }
  get online() { return this.mode() === 'shared' || this.mode() === 'readonly'; }

  private restoreName() {
    const saved = localStorage.getItem(this.identityKey);
    if (PEOPLE.includes(saved as Person)) this.name.set(saved as Person);
  }
  /** Bare lokalt og i demo – med Firebase bestemmer e-posten hvem du er. */
  chooseName(name: Person) {
    if (this.online && !this.demo()) return;
    this.name.set(name);
    if (!this.demo()) { try { localStorage.setItem(this.identityKey, name); } catch { this.error.set('Nettleseren kunne ikke huske navnet ditt.'); } }
  }
  private readLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      this.entries.set(Array.isArray(data) ? data.filter((e: Entry) => PEOPLE.includes(e.name) && validEntry(e.day, e.steps, osloDate())) : []);
    } catch { this.error.set('Kunne ikke lese lokal lagring. Eksisterende data er ikke overskrevet.'); }
  }
  /** Henter alt på nytt og starter lyttingen igjen om den har stoppet («Prøv igjen»). */
  async refresh() {
    if (!this.backend || !this.online || this.inFlight || this.saving() || this.demo()) return;
    this.inFlight = true;
    const revision = this.revision;
    try {
      const entries = await this.backend.readAll();
      if (!this.demo() && revision === this.revision) { this.entries.set(entries); this.lastSynced.set(new Date()); this.error.set(''); }
      if (!this.unwatch) this.watch();
    } catch (error) { this.fail(error); }
    finally { this.inFlight = false; }
  }
  async save(day: string, steps: number): Promise<boolean> {
    const name = this.name();
    const today = this.demo() ? '2026-10-12' : osloDate();
    if (!name || !validEntry(day, steps, today) || this.saving()) return false;
    if (!this.demo() && this.mode() !== 'shared' && this.mode() !== 'local') return false;
    this.saving.set(true); this.error.set(''); this.revision++;
    if (this.mode() === 'local' && !this.demo()) this.readLocal();
    try {
      const next = [...this.entries().filter(e => !(e.name === name && e.day === day)), {name, day, steps}];
      if (this.demo()) this.entries.set(next);
      else if (this.mode() === 'shared' && this.backend) {
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
  private onlineName: Person | null = null;
  startDemo() { this.revision++; this.onlineName = this.name(); this.demo.set(true); this.entries.set(demoEntries()); this.name.set('Endre'); this.error.set(''); }
  async stopDemo() {
    this.revision++; this.demo.set(false); this.entries.set([]);
    if (this.online) { this.name.set(this.onlineName); await this.refresh(); }
    else { this.name.set(null); this.restoreName(); if (this.mode() === 'local') this.readLocal(); }
  }
  shareLink() { return `${location.origin}${location.pathname}`; }
}
