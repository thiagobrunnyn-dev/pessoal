/** Reuse the application's sanitizePhoto implementation; never persist the input File. */
export type PhotoSanitizer = (bytes: ArrayBuffer | Uint8Array, contentType: string) => Uint8Array;
export class PropertyFrontPhotoError extends Error {}
export const FRONT_PHOTO_LIMIT = 4 * 1024 * 1024;
export const FRONT_PHOTO_FORM_LIMIT = FRONT_PHOTO_LIMIT + 32 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function readPropertyFrontPhoto(form: FormData, sanitizePhoto: PhotoSanitizer) {
  const values = form.getAll('front_photo');
  if (values.length !== 1 || !(values[0] instanceof File) || !values[0].size) {
    throw new PropertyFrontPhotoError('Escolha somente uma foto da frente do imóvel.');
  }
  const file = values[0];
  if (!TYPES.has(file.type) || file.size > FRONT_PHOTO_LIMIT) {
    throw new PropertyFrontPhotoError('Use uma foto JPG, PNG ou WebP de até 4 MB.');
  }
  let bytes: Uint8Array;
  try {
    bytes = sanitizePhoto(await file.arrayBuffer(), file.type);
    // The shared sanitizer preserves APNG. A property identification photo is static.
    if (file.type === 'image/png') {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let at = 8; at + 12 <= bytes.length;) {
        const size = view.getUint32(at);
        if (size > bytes.length - at - 12) throw new Error('Invalid chunk');
        const name = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
        if (['acTL', 'fcTL', 'fdAT'].includes(name)) throw new Error('Animated image');
        at += size + 12;
      }
    }
  } catch {
    throw new PropertyFrontPhotoError('Não foi possível preparar a foto sem metadados. Escolha JPG, PNG ou WebP estática.');
  }
  if (!bytes.length || bytes.length > FRONT_PHOTO_LIMIT) throw new PropertyFrontPhotoError('A foto preparada ultrapassa o limite. Escolha outra.');
  const copy = new Uint8Array(bytes);
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', copy))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  return {bytes: copy, contentType: file.type, size: copy.length, sha256};
}

export const PRIVATE_FRONT_PHOTO_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'inline',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;
