export const HOUSING_LEVELS={staff:'Staff',operacional:'Operacional',tecnico:'Técnico',encarregado:'Encarregado'} as const;
export type HousingLevel=keyof typeof HOUSING_LEVELS;
