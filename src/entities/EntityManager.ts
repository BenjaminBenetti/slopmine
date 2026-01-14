import * as THREE from 'three'
import type { ITask, ITaskResult } from '../core/interfaces/ITask.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { PhysicsEngine } from '../physics/PhysicsEngine.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { IEntity, EntityId } from './interfaces/IEntity.ts'
import { EntityState } from './interfaces/IEntity.ts'
import type { IEntityCallbacks } from './interfaces/IEntityCallbacks.ts'
import { CHUNK_SIZE_X } from '../world/interfaces/IChunk.ts'

/**
 * Configuration for EntityManager.
 */
export interface EntityManagerConfig {
  /** Maximum entities allowed (prevents runaway spawning) */
  maxEntities?: number
  /** Function to get current chunk distance setting */
  getChunkDistance?: () => number
}

/**
 * Central manager for all game entities.
 *
 * Responsibilities:
 * - Maintains registry of all active entities
 * - Handles entity lifecycle (spawn, despawn, dispose)
 * - Manages mesh scene membership
 * - Coordinates with physics engine for physics-enabled entities
 * - Provides spatial queries (getEntitiesNear)
 * - Implements ITask for TaskScheduler integration
 */
export class EntityManager implements ITask {
  readonly id = 'entity-manager'
  readonly priority = TaskPriority.NORMAL
  enabled = true

  private readonly entities: Map<EntityId, IEntity> = new Map()
  private readonly entitiesToAdd: IEntity[] = []
  private readonly entitiesToRemove: EntityId[] = []

  private readonly scene: THREE.Scene
  private readonly physicsEngine: PhysicsEngine | null
  private playerBody: IPhysicsBody | null = null

  private readonly maxEntities: number
  private readonly getChunkDistance: () => number

  private readonly callbacks: Set<IEntityCallbacks> = new Set()

  // Adaptive update rates based on distance from player
  // Tier 0: 0-32 blocks = 60 UPS (every frame)
  // Tier 1: 32-128 blocks = 30 UPS
  // Tier 2: 128+ blocks = 15 UPS
  private readonly updateIntervals = [0, 1 / 30, 1 / 15]
  private readonly updateAccumulators = [0, 0, 0]
  private readonly tierDistancesSq = [32 * 32, 128 * 128] // squared distances for fast comparison

  private readonly taskResult: ITaskResult = {
    completed: true,
    elapsedMs: 0,
    workUnits: 0,
  }

