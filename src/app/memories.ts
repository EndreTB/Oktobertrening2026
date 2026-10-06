import { PEOPLE, Person } from './participants';

/**
 * Minner: bilder deltakerne deler fra turene. Hvert minne er to dokumenter med samme id, så rutenettet
 * ikke må hente alle bildene i full størrelse:
 * - `oktober-2026-minner/{id}`: `{ person, day, caption, thumb, width, height, createdAt }` – med miniatyren.
 * - `oktober-2026-bilder/{id}`: `{ person, image }` – hentes først når noen åpner bildet.
 * Bildene er JPEG-bytes i Firestore, siden Cloud Storage krever Blaze-planen. Grensene står også i firestore.rules.
 */
export const MEMORIES = 'oktober-2026-minner';
export const IMAGES = 'oktober-2026-bilder';
export const CAPTION_MAX = 280;
/** Et Firestore-dokument kan være maks 1 MiB. */
export const IMAGE_MAX = 900 * 1024;
export const THUMB_MAX = 80 * 1024;

export interface Memory { id: string; name: Person; day: string; caption: string; thumb: string; width: number; height: number; created: number; }
/** Et bilde som er krympet og gjort klart til deling (se photo.ts). `width` og `height` gjelder `image`. */
export interface NewMemory { id: string; day: string; caption: string; image: Uint8Array; thumb: Uint8Array; width: number; height: number; }

export const validMemoryDay = (day: string, today: string) => /^2026-10-(0[1-9]|[12][0-9]|3[01])$/.test(day) && day <= today;
const validSide = (side: unknown) => Number.isInteger(side) && (side as number) > 0 && (side as number) <= 4000;

export function validMemory(memory: NewMemory, today: string): boolean {
  return validMemoryDay(memory.day, today) && memory.caption.length <= CAPTION_MAX
    && memory.image.length > 0 && memory.image.length <= IMAGE_MAX
    && memory.thumb.length > 0 && memory.thumb.length <= THUMB_MAX
    && validSide(memory.width) && validSide(memory.height);
}

/**
 * Gjør dokumentene om til minner, nyeste dag og nyeste deling først. Backenden har allerede gjort
 * miniatyren om til en data-URL og `createdAt` om til millisekunder. Ukjente personer og ugyldige data hoppes over.
 */
export function toMemories(docs: { id: string; data: unknown }[]): Memory[] {
  return docs.flatMap(({ id, data }) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const name = PEOPLE.find(person => person.toLowerCase() === d['person']);
    const { day, caption, thumb, width, height, createdAt } = d;
    if (!name || typeof day !== 'string' || !validMemoryDay(day, '2026-10-31') || typeof caption !== 'string'
      || typeof thumb !== 'string' || !thumb.startsWith('data:image/jpeg;base64,') || !validSide(width) || !validSide(height)) return [];
    return [{ id, name, day, caption, thumb, width: width as number, height: height as number, created: typeof createdAt === 'number' ? createdAt : 0 }];
  }).sort((a, b) => b.day.localeCompare(a.day) || b.created - a.created);
}

export function jpegUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}
