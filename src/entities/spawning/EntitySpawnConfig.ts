import type * as THREE from 'three'
import type { IEntity } from '../interfaces/IEntity.ts'

/**
 * Configuration for entity spawning in a biome.
 */
export interface EntitySpawnConfig {
  /** Entity type identifier (e.g., 'pig', 'zombie') */
  entityType: string

  /**
   * Average spawns per chunk.
   * 0.5 = one entity per 2 chunks on average
   * 1.0 = one entity per chunk on average
   * 2.0 = two entities per chunk on average
   */
  spawnRate: number

  /** Minimum Y level for spawning (defaults to 0) */
  minY?: number

  /** Maximum Y level for spawning (defaults to 1024) */
  maxY?: number

  /**
   * Maximum entities of this type within spawn radius.
   * Prevents overcrowding of a specific entity type.
   */
  maxNearby?: number

  /**
   * Maximum light level for spawning (0-15).
   * Entity will only spawn if light level at position is <= this value.
   * Useful for cave-dwelling creatures that avoid light.
   */
  maxLightLevel?: number

  /**
   * Minimum light level for spawning (0-15).
   * Entity will only spawn if light level at position is >= this value.
   * Useful for surface creatures that require daylight.
   */
  minLightLevel?: number

  /**
   * Block IDs the entity may spawn on.
   * When specified, the solid ground block directly beneath the spawn
   * position must be one of these (e.g. sand for beach creatures).
   * When omitted, any ground block is valid.
   */
  validGroundBlocks?: number[]

  /**
   * Factory function to create the entity at the given position.
   */
  createEntity: (position: THREE.Vector3) => IEntity
}
