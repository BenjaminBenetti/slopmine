import type { BiomeType } from '../GenerationConfig.ts'
import { GenerationConfig } from '../GenerationConfig.ts'
import type { BiomeGenerator } from '../BiomeGenerator.ts'
import { PlainsGenerator } from './PlainsGenerator.ts'
import { GrassyHillsGenerator } from './GrassyHillsGenerator.ts'

/**
 * Information about a registered biome.
 */
export interface BiomeRegistration {
  readonly type: BiomeType
  readonly frequency: number
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

  constructor() {
    this.registerDefaultBiomes()
  }

  /**
   * Register default biomes.
   */
  private registerDefaultBiomes(): void {
    this.register({
      type: 'plains',
      frequency: 1.0,
      createGenerator: (config) => new PlainsGenerator(config),
    })

    this.register({
      type: 'grassy-hills',
      frequency: 1.0,
      createGenerator: (config) => new GrassyHillsGenerator(config),
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
   */
  private recalculateTotalFrequency(): void {
    this.totalFrequency = 0
    for (const biome of this.biomes.values()) {
      this.totalFrequency += biome.frequency
    }
  }

  /**
   * Get all registered biomes.
   */
  getAll(): BiomeRegistration[] {
    return Array.from(this.biomes.values())
  }

  /**
   * Get a specific biome registration.
   */
  get(type: BiomeType): BiomeRegistration | undefined {
    return this.biomes.get(type)
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