  private readonly tempVector = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    physicsEngine: PhysicsEngine | null = null,
    config: EntityManagerConfig = {}
  ) {
    this.scene = scene
    this.physicsEngine = physicsEngine
    this.maxEntities = config.maxEntities ?? 1000
    this.getChunkDistance = config.getChunkDistance ?? (() => 8)
  }

  /**
   * Set the player body for distance-based despawning.
   */
  setPlayerBody(playerBody: IPhysicsBody): void {
    this.playerBody = playerBody
  }

  /**
   * Register a callback listener for entity events.
   */
  addCallback(callback: IEntityCallbacks): void {
    this.callbacks.add(callback)
  }

  /**
   * Unregister a callback listener.
   */
  removeCallback(callback: IEntityCallbacks): void {
    this.callbacks.delete(callback)
  }

  /**
   * Queue an entity to be added on the next update.
   * @returns True if entity was queued, false if at max capacity
   */
  addEntity(entity: IEntity): boolean {
    if (this.entities.size + this.entitiesToAdd.length >= this.maxEntities) {
      console.warn(
        `EntityManager: Cannot add entity '${entity.id}', at max capacity (${this.maxEntities})`
      )
      return false
    }

    if (this.entities.has(entity.id)) {
      console.warn(`EntityManager: Entity '${entity.id}' already exists`)
      return false
    }

    this.entitiesToAdd.push(entity)
    return true
  }

  /**
   * Queue an entity for removal on the next update.
   */
  removeEntity(entityId: EntityId): boolean {
    if (!this.entities.has(entityId)) {
      return false
    }
    this.entitiesToRemove.push(entityId)
    return true
  }

  /**
   * Get an entity by ID.
   */
  getEntity(entityId: EntityId): IEntity | undefined {
    return this.entities.get(entityId)
  }

  /**
   * Check if an entity exists.
   */
  hasEntity(entityId: EntityId): boolean {
    return this.entities.has(entityId)
  }

  /**
   * Get all entities of a specific type.
   */
  getEntitiesByType(type: string): IEntity[] {
    const result: IEntity[] = []
    for (const entity of this.entities.values()) {
      if (entity.type === type) {
        result.push(entity)
      }
    }
    return result
  }

  /**
   * Get all entities within a radius of a position.
   * @param position Center point for query
   * @param radius Maximum distance from center
   * @returns Array of entities within radius, sorted by distance (closest first)
   */
  getEntitiesNear(position: THREE.Vector3, radius: number): IEntity[] {
    const radiusSq = radius * radius
    const result: Array<{ entity: IEntity; distSq: number }> = []

    for (const entity of this.entities.values()) {
      if (entity.state !== EntityState.ACTIVE) continue

      this.tempVector.copy(entity.position).sub(position)
      const distSq = this.tempVector.lengthSq()

      if (distSq <= radiusSq) {
        result.push({ entity, distSq })
      }
    }

    result.sort((a, b) => a.distSq - b.distSq)

    return result.map((r) => r.entity)
  }

  /**
   * Get the total number of active entities.
   */
  get entityCount(): number {
    return this.entities.size
  }

  /**
   * ITask.execute - Update entities with adaptive rate based on distance.
   * Close entities (0-1 chunks): 60 UPS
   * Medium entities (2-5 chunks): 30 UPS
   * Far entities (6+ chunks): 15 UPS
   */
  execute(deltaTime: number, _remainingBudgetMs: number): ITaskResult {
    const startTime = performance.now()

    // Always process additions/removals immediately
    this.processAdditions()
    this.processRemovals()

    // Accumulate time for each tier
    this.updateAccumulators[1] += deltaTime
    this.updateAccumulators[2] += deltaTime

    // Determine which tiers should update this frame
    const shouldUpdateTier = [
      true, // Tier 0 always updates (60 UPS)
      this.updateAccumulators[1] >= this.updateIntervals[1],
      this.updateAccumulators[2] >= this.updateIntervals[2],
    ]

    // Get deltaTime for each tier
    const tierDeltaTimes = [
      deltaTime,
      shouldUpdateTier[1] ? this.updateAccumulators[1] : 0,
      shouldUpdateTier[2] ? this.updateAccumulators[2] : 0,
    ]

    // Reset accumulators for tiers that updated
    if (shouldUpdateTier[1]) this.updateAccumulators[1] = 0
    if (shouldUpdateTier[2]) this.updateAccumulators[2] = 0

    // Calculate despawn distance (2 chunks before max chunk distance)
    const despawnDistanceSq = this.playerBody
      ? ((this.getChunkDistance() - 2) * CHUNK_SIZE_X) ** 2
      : Infinity

    let updatedCount = 0

    for (const entity of this.entities.values()) {
      if (entity.state !== EntityState.ACTIVE || !entity.isAlive) continue

      // Calculate squared 3D distance from player for tier selection
      let tier = 2 // Default to far tier
      if (this.playerBody) {
        const dx = entity.position.x - this.playerBody.position.x
        const dy = entity.position.y - this.playerBody.position.y
        const dz = entity.position.z - this.playerBody.position.z
        const distSq = dx * dx + dy * dy + dz * dz

        if (distSq <= this.tierDistancesSq[0]) {
          tier = 0 // Close (0-32 blocks): 60 UPS
        } else if (distSq <= this.tierDistancesSq[1]) {
          tier = 1 // Medium (32-128 blocks): 30 UPS
        }
      }

      // Skip if this tier isn't updating this frame
      if (!shouldUpdateTier[tier]) continue

      entity.update(tierDeltaTimes[tier])
      updatedCount++

      // Check if entity died
      if (!entity.isAlive) {
        entity.state = EntityState.DESPAWNING
        this.entitiesToRemove.push(entity.id)
        continue
      }

      // Check despawn distance from player
      if (this.playerBody) {
        this.tempVector.copy(entity.position).sub(this.playerBody.position)
        const distSq = this.tempVector.x ** 2 + this.tempVector.z ** 2
        if (distSq > despawnDistanceSq) {
          entity.state = EntityState.DESPAWNING
          this.entitiesToRemove.push(entity.id)
        }
      }
    }

    // Process any removals from this update cycle
    this.processRemovals()

    this.taskResult.elapsedMs = performance.now() - startTime
    this.taskResult.workUnits = updatedCount

    return this.taskResult
  }

  private processAdditions(): void {
    for (const entity of this.entitiesToAdd) {
      this.spawnEntity(entity)
    }
    this.entitiesToAdd.length = 0
  }

  private processRemovals(): void {
    for (const entityId of this.entitiesToRemove) {
      this.despawnEntity(entityId)
    }
    this.entitiesToRemove.length = 0
  }

  private spawnEntity(entity: IEntity): void {
    const mesh = entity.getMesh()
    if (mesh) {
      this.scene.add(mesh)
    }

    const physicsBody = entity.getPhysicsBody()
    if (physicsBody && this.physicsEngine) {
      this.physicsEngine.addBody(physicsBody)
    }

    this.entities.set(entity.id, entity)
    entity.state = EntityState.ACTIVE

    entity.onSpawn()

    for (const callback of this.callbacks) {
      callback.onEntityAdded?.(entity)
    }
  }

  private despawnEntity(entityId: EntityId): void {
    const entity = this.entities.get(entityId)
    if (!entity) return

    if (!entity.onDespawn()) {
      return
    }

    for (const callback of this.callbacks) {
      callback.onEntityRemoved?.(entityId)
    }

    const physicsBody = entity.getPhysicsBody()
    if (physicsBody && this.physicsEngine) {
      this.physicsEngine.removeBody(physicsBody)
    }

    const mesh = entity.getMesh()
    if (mesh) {
      this.scene.remove(mesh)
    }

    this.entities.delete(entityId)
    entity.state = EntityState.DISPOSED

    entity.dispose()
  }

  /**
   * Force immediate removal of all entities.
   */
  clear(): void {
    this.entitiesToAdd.length = 0
    this.entitiesToRemove.length = 0

    for (const entityId of this.entities.keys()) {
      this.despawnEntity(entityId)
    }
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.clear()
    this.callbacks.clear()
  }
}
