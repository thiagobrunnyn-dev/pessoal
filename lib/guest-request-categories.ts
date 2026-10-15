/** Shared public labels contain no tenant, identity, access or storage data. */
export const GUEST_MAINTENANCE_CATEGORIES = {
  lighting: 'Lâmpadas e iluminação',
  internet: 'Internet e Wi-Fi',
  electrical: 'Elétrica',
  plumbing: 'Hidráulica',
  air_conditioning: 'Ar-condicionado',
  furniture: 'Mobiliário',
  improvement: 'Melhorias no imóvel',
  other: 'Outros',
} as const;
export type GuestMaintenanceCategory = keyof typeof GUEST_MAINTENANCE_CATEGORIES;
export function guestCategoryLabel(value: unknown): string {
  return typeof value === 'string' && Object.hasOwn(GUEST_MAINTENANCE_CATEGORIES, value)
    ? GUEST_MAINTENANCE_CATEGORIES[value as GuestMaintenanceCategory] : 'Não informada';
}
