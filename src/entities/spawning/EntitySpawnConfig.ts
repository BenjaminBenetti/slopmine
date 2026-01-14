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
   * Factory function to create the entity at the given position.
   */
  createEntity: (position: THREE.Vector3) => IEntity
}
