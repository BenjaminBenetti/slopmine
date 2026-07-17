import type { BiomeType } from '../GenerationConfig.ts'
import { GenerationConfig } from '../GenerationConfig.ts'
import type { BiomeGenerator } from '../BiomeGenerator.ts'
import { PlainsGenerator } from './PlainsGenerator.ts'
import { GrassyHillsGenerator } from './GrassyHillsGenerator.ts'
import { DesertGenerator } from './DesertGenerator.ts'
import { VolcanicGenerator } from './VolcanicGenerator.ts'
import { JungleGenerator } from './JungleGenerator.ts'
import { SwampGenerator } from './SwampGenerator.ts'
import { PineForestGenerator } from './PineForestGenerator.ts'
import { CoastalRainforestGenerator } from './CoastalRainforestGenerator.ts'
import { HellGenerator } from './HellGenerator.ts'

/**
 * Information about a registered biome.
 */
export interface BiomeRegistration {
  readonly type: BiomeType
  readonly frequency: number
  /** Which vertical layer this biome belongs to. 0 = underground, 1 = surface. */
  readonly layer: 0 | 1
  createGenerator(config: GenerationConfig): BiomeGenerator
}

/**
 * Size of a biome region in chunks (16x16 chunks = 512x512 blocks).
 */
export const BIOME_REGION_SIZE = 16

/**
 * Registry of all available biomes with frequency-weighted selection.
 * Biome regions are 16x16 chunks in size.
 */
export class BiomeRegistry {
  private readonly biomes: Map<BiomeType, BiomeRegistration> = new Map()
  private totalFrequency: number = 0
  private readonly layerFrequencies: Map<0 | 1, number> = new Map([
    [0, 0],
    [1, 0],
  ])
  // Cached per-layer biome arrays, rebuilt on register(). Avoids allocating two
  // arrays + a closure on every getBiomesForLayer() call, which sits on hot
  // main-thread paths (skybox blend, biome minimap).
  private readonly layerBiomes: Map<0 | 1, BiomeRegistration[]> = new Map([
    [0, []],
    [1, []],
  ])

  constructor() {
    this.registerDefaultBiomes()
  }

  /**
   * Register default biomes.
   * Frequencies are read from the biome's properties for consistency.
   * Surface biomes (layer 1) and underground biomes (layer 0) are registered separately.
   */
  private registerDefaultBiomes(): void {
    // Create temporary generators to read their frequency properties
    const defaultConfig = new GenerationConfig({ seed: 0 })

    // Layer 1 (surface) biomes
    const plainsGen = new PlainsGenerator(defaultConfig)
    this.register({
      type: 'plains',
      frequency: plainsGen.getBiomeProperties().frequency,
      layer: 1,
      createGenerator: (config) => new PlainsGenerator(config),
    })

    const hillsGen = new GrassyHillsGenerator(defaultConfig)
    this.register({
      type: 'grassy-hills',
      frequency: hillsGen.getBiomeProperties().frequency,
      layer: 1,
      createGenerator: (config) => new GrassyHillsGenerator(config),
    })

    const desertGen = new DesertGenerator(defaultConfig)
    this.register({
      type: 'desert',
      frequency: desertGen.getBiomeProperties().frequency,
      layer: 1,
      createGenerator: (config) => new DesertGenerator(config),
    })

    const volcanicGen = new VolcanicGenerator(defaultConfig)
    this.register({
      type: 'volcanic',
      frequency: volcanicGen.getBiomeProperties().frequency,
      layer: 1,
      createGenerator: (config) => new VolcanicGenerator(config),
    })

    const jungleGen = new JungleGenerator(defaultConfig)
    this.register({
      type: 'jungle',
      frequency: jungleGen.getBiomeProperties().frequency,
      layer: 1,
      createGenerator: (config) => new JungleGenerator(config),
    })

    const swampGen = new SwampGenerator(defaultConfig)
    this.register({
      type: 'swamp',
      frequency: swampGen.getBiomeProperties().frequency,
      layer: 1,
      createGenerator: (config) => new SwampGenerator(config),
    })

    const pineForestGen = new PineForestGenerator(defaultConfig)
    this.register({
      type: 'pine-forest',
      frequency: pineForestGen.getBiomeProperties().frequency,
      layer: 1,
      createGenerator: (config) => new PineForestGenerator(config),
    })

    const coastalRainforestGen = new CoastalRainforestGenerator(defaultConfig)
    this.register({
      type: 'coastal-rainforest',
      frequency: coastalRainforestGen.getBiomeProperties().frequency,
      layer: 1,
      createGenerator: (config) => new CoastalRainforestGenerator(config),
    })

    // Layer 0 (underground) biomes
    const hellGen = new HellGenerator(defaultConfig)
    this.register({
      type: 'hell',
      frequency: hellGen.getBiomeProperties().frequency,
      layer: 0,
      createGenerator: (config) => new HellGenerator(config),
    })
  }

  /**
   * Register a biome.
   */
  register(registration: BiomeRegistration): void {
    this.biomes.set(registration.type, registration)
    this.recalculateTotalFrequency()
  }

