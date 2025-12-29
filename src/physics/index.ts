// Interfaces
export type { IPhysicsBody } from './interfaces/IPhysicsBody.ts'
export type { IPhysicsWorld } from './interfaces/IPhysicsWorld.ts'
export type { ICollisionResult } from './interfaces/ICollisionResult.ts'

// Classes
export { PhysicsEngine, type PhysicsEngineConfig } from './PhysicsEngine.ts'
export { PhysicsBody } from './PhysicsBody.ts'
export { AABB } from './collision/AABB.ts'
export { CollisionDetector } from './collision/CollisionDetector.ts'
export { WorldPhysicsAdapter } from './WorldPhysicsAdapter.ts'

// Constants
export * from './constants.ts'
