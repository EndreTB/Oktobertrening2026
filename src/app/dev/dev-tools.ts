import { signal } from '@angular/core';
import { Backend, SignedIn, StoreError } from '../backend';
import { Entry, PEOPLE, Person, elapsedDays, osloDate, overrideToday, validEntry } from '../challenge';
import { DEV_KEY, StepsService } from '../steps.service';
import { Memory, NewMemory, jpegUrl } from '../memories';
import { photoFrom } from '../photo';

/**
 * Devbaren på localhost: en Firestore i minnet i stedet for Firebase, så alle tilstander kan prøves uten
 * å logge inn. Tilstanden ligger i localStorage og overlever omlasting til devbaren slås av.
 */
export type DevRole = 'login' | Person | 'reader' | 'local' | 'error' | 'loading';
export type DevFailure = 'none' | 'offline' | 'denied';
export interface DevState { role: DevRole; today: string | null; entries: Entry[]; failure: DevFailure; }

const initial: DevState = { role: 'Endre', today: null, entries: [], failure: 'none' };
export const devState = signal<DevState>(load());

function load(): DevState {
  try { return { ...initial, ...JSON.parse(localStorage.getItem(DEV_KEY) || '{}') }; } catch { return initial; }
}
function save(patch: Partial<DevState>) {
  devState.update(state => ({ ...state, ...patch }));
  try { localStorage.setItem(DEV_KEY, JSON.stringify(devState())); } catch { /* Devbaren virker også uten lagring. */ }
}
export function devActive() { try { return localStorage.getItem(DEV_KEY) !== null; } catch { return false; } }

function user(role: DevRole): SignedIn | null {
  if (PEOPLE.includes(role as Person)) return { email: `${role.toLowerCase()}@dev.localhost`, name: role };
  return role === 'reader' ? { email: 'gjest@dev.localhost', name: 'Gjest' } : null;
}
const visible = () => devState().entries.filter(e => validEntry(e.day, e.steps, osloDate()));
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Minnene ligger bare i minnet (bildene blir for store for localStorage) og forsvinner ved omlasting. */
const memories = new Map<string, { memory: Memory; image: string }>();
const memoryList = () => [...memories.values()].map(m => m.memory).sort((a, b) => b.day.localeCompare(a.day) || b.created - a.created);

/** Samme oppførsel som FirebaseBackend, med skriveregelen fra firestore.rules. */
export class DevBackend implements Backend {
  private listeners = new Set<{ next: (entries: Entry[]) => void; fail: (error: StoreError) => void }>();
  private memoryListeners = new Set<{ next: (memories: Memory[]) => void; fail: (error: StoreError) => void }>();
  async init() { return user(devState().role); }
  async login() { save({ role: 'Endre' }); return user('Endre'); }
  async logout() { save({ role: 'login' }); }
  async claimSpot(person: Person) { return devState().role === person; }
  async readAll() {
    await delay(300);
    if (devState().failure === 'offline') throw new StoreError('request', 'Firestore svarte ikke.');
    return visible();
  }
  watch(next: (entries: Entry[]) => void, fail: (error: StoreError) => void) {
    const listener = { next, fail };
    this.listeners.add(listener);
    if (devState().failure === 'offline') fail(new StoreError('request', 'Firestore svarte ikke.')); else next(visible());
    return () => { this.listeners.delete(listener); };
  }
  /** Litt forsinkelse, så «Lagrer skrittene …» synes. */
  async saveDay(person: Person, day: string, steps: number) {
    await delay(600);
    this.check(person);
    const { entries } = devState();
    save({ entries: [...entries.filter(e => !(e.name === person && e.day === day)), { name: person, day, steps }] });
    this.notify();
  }
  watchMemories(next: (memories: Memory[]) => void, fail: (error: StoreError) => void) {
    const listener = { next, fail };
    this.memoryListeners.add(listener);
    if (devState().failure === 'offline') fail(new StoreError('request', 'Firestore svarte ikke.')); else next(memoryList());
    return () => { this.memoryListeners.delete(listener); };
  }
  async saveMemory(person: Person, memory: NewMemory) {
    await delay(1200);
    this.check(person);
    const { id, day, caption, thumb, width, height } = memory;
    memories.set(id, { memory: { id, name: person, day, caption, thumb: jpegUrl(thumb), width, height, created: Date.now() }, image: jpegUrl(memory.image) });
    this.notify();
  }
  async deleteMemory(id: string) {
    await delay(500);
    const memory = memories.get(id)?.memory;
    if (!memory) throw new StoreError('denied', 'Firestore nektet tilgang.');
    this.check(memory.name);
    memories.delete(id);
    this.notify();
  }
  async loadImage(id: string) {
    await delay(400);
    if (devState().failure === 'offline') throw new StoreError('request', 'Firestore svarte ikke.');
    const image = memories.get(id)?.image;
    if (!image) throw new StoreError('request', 'Fant ikke bildet.');
    return image;
  }
  /** Skriveregelen fra firestore.rules: bare kontoen som eier plassen. */
  private check(person: Person) {
    const { role, failure } = devState();
    if (failure === 'offline') throw new StoreError('request', 'Firestore svarte ikke.');
    if (!user(role)) throw new StoreError('unauthorized', 'Innloggingen har utløpt.');
    if (failure === 'denied' || role !== person) throw new StoreError('denied', 'Firestore nektet tilgang.');
  }
  notify() { [...this.listeners].forEach(l => l.next(visible())); [...this.memoryListeners].forEach(l => l.next(memoryList())); }
  fail(error: StoreError) { [...this.listeners, ...this.memoryListeners].forEach(l => l.fail(error)); }
}
const backend = new DevBackend();