  /**
   * Recalculate total frequency for weighted selection.
   * Also calculates per-layer frequencies for layer-specific selection.
   */
  private recalculateTotalFrequency(): void {
    this.totalFrequency = 0
    this.layerFrequencies.set(0, 0)
    this.layerFrequencies.set(1, 0)

    // Rebuild the cached per-layer arrays in place.
    const layer0 = this.layerBiomes.get(0)!
    const layer1 = this.layerBiomes.get(1)!
    layer0.length = 0
    layer1.length = 0

    for (const biome of this.biomes.values()) {
      this.totalFrequency += biome.frequency
      const currentLayerFreq = this.layerFrequencies.get(biome.layer) ?? 0
      this.layerFrequencies.set(biome.layer, currentLayerFreq + biome.frequency)
      ;(biome.layer === 0 ? layer0 : layer1).push(biome)
    }
  }

  /**
   * Get all registered biomes.
   */
  getAll(): BiomeRegistration[] {
    return Array.from(this.biomes.values())
  }

  /**
   * Get all biomes for a specific layer.
   * Returns a cached array (rebuilt on register()); callers must not mutate it.
   * @param layer - 0 for underground, 1 for surface
   */
  getBiomesForLayer(layer: 0 | 1): BiomeRegistration[] {
    return this.layerBiomes.get(layer) ?? []
  }

  /**
   * Get a specific biome registration.
   */
  get(type: BiomeType): BiomeRegistration | undefined {
    return this.biomes.get(type)
  }

  /**
   * Deterministically select a biome for a specific layer at a biome region.
   * Uses frequency-weighted selection within the layer.
   *
   * @param biomeRegionX - X coordinate of the biome region (chunkX / 16)
   * @param biomeRegionZ - Z coordinate of the biome region (chunkZ / 16)
   * @param seed - World seed for determinism
   * @param layer - Which layer to select from (0 = underground, 1 = surface)
   * @returns The selected biome type
   */
  selectBiomeForLayer(
    biomeRegionX: number,
    biomeRegionZ: number,
    seed: number,
    layer: 0 | 1
  ): BiomeType {
    const layerBiomes = this.getBiomesForLayer(layer)
    if (layerBiomes.length === 0) {
      // Fallback to any biome if layer is empty
      return this.selectBiome(biomeRegionX, biomeRegionZ, seed)
    }

    const layerTotalFreq = this.layerFrequencies.get(layer) ?? 0
    if (layerTotalFreq === 0) {
      return layerBiomes[0].type
    }

    // Use a different seed offset for each layer to avoid correlation
    const hash = this.hashRegion(biomeRegionX, biomeRegionZ, seed + layer * 12345)
    const normalized = (hash & 0x7fffffff) / 0x7fffffff

    let accumulated = 0
    for (const biome of layerBiomes) {
      accumulated += biome.frequency / layerTotalFreq
      if (normalized < accumulated) {
        return biome.type
      }
    }

    return layerBiomes[layerBiomes.length - 1].type
  }

  /**
   * Deterministically select a biome for a biome region based on seed.
   * Uses frequency-weighted selection.
   *
   * @param biomeRegionX - X coordinate of the biome region (chunkX / 16)
   * @param biomeRegionZ - Z coordinate of the biome region (chunkZ / 16)
   * @param seed - World seed for determinism
   * @returns The selected biome type
   */
  selectBiome(biomeRegionX: number, biomeRegionZ: number, seed: number): BiomeType {
    // Hash the region coordinates with the seed for determinism
    const hash = this.hashRegion(biomeRegionX, biomeRegionZ, seed)

    // Normalize to 0-1 range
    const normalized = (hash & 0x7fffffff) / 0x7fffffff

    // Use frequency-weighted selection
    let accumulated = 0
    for (const biome of this.biomes.values()) {
      accumulated += biome.frequency / this.totalFrequency
      if (normalized < accumulated) {
        return biome.type
      }
    }

    // Fallback to last biome (shouldn't happen with proper normalization)
    const allBiomes = this.getAll()
    return allBiomes[allBiomes.length - 1].type
  }

  /**
   * Get the biome region coordinates for a chunk.
   */
  getRegionCoords(chunkX: number, chunkZ: number): { regionX: number; regionZ: number } {
    return {
      regionX: Math.floor(chunkX / BIOME_REGION_SIZE),
      regionZ: Math.floor(chunkZ / BIOME_REGION_SIZE),
    }
  }

  /**
   * Get the position of a chunk within its biome region (0-15).
   */
  getLocalChunkCoords(chunkX: number, chunkZ: number): { localX: number; localZ: number } {
    // Handle negative coordinates properly
    const localX = ((chunkX % BIOME_REGION_SIZE) + BIOME_REGION_SIZE) % BIOME_REGION_SIZE
    const localZ = ((chunkZ % BIOME_REGION_SIZE) + BIOME_REGION_SIZE) % BIOME_REGION_SIZE
    return { localX, localZ }
  }

  /**
   * Hash function for biome region coordinates.
   * Uses the same algorithm as TerrainGenerator.positionRandom for consistency.
   */
  private hashRegion(x: number, z: number, seed: number): number {
    let hash = seed ^ (x * 73856093) ^ (z * 19349663)
    hash = ((hash ^ (hash >>> 16)) * 0x85ebca6b) >>> 0
    hash = ((hash ^ (hash >>> 13)) * 0xc2b2ae35) >>> 0
    return (hash ^ (hash >>> 16)) >>> 0
  }
}

/**
 * Singleton instance of the biome registry.
 */
export const biomeRegistry = new BiomeRegistry()
