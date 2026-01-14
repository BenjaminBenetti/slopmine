// Interfaces
export type {
  IEntity,
  EntityId,
  INeighborAwareEntity,
} from './interfaces/IEntity.ts'
export { EntityState } from './interfaces/IEntity.ts'
export type { IEntityConfig } from './interfaces/IEntityConfig.ts'
export type { IEntityCallbacks } from './interfaces/IEntityCallbacks.ts'

// Classes
export { EntityManager } from './EntityManager.ts'
export type { EntityManagerConfig } from './EntityManager.ts'
export { Entity } from './Entity.ts'

// Constants
export * from './constants.ts'
