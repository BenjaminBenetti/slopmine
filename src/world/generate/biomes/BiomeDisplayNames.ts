import type { BiomeType } from '../GenerationConfig.ts'

/** Player-facing biome names (journal, toasts, HUD). */
export const BIOME_DISPLAY_NAMES: Record<BiomeType, string> = {
  plains: 'Plains',
  'grassy-hills': 'Grassy Hills',
  desert: 'Desert',
  volcanic: 'Volcanic Highlands',
  jungle: 'Jungle',
  swamp: 'Swamp',
  'pine-forest': 'Pine Forest',
  'coastal-rainforest': 'Coastal Rainforest',
  ocean: 'Ocean',
  hell: 'Molten Wastes',
  ossuary: 'The Ossuary',
  'ember-grove': 'Ember Grove',
  'crystal-abyss': 'Crystal Abyss',
  cocytus: 'Cocytus',
}

export function getBiomeDisplayName(biome: string): string {
  return (BIOME_DISPLAY_NAMES as Record<string, string>)[biome] ?? biome
}
