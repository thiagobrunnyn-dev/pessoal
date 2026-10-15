export function personNumber(value: unknown): string {
  return typeof value==='number' && Number.isSafeInteger(value) && value>0 ? String(value).padStart(4,'0') : '';
}
