import * as THREE from 'three'
import { Entity } from './Entity.ts'
import type { IBlockEntity } from './interfaces/IBlockEntity.ts'
import type { IWorldCoordinate, IChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import { worldToChunk } from '../world/coordinates/CoordinateUtils.ts'

/**
 * Base class for block entities - entities bound to a specific block position.
 *
 * Block entities are special case entities that:
 * - Are tied to a world block position
 * - Despawn when their chunk unloads (not distance-based)
 * - Have no physics (block provides collision)
 * - May or may not have a visual mesh (block already rendered by chunk mesh)
 *
 * Subclasses should:
 * 1. Define readonly type = 'their_type'
 * 2. Override update() for per-frame behavior
 * 3. Optionally override createMesh() if visual effects are needed
 * 4. Optionally override onSpawn()/onDespawn()/dispose() for lifecycle hooks
 */
export abstract class BlockEntity extends Entity implements IBlockEntity {
  readonly blockPosition: IWorldCoordinate
  readonly chunkCoordinate: IChunkCoordinate
  readonly isBlockEntity = true as const

  constructor(type: string, blockPosition: IWorldCoordinate) {
    super(type, {
      position: new THREE.Vector3(
        Number(blockPosition.x) + 0.5,
        Number(blockPosition.y) + 0.5,
        Number(blockPosition.z) + 0.5
      ),
      hasPhysics: false, // Block entities don't need physics - block provides collision
    })
    this.blockPosition = { ...blockPosition }
    this.chunkCoordinate = worldToChunk(blockPosition)
  }

  /**
   * Default: no mesh (block already rendered by chunk mesh).
   * Override in subclass if visual effects are needed (particles, etc.).
   */
  protected createMesh(): THREE.Object3D | null {
    return null
  }
}
