import type { IEntity, EntityId } from './IEntity.ts'

/**
 * Callbacks for entity lifecycle events.
 * Used by systems that need to react to entity changes.
 */
export interface IEntityCallbacks {
  /** Called after an entity is added and spawned */
  onEntityAdded?(entity: IEntity): void

  /** Called before an entity is removed and despawned */
  onEntityRemoved?(entityId: EntityId): void

  /** Called when an entity's mesh changes (for scene updates) */
  onEntityMeshChanged?(entity: IEntity): void
}
