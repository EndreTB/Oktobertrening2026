/** Felles kilde for deltakere og mål, også for reisens portalgrenser. */
export const PEOPLE = ['Endre', 'Stine', 'Lars', 'Cathrine'] as const;
export type Person = typeof PEOPLE[number];
export const TARGET = 310_000;
export const TEAM_TARGET = TARGET * PEOPLE.length;
