import { MineshaftFeature } from './MineshaftFeature.ts'

/**
 * The overworld's abandoned mineshafts: one shared settings object, listed in
 * every overworld biome's features (a network may cross a biome border, and
 * features run only for the chunk's primary biome - equal settings everywhere
 * keep it whole).
 */
export function overworldMineshafts(): MineshaftFeature {
  return new MineshaftFeature({ salt: 4417, chance: 0.55, minY: 168, maxY: 205 })
}
