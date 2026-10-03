import { Entry, PEOPLE, Person } from './challenge';

/**
 * Hva denne nettleseren sist så av gjengens skritt. Kommer du tilbake og de andre har gått videre,
 * spilles reisen av fra dit du var – med verdenene som ble oppdaget mens du var borte.
 */
export interface Seen { total: number; people: Record<Person, number>; }
export const SEEN_KEY = 'oktober-2026-sett';

export function snapshot(entries: Entry[]): Seen {
  const people = Object.fromEntries(PEOPLE.map(name => [name, 0])) as Record<Person, number>;
  for (const e of entries) if (PEOPLE.includes(e.name)) people[e.name] += e.steps;
  return { total: Object.values(people).reduce((sum, steps) => sum + steps, 0), people };
}

export function readSeen(storage: Pick<Storage, 'getItem'> = localStorage): Seen | null {
  try {
    const data = JSON.parse(storage.getItem(SEEN_KEY) || 'null');
    if (!data || !Number.isFinite(data.total) || data.total < 0) return null;
    const people = Object.fromEntries(PEOPLE.map(name => [name, Number.isFinite(data.people?.[name]) ? data.people[name] : 0])) as Record<Person, number>;
    return { total: data.total, people };
  } catch { return null; }
}

export function writeSeen(seen: Seen, storage: Pick<Storage, 'setItem'> = localStorage) {
  try { storage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* Uten lagring vises bare ingen «mens du var borte». */ }
}

/** Hvem som har gått siden sist, mest først. Tom liste betyr ingenting nytt. */
export function sinceSeen(seen: Seen, now: Seen): { name: Person; steps: number }[] {
  return PEOPLE.map(name => ({ name, steps: now.people[name] - seen.people[name] }))
    .filter(p => p.steps > 0).sort((a, b) => b.steps - a.steps);
}
