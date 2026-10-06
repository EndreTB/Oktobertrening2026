import { PEOPLE, TEAM_TARGET } from './participants';

/** Fictional worlds, unlocked by the group's real combined October steps. */
export interface JourneyWorld {
  id: 'mountain' | 'forest' | 'body' | 'micro' | 'cosmos' | 'light';
  title: string;
  subtitle: string;
  description: string;
  start: number;
  end: number;
  color: string;
  background: string;
  icon: string;
  mission: string;
}
export const LIGHT_CYCLE = 60_000 * PEOPLE.length;
// Opprinnelig 50 000 skritt for tre deltakere; behold samme innsats per person.
export const LIGHT_GLINT = Math.round(50_000 / 3 * PEOPLE.length);
export const WORLDS: readonly JourneyWorld[] = [
  { id: 'mountain', title: 'Oktobertoppen', subtitle: 'Det store begynner med det lille.', description: 'Følg den gylne stien gjennom høstskogen. På toppen finner dere en portal. Hva om fjellet bare var begynnelsen?', start: 0, end: 60_000 * PEOPLE.length, color: '#d9ecaa', background: '#192820', icon: '△', mission: 'Bestig fjellet og finn portalen på toppen.' },
  { id: 'forest', title: 'Kjempenes skog', subtitle: 'Høyt over skogbunnen. Langs grenene til en kjempe.', description: 'Portalen åpner seg på en enorm gren, høyt oppe i et eldgammelt tre. Følg den mosegrodde grenen inn mot stammen og rundt treet, stig opp ett nivå og gå ut på en ny gren. Verken toppen eller bunnen er i sikte. I en vanndråpe venter neste verden.', start: 60_000 * PEOPLE.length, end: 120_000 * PEOPLE.length, color: '#a7edcf', background: '#102e2a', icon: '♧', mission: 'Følg grenen rundt stammen og ut mot vanndråpen.' },
  { id: 'body', title: 'Korallriket', subtitle: 'En liten dykker. Et hav av kjemper.', description: 'Dere er bittesmå i et hav av gigantiske koraller. Gå på brede, levende korallplater og følg tykke forgreninger opp gjennom rosa, lilla og turkise korallkjemper. Enorme havvifter og rørkoraller reiser seg fra dypet. Høyt over dere venter neste portal.', start: 120_000 * PEOPLE.length, end: 180_000 * PEOPLE.length, color: '#9be8ef', background: '#073247', icon: '≈', mission: 'Klatre fra korall til korall, høyt over havdypet.' },
  { id: 'micro', title: 'Urverkets hjerte', subtitle: 'Små vandrere. Et urverk uten ende.', description: 'Dere er bittesmå inne i et gigantisk, gammelt urverk. Følg tannhjul, pendler og messingbroer opp til en stjerneklokke som åpner neste portal.', start: 180_000 * PEOPLE.length, end: 240_000 * PEOPLE.length, color: '#efcc87', background: '#241c18', icon: '⚙', mission: 'Følg messingbroene opp til stjerneklokken og åpne neste portal.' },
  { id: 'cosmos', title: 'Stjernetreet', subtitle: 'Det minste og det største hører sammen.', description: 'Gjennom stjerneklokkens portal åpner verdensrommet seg. Følg lyktene gjennom månehagen og den svingende stien opp mellom grenene. Samle de siste skrittene og tenn stjernen i toppen. Hele oktober har ført dere hit.', start: 240_000 * PEOPLE.length, end: TEAM_TARGET, color: '#ffe5a6', background: '#111d38', icon: '✧', mission: 'Tenn stjernen i toppen av Stjernetreet.' },
  { id: 'light', title: 'Bortenfor lyset', subtitle: 'Dere kom i mål. Men reisen har ingen slutt.', description: `${new Intl.NumberFormat('nb-NO').format(TEAM_TARGET)} skritt åpnet døren til noe helt annet. Her finnes ingen siste topp, bare svevende stier, rolige stjerner og et lys som alltid ligger litt lenger fremme. Hvert nye skritt lar en ny del av verdenen vokse frem.`, start: TEAM_TARGET, end: Infinity, color: '#fff0c9', background: '#39364e', icon: '∞', mission: 'Følg lyset. Det finnes alltid en ny sti.' },
];
export function clampSteps(steps: number): number { return Number.isFinite(steps) ? Math.max(0, steps) : 0; }
export function worldAt(steps: number): JourneyWorld {
  return [...WORLDS].reverse().find(world => clampSteps(steps) >= world.start) ?? WORLDS[0];
}
export function worldProgress(steps: number): number {
  const world = worldAt(steps);
  return world.id === 'light' ? ((clampSteps(steps) - world.start) % LIGHT_CYCLE) / LIGHT_CYCLE : (clampSteps(steps) - world.start) / (world.end - world.start);
}
export interface JourneyLeg { world: JourneyWorld; from: number; to: number; startSteps: number; endSteps: number; }
/** Preserve the summit at each boundary, instead of teleporting past intervening worlds. */
export function journeyLegs(from: number, to: number): JourneyLeg[] {
  const a = clampSteps(from), b = clampSteps(to);
  if (b <= a) return [{ world: worldAt(b), from: worldProgress(b), to: worldProgress(b), startSteps: b, endSteps: b }];
  const legs = WORLDS.filter(world => world.id !== 'light' && world.end > a && world.start <= b).map(world => ({
    world,
    from: Math.max(0, (a - world.start) / (world.end - world.start)),
    to: Math.min(1, (b - world.start) / (world.end - world.start)),
    startSteps: Math.max(a, world.start), endSteps: Math.min(b, world.end),
  }));
  if (b >= TEAM_TARGET) {
    const light = WORLDS[WORLDS.length - 1];
    let cursor = Math.max(a, TEAM_TARGET);
    do {
      const cycleStart = TEAM_TARGET + Math.floor((cursor - TEAM_TARGET) / LIGHT_CYCLE) * LIGHT_CYCLE;
      const end = Math.min(b, cycleStart + LIGHT_CYCLE);
      legs.push({ world: light, from: (cursor - cycleStart) / LIGHT_CYCLE, to: (end - cycleStart) / LIGHT_CYCLE, startSteps: cursor, endSteps: end });
      cursor = end;
    } while (cursor < b);
    // At an exact boundary, reveal the next stretch after completing the old one.
    if (b > TEAM_TARGET && (b - TEAM_TARGET) % LIGHT_CYCLE === 0) legs.push({world: light, from: 0, to: 0, startSteps: b, endSteps: b});
  }
  return legs;
}
