import { WORLDS } from './worlds';
import { PEOPLE, Person, TARGET } from './participants';
export { PEOPLE, TARGET, TEAM_TARGET } from './participants';
export type { Person } from './participants';
export interface Entry { name: Person; day: string; steps: number; }
export const METERS_PER_STEP = .75;
// Hvem en innlogget bruker er, ut fra navnet foran @ i e-posten. Første treff i PEOPLE vinner.
export function personFromEmail(email: string | null | undefined): Person | null {
  const local = (email || '').split('@')[0].toLowerCase();
  return local ? PEOPLE.find(name => local.includes(name.toLowerCase())) ?? null : null;
}
let todayOverride: string | null = null;
/** Bare for devbaren på localhost: lar appen tro at det er en annen dag. `null` gir ekte dato. */
export function overrideToday(day: string | null) { todayOverride = day; }
export function osloDate(date?: Date): string {
  if (!date && todayOverride) return todayOverride;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date ?? new Date());
}
export function elapsedDays(today: string): number {
  if (today < '2026-10-01') return 0;
  if (today > '2026-10-31') return 31;
  return Number(today.slice(-2));
}
export function validEntry(day: string, steps: number, today: string): boolean {
  return /^2026-10-(0[1-9]|[12][0-9]|3[01])$/.test(day) && day <= today && Number.isInteger(steps) && steps >= 0 && steps <= 100000;
}
/** Nyeste dag først. Null betyr manglende registrering; 0 er et registrert tall. */
export function dailySteps(entries: Entry[], today: string) {
  const valid = entries.filter(e => PEOPLE.includes(e.name) && validEntry(e.day, e.steps, today));
  return Array.from({ length: elapsedDays(today) }, (_, index) => {
    const day = `2026-10-${String(elapsedDays(today) - index).padStart(2, '0')}`;
    const people = PEOPLE.map(name => ({ name, steps: valid.find(e => e.name === name && e.day === day)?.steps ?? null }));
    const registered = people.filter(p => p.steps !== null);
    return { day, people, total: registered.length ? registered.reduce((sum, p) => sum + p.steps!, 0) : null };
  });
}
export function stats(entries: Entry[], name: Person, today: string) {
  const own = entries.filter(e => e.name === name && validEntry(e.day, e.steps, today));
  const total = own.reduce((sum, e) => sum + e.steps, 0);
  const elapsed = elapsedDays(today);
  const todayEntry = own.find(e => e.day === today);
  // Once today is logged, calculate the target for the remaining days after today.
  const remaining = Math.max(0, 31 - elapsed + (elapsed > 0 && elapsed < 32 && today <= '2026-10-31' && !todayEntry ? 1 : 0));
  // I dag teller bare med i snittet når dagen er registrert.
  const averageDays = elapsed - (today <= '2026-10-31' && elapsed && !todayEntry ? 1 : 0);
  const average = averageDays ? Math.round(total / averageDays) : 0;
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
