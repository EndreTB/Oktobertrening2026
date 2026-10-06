import { IMAGE_MAX, THUMB_MAX } from './memories';

/** Lengste side på bildet som deles, og på miniatyren i rutenettet. */
const FULL_SIDE = 1600;
const THUMB_SIDE = 480;

export interface Photo { image: Uint8Array; thumb: Uint8Array; width: number; height: number; /** Objekt-URL – frigjøres av den som viser den. */ preview: string; }

/**
 * Krymper bildet til JPEG i nettleseren før det deles. Å tegne det på nytt fjerner også EXIF-data som
 * posisjon. Nettleseren snur bildet etter EXIF-retningen når det dekodes.
 */
export async function preparePhoto(file: Blob): Promise<Photo> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); }
    catch { throw new Error('Fikk ikke lest bildet. Prøv et JPG- eller PNG-bilde.'); }
    return await photoFrom(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

export async function photoFrom(source: CanvasImageSource, width: number, height: number): Promise<Photo> {
  const full = await encode(source, width, height, FULL_SIDE, IMAGE_MAX);
  const thumb = await encode(source, width, height, THUMB_SIDE, THUMB_MAX);
  return { image: full.bytes, thumb: thumb.bytes, width: full.width, height: full.height, preview: URL.createObjectURL(full.blob) };
}

/** Prøver lavere kvalitet og deretter mindre størrelse til JPEG-en er under grensen. */
async function encode(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, side: number, max: number) {
  if (!sourceWidth || !sourceHeight) throw new Error('Fikk ikke lest bildet. Prøv et JPG- eller PNG-bilde.');
  for (let scale = Math.min(1, side / Math.max(sourceWidth, sourceHeight)); scale * Math.max(sourceWidth, sourceHeight) >= 120; scale *= .75) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) break;
    // Gjennomsiktige PNG-er får hvit bakgrunn i stedet for svart.
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);
    for (const quality of [.82, .7, .58]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= max) return { blob, bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
    }
  }
  throw new Error('Fikk ikke gjort klar bildet. Prøv et annet bilde.');
}