/** Kalles fra StepsService.initialize når devbaren var på ved forrige besøk. */
export async function resumeDev(store: StepsService) {
  overrideToday(devState().today);
  await setRole(store, devState().role);
}

export async function setRole(store: StepsService, role: DevRole) {
  save({ role });
  overrideToday(devState().today);
  if (role === 'local') store.startLocal();
  else if (role === 'error' || role === 'loading') {
    store.disconnect(); store.mode.set(role);
    store.error.set(role === 'error' ? 'Konfigurasjonen kunne ikke lastes. Last siden på nytt.' : '');
  }
  else await store.attach(backend);
}

/** `null` gir ekte dato. Registreringer etter den nye datoen skjules, men blir liggende. */
export function setToday(store: StepsService, day: string | null) {
  save({ today: day });
  overrideToday(day);
  refresh(store);
}

export function setFailure(store: StepsService, failure: DevFailure) {
  save({ failure });
  if (failure === 'offline') backend.fail(new StoreError('request', 'Firestore svarte ikke.'));
  else refresh(store);
}

/** Som om Google-innloggingen gikk ut mens siden var åpen. */
export function expireLogin() {
  if (!user(devState().role)) return;
  save({ role: 'login' });
  backend.fail(new StoreError('unauthorized', 'Innloggingen har utløpt.'));
}

/**
 * Fyller gjengen med omtrent `total(dager)` skritt over dagene som har gått. Er det for få dager til et
 * realistisk tall (maks ~25 000 per person per dag), flyttes datoen frem. Returnerer ny dato om den ble flyttet.
 */
export function fillSteps(store: StepsService, total: (days: number) => number): string | null {
  const now = elapsedDays(osloDate());
  const wanted = total(now || 10);
  let moved: string | null = null;
  let days = now;
  if (wanted > 0) {
    days = Math.min(31, Math.max(now || 10, Math.ceil(wanted / (25_000 * PEOPLE.length))));
    if (days > now) { moved = october(days); setToday(store, moved); }
  }
  const entries = spreadSteps(wanted, days);
  if (store.mode() === 'local') {
    try { localStorage.setItem(store.storageKey, JSON.stringify(entries)); } catch { /* Uten lagring blir det ingen endring. */ }
    store.readLocal();
  } else { save({ entries }); backend.notify(); }
  return moved;
}

/** Fordeler `total` på alle deltakerne og de første `days` dagene, med litt variasjon mellom personer og dager. */
export function spreadSteps(total: number, days: number): Entry[] {
  if (total <= 0 || days <= 0) return [];
  const weights = PEOPLE.flatMap((name, p) => Array.from({ length: days }, (_, d) => ({
    name, day: october(d + 1), weight: (1.12 - p * .1) * (1 + .4 * Math.sin(d * 1.7 + p * 2.3)),
  })));
  const sum = weights.reduce((s, w) => s + w.weight, 0);
  return weights.map(({ name, day, weight }) => ({ name, day, steps: Math.min(100_000, Math.round(total * weight / sum)) }));
}

/** Tegner noen enkle eksempelbilder fra hver deltaker, så rutenettet og bildevisningen kan prøves. */
export async function sampleMemories() {
  const scenes = [
    { name: 'Stine', sky: ['#f3c58f', '#c56b4a'], ground: '#3b4a2f', text: 'Solnedgang over Bygdøy', ratio: [4, 3] },
    { name: 'Lars', sky: ['#bcd7e4', '#6f97ad'], ground: '#2f4b3a', text: 'Regn i Nordmarka. Verdt det.', ratio: [3, 4] },
    { name: 'Cathrine', sky: ['#e7d9f0', '#9c86b6'], ground: '#4a3f5c', text: '', ratio: [1, 1] },
    { name: 'Endre', sky: ['#d9ecaa', '#7fa36a'], ground: '#24392d', text: 'Første tur i oktober ✳', ratio: [16, 9] },
  ] as const;
  const days = Math.max(1, Math.min(elapsedDays(osloDate()), 31));
  for (const [index, scene] of scenes.entries()) {
    const [w, h] = scene.ratio;
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = Math.round(1200 * h / w);
    const g = canvas.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, scene.sky[0]); sky.addColorStop(1, scene.sky[1]);
    g.fillStyle = sky; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#fff6'; g.beginPath(); g.arc(canvas.width * .72, canvas.height * .3, canvas.height * .09, 0, Math.PI * 2); g.fill();
    g.fillStyle = scene.ground; g.beginPath(); g.moveTo(0, canvas.height);
    for (let x = 0; x <= canvas.width; x += 60) g.lineTo(x, canvas.height * (.62 + .1 * Math.sin(x / 140 + index)));
    g.lineTo(canvas.width, canvas.height); g.fill();
    const photo = await photoFrom(canvas, canvas.width, canvas.height);
    URL.revokeObjectURL(photo.preview);
    const day = october(Math.max(1, days - index));
    memories.set(`eksempel-${index}`, { memory: { id: `eksempel-${index}`, name: scene.name, day, caption: scene.text, thumb: jpegUrl(photo.thumb), width: photo.width, height: photo.height, created: Date.now() - index * 60_000 }, image: jpegUrl(photo.image) });
  }
  backend.notify();
}

export function turnOff() {
  try { localStorage.removeItem(DEV_KEY); } catch { /* Ingenting å fjerne. */ }
  overrideToday(null);
  location.reload();
}

/** Starter også lyttingen igjen om en simulert feil stoppet den. */
function refresh(store: StepsService) {
  if (store.mode() === 'local') store.readLocal(); else { backend.notify(); void store.refresh(); }
}
export const october = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
