import type { IEntity } from './IEntity.ts'
import type { IWorldCoordinate, IChunkCoordinate } from '../../world/interfaces/ICoordinates.ts'

/**
 * Interface for block entities - entities that are bound to a specific block position.
 *
 * Block entities are special case entities that:
 * - Are tied to a world block position
 * - Despawn when their chunk unloads (not distance-based)
 * - Typically have no physics (block provides collision)
 * - May or may not have a visual mesh
 */
export interface IBlockEntity extends IEntity {
  /** World coordinate of the block this entity belongs to */
  readonly blockPosition: IWorldCoordinate

  /** Chunk this block entity belongs to (for chunk-based despawning) */
  readonly chunkCoordinate: IChunkCoordinate

  /** Marker to identify block entities (for skipping distance-based despawn) */
  readonly isBlockEntity: true
}

/**
 * Check if an entity is a block entity.
 */
export function isBlockEntity(entity: IEntity): entity is IBlockEntity {
  return 'isBlockEntity' in entity && entity.isBlockEntity === true
}
