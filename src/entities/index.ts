// Interfaces
export type {
  IEntity,
  EntityId,
  INeighborAwareEntity,
} from './interfaces/IEntity.ts'
export { EntityState } from './interfaces/IEntity.ts'
export type { IEntityConfig } from './interfaces/IEntityConfig.ts'
export type { IEntityCallbacks } from './interfaces/IEntityCallbacks.ts'
export type { IAggressiveEntityConfig } from './interfaces/IAggressiveEntityConfig.ts'
export { AggressionMode } from './interfaces/IAggressiveEntityConfig.ts'

// Classes
export { EntityManager } from './EntityManager.ts'
export type { EntityManagerConfig } from './EntityManager.ts'
export { Entity } from './Entity.ts'
export { AggressiveEntity } from './AggressiveEntity.ts'
export { DroppedItemEntity } from './DroppedItemEntity.ts'
export type { IDroppedItemConfig } from './DroppedItemEntity.ts'

// Constants
export * from './constants.ts'

// Spawning
export type { EntitySpawnConfig } from './spawning/EntitySpawnConfig.ts'
export { EntitySpawner } from './spawning/EntitySpawner.ts'

// Animals
export { PigEntity } from './animals/pig/index.ts'
export { CowEntity } from './animals/cow/index.ts'
export { RabbitEntity } from './animals/rabbit/index.ts'
export { CaveSlimeEntity } from './animals/cave_slime/index.ts'
export { MonkeyEntity, TreeDetector, type TreePerch } from './animals/monkey/index.ts'

// Enemies
export { SkeletonEntity } from './enemies/skeleton/index.ts'
export { EmberRoachEntity, type IEmberRoachEntityConfig, PillarDetector, type PillarClingPoint } from './enemies/ember_roach/index.ts'
