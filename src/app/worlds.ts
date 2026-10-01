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
export const LIGHT_CYCLE = 180000;
export const WORLDS: readonly JourneyWorld[] = [
  { id: 'mountain', title: 'Oktobertoppen', subtitle: 'Det store begynner med det lille.', description: 'Følg den gylne stien gjennom høstskogen. På toppen finner dere en portal. Hva om fjellet bare var begynnelsen?', start: 0, end: 180000, color: '#d9ecaa', background: '#192820', icon: '△', mission: 'Bestig fjellet og finn portalen på toppen.' },
  { id: 'forest', title: 'Kjempenes skog', subtitle: 'Plutselig er dere mindre enn en kongle.', description: 'Portalen krympet dere! Gå mellom lysende sopper, over enorme røtter og under tretopper høye som skyskrapere. I en dråpe på et blad venter neste verden.', start: 180000, end: 360000, color: '#a7edcf', background: '#102e2a', icon: '♧', mission: 'Kryss røttene og finn den magiske vanndråpen.' },
  { id: 'body', title: 'På innsiden', subtitle: 'En hel verden i hvert hjerteslag.', description: 'Dere seiler inn i en fantasiversjon av kroppen. Røde blodceller driver forbi som små farkoster. Følg pulsen gjennom de glødende buene og finn cellens hemmelige inngang.', start: 360000, end: 540000, color: '#ffc0b7', background: '#331928', icon: '♡', mission: 'Følg pulsen helt frem til celleporten.' },
  { id: 'micro', title: 'Det usynlige riket', subtitle: 'Små skapninger. Et grenseløst eventyr.', description: 'Nå er dere mikroskopiske oppdagere. Følg membranens folder inn mellom små organeller, mot den lysende cellekjernen. Den minste verdenen gjemmer den største overraskelsen.', start: 540000, end: 720000, color: '#b9b3ff', background: '#201b3e', icon: '◌', mission: 'Følg veien inn til den lysende cellekjernen.' },
  { id: 'cosmos', title: 'Stjernetreet', subtitle: 'Det minste og det største hører sammen.', description: 'Gjennom mikroskopet åpner verdensrommet seg. Følg lyktene gjennom månehagen og den svingende stien opp mellom grenene. Samle de siste skrittene og tenn stjernen i toppen. Hele oktober har ført dere hit.', start: 720000, end: 930000, color: '#ffe5a6', background: '#111d38', icon: '✧', mission: 'Tenn stjernen i toppen av Stjernetreet.' },
  { id: 'light', title: 'Bortenfor lyset', subtitle: 'Dere kom i mål. Men reisen har ingen slutt.', description: '930 000 skritt åpnet døren til noe helt annet. Her finnes ingen siste topp, bare svevende stier, rolige stjerner og et lys som alltid ligger litt lenger fremme. Hvert nye skritt lar en ny del av verdenen vokse frem.', start: 930000, end: Infinity, color: '#fff0c9', background: '#39364e', icon: '∞', mission: 'Følg lyset. Det finnes alltid en ny sti.' },
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
  if (b >= 930000) {
    const light = WORLDS[WORLDS.length - 1];
    let cursor = Math.max(a, 930000);
    do {
      const cycleStart = 930000 + Math.floor((cursor - 930000) / LIGHT_CYCLE) * LIGHT_CYCLE;
      const end = Math.min(b, cycleStart + LIGHT_CYCLE);
      legs.push({ world: light, from: (cursor - cycleStart) / LIGHT_CYCLE, to: (end - cycleStart) / LIGHT_CYCLE, startSteps: cursor, endSteps: end });
      cursor = end;
    } while (cursor < b);
    // At an exact boundary, reveal the next stretch after completing the old one.
    if (b > 930000 && (b - 930000) % LIGHT_CYCLE === 0) legs.push({world: light, from: 0, to: 0, startSteps: b, endSteps: b});
  }
  return legs;
}
