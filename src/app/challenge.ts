import { WORLDS } from './worlds';
export const PEOPLE = ['Endre', 'Stine', 'Lars'] as const;
export type Person = typeof PEOPLE[number];
export interface Entry { name: Person; day: string; steps: number; }
export const TARGET = 310_000;
export const TEAM_TARGET = TARGET * 3;
export const METERS_PER_STEP = .75;
// Hvem en innlogget bruker er, ut fra navnet foran @ i e-posten. Første treff i PEOPLE vinner.
export function personFromEmail(email: string | null | undefined): Person | null {
  const local = (email || '').split('@')[0].toLowerCase();
  return local ? PEOPLE.find(name => local.includes(name.toLowerCase())) ?? null : null;
}
export function osloDate(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function elapsedDays(today: string): number {
  if (today < '2026-10-01') return 0;
  if (today > '2026-10-31') return 31;
  return Number(today.slice(-2));
}
export function validEntry(day: string, steps: number, today: string): boolean {
  return /^2026-10-(0[1-9]|[12][0-9]|3[01])$/.test(day) && day <= today && Number.isInteger(steps) && steps >= 0 && steps <= 100000;
}
export function stats(entries: Entry[], name: Person, today: string) {
  const own = entries.filter(e => e.name === name && validEntry(e.day, e.steps, today));
  const total = own.reduce((sum, e) => sum + e.steps, 0);
  const elapsed = elapsedDays(today);
  const todayEntry = own.find(e => e.day === today);
  // Once today is logged, calculate the target for the remaining days after today.
  const remaining = Math.max(0, 31 - elapsed + (elapsed > 0 && elapsed < 32 && today <= '2026-10-31' && !todayEntry ? 1 : 0));
  const average = elapsed ? Math.round(total / elapsed) : 0;
  const needed = remaining ? Math.ceil(Math.max(0, TARGET - total) / remaining) : 0;
  let streak = 0;
  let end = elapsed;
  if (todayEntry && todayEntry.steps < 10000) end = 0;
  else if (today <= '2026-10-31' && elapsed && !todayEntry) end--;
  for (let day = end; day >= 1; day--) {
    if (!own.some(e => Number(e.day.slice(-2)) === day && e.steps >= 10000)) break;
    streak++;
  }
  return { total, average, needed, remaining, streak, logged: own.length, progress: Math.min(100, total / TARGET * 100), today: todayEntry?.steps ?? null, km: total * METERS_PER_STEP / 1000 };
}
export const CHAPTERS = WORLDS.map((world, index) => ({
  ...world, number: String(index + 1).padStart(2, '0'), km: world.start * .00075,
  place: world.id === 'light' ? 'DEN UENDELIGE REISEN' : 'EN NY VERDEN',
}));
