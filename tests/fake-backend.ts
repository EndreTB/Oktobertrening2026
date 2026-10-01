import {Backend, COLLECTION, StoreError, docId, toEntries} from '../src/app/backend';
import {osloDate} from '../src/app/challenge';

// Et lite Firestore i minnet, delt mellom flere innloggede brukere – med samme skriveregel som firestore.rules.
export function fakeFirestore() {
  const docs = new Map<string, {days: Record<string, number>}>();
  const listeners = new Set<() => void>();
  const state = {offline: false, writes: 0};
  const read = () => toEntries([...docs].map(([id, data]) => ({id, data})), osloDate());
  const notify = () => listeners.forEach(l => l());
  function backend(email: string|null): Backend {
    let user = email;
    return {
      init: async () => user ? {email: user, name: user} : null,
      login: async () => null,
      logout: async () => { user = null; },
      readAll: async () => { if (state.offline) throw new StoreError('request', 'offline'); return read(); },
      watch(next) { const l = () => next(read()); listeners.add(l); l(); return () => listeners.delete(l); },
      async saveDay(person, day, steps) {
        if (state.offline) throw new StoreError('request', 'offline');
        if (!user) throw new StoreError('unauthorized', 'utløpt');
        if (!user.split('@')[0].toLowerCase().includes(docId(person))) throw new StoreError('denied', `${COLLECTION}/${docId(person)}`);
        const doc = docs.get(docId(person)) ?? {days: {}};
        docs.set(docId(person), {days: {...doc.days, [day]: steps}});
        state.writes++; notify();
      },
    };
  }
  return {backend, docs, state};
}
