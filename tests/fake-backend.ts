import {Backend, COLLECTION, StoreError, docId, toEntries} from '../src/app/backend';
import {osloDate} from '../src/app/challenge';
import {MEMORIES, Memory, jpegUrl, toMemories} from '../src/app/memories';

// Et lite Firestore i minnet, delt mellom flere innloggede brukere – med samme skriveregel som firestore.rules.
export function fakeFirestore() {
  const docs = new Map<string, {days: Record<string, number>}>();
  const spots = new Map<string, string>();
  const memories = new Map<string, {person: string; day: string; caption: string; thumb: Uint8Array; width: number; height: number; createdAt: number}>();
  const images = new Map<string, {person: string; image: Uint8Array}>();
  const listeners = new Set<() => void>();
  const state = {offline: false, writes: 0};
  const read = () => toEntries([...docs].map(([id, data]) => ({id, data})), osloDate());
  const readMemories = () => toMemories([...memories].map(([id, data]) => ({id, data: {...data, thumb: jpegUrl(data.thumb)}})));
  const notify = () => listeners.forEach(l => l());
  function backend(email: string|null): Backend {
    let user = email;
    // Deltaker = kontoen eier en plass. Bare deltakerne leser og skriver minner.
    const member = () => user !== null && [...spots.values()].includes(user);
    const owns = (person: string) => user !== null && spots.get(person) === user;
    return {
      init: async () => user ? {email: user, name: user} : null,
      login: async () => null,
      logout: async () => { user = null; },
      async claimSpot(person) {
        if (!user) throw new StoreError('unauthorized', 'utløpt');
        if (!spots.has(docId(person))) spots.set(docId(person), user);
        return spots.get(docId(person)) === user;
      },
      readAll: async () => { if (state.offline) throw new StoreError('request', 'offline'); return read(); },
      watch(next) { const l = () => next(read()); listeners.add(l); l(); return () => listeners.delete(l); },
      async saveDay(person, day, steps) {
        if (state.offline) throw new StoreError('request', 'offline');
        if (!user) throw new StoreError('unauthorized', 'utløpt');
        if (spots.get(docId(person)) !== user) throw new StoreError('denied', `${COLLECTION}/${docId(person)}`);
        const doc = docs.get(docId(person)) ?? {days: {}};
        docs.set(docId(person), {days: {...doc.days, [day]: steps}});
        state.writes++; notify();
      },
      watchMemories(next: (memories: Memory[]) => void, fail) {
        if (!member()) { fail(new StoreError('denied', MEMORIES)); return () => {}; }
        const l = () => next(readMemories()); listeners.add(l); l(); return () => listeners.delete(l);
      },
      async saveMemory(person, {id, day, caption, image, thumb, width, height}) {
        if (state.offline) throw new StoreError('request', 'offline');
        if (!user) throw new StoreError('unauthorized', 'utløpt');
        const existing = memories.get(id);
        if (!owns(docId(person)) || (existing && existing.person !== docId(person))) throw new StoreError('denied', `${MEMORIES}/${id}`);
        images.set(id, {person: docId(person), image});
        memories.set(id, {person: docId(person), day, caption, thumb, width, height, createdAt: Date.now()});
        state.writes++; notify();
      },
      async deleteMemory(id) {
        if (state.offline) throw new StoreError('request', 'offline');
        if (!user) throw new StoreError('unauthorized', 'utløpt');
        const memory = memories.get(id);
        if (!memory || !owns(memory.person)) throw new StoreError('denied', `${MEMORIES}/${id}`);
        memories.delete(id); images.delete(id);
        state.writes++; notify();
      },
      async loadImage(id) {
        if (state.offline) throw new StoreError('request', 'offline');
        if (!member()) throw new StoreError('denied', `bilder/${id}`);
        const image = images.get(id);
        if (!image) throw new StoreError('request', 'mangler');
        return jpegUrl(image.image);
      },
    };
  }
  return {backend, docs, spots, memories, images, state};
}
