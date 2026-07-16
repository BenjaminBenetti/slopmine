import * as THREE from 'three'
import type { ITask, ITaskResult } from '../core/interfaces/ITask.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { PhysicsEngine } from '../physics/PhysicsEngine.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { IEntity, EntityId } from './interfaces/IEntity.ts'
import { EntityState } from './interfaces/IEntity.ts'
import type { IBlockEntity } from './interfaces/IBlockEntity.ts'
import { isBlockEntity } from './interfaces/IBlockEntity.ts'
import type { IEntityCallbacks } from './interfaces/IEntityCallbacks.ts'
import { CHUNK_SIZE_X } from '../world/interfaces/IChunk.ts'
import type { IWorldCoordinate } from '../world/interfaces/ICoordinates.ts'
import { Entity } from './Entity.ts'

/**
 * Create a string key from world coordinates for block entity lookup.
 */
function blockPosKey(pos: IWorldCoordinate): string {
  return `${pos.x},${pos.y},${pos.z}`
}

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
  private readonly blockEntityIndex: Map<string, IBlockEntity> = new Map()
  private readonly entitiesToAdd: IEntity[] = []
  private readonly entitiesToRemove: Set<EntityId> = new Set()

  private readonly scene: THREE.Scene
  private readonly physicsEngine: PhysicsEngine | null
  private playerBody: IPhysicsBody | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3) => void) | null = null

  private readonly maxEntities: number
  private readonly getChunkDistance: () => number

  private readonly callbacks: Set<IEntityCallbacks> = new Set()

  /**
   * Function to query world light level at a position.
   * Set via setLightQuery() from main.ts.
   */
  private lightQueryFn: ((x: number, y: number, z: number) => number) | null = null

  /**
   * Function to query block ID at a position.
   * Used by entities that need to detect specific blocks (like EmberRoach for pillars).
   */
  private blockQueryFn: ((x: number, y: number, z: number) => number) | null = null

  /**
   * Function to check if a block is solid at a position.
   * Used by entities that need collision info (like EmberRoach for pillar detection).
   */
  private solidQueryFn: ((x: number, y: number, z: number) => boolean) | null = null

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

  /**
   * Per-entity light-query throttle. The world light query is only re-run when
   * an entity crosses into a new block, or after LIGHT_REFRESH_MS to catch
   * lighting changes around a stationary entity. Brightness output is already
   * threshold-gated in Entity.updateLightLevel, so this is visually lossless
   * and avoids a per-entity, per-tick block lookup.
   */
  private readonly lightCache: Map<EntityId, { bx: number; by: number; bz: number; time: number }> = new Map()
  private static readonly LIGHT_REFRESH_MS = 500

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
    // Ensure the player body is always full-simulated and never slept.
    this.physicsEngine?.setPlayerBody(playerBody)
  }

  /**
   * Set the callback for player damage from aggressive entities.
   * This callback will be automatically passed to any entity with a setPlayerDamageCallback method.
   */
  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3) => void): void {
    this.playerDamageCallback = callback
  }

  /**
   * Set the function to query world light levels.
   * Used to dim entities based on the light level at their position.
   */
  setLightQuery(fn: (x: number, y: number, z: number) => number): void {
    this.lightQueryFn = fn
  }

  /**
   * Set the function to query block IDs at world positions.
   * Used by entities that need to detect specific block types.
   */
  setBlockQuery(fn: (x: number, y: number, z: number) => number): void {
    this.blockQueryFn = fn
  }

  /**
   * Set the function to check if blocks are solid.
   * Used by entities that need collision/navigation info.
   */
  setSolidQuery(fn: (x: number, y: number, z: number) => boolean): void {
    this.solidQueryFn = fn
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
   * Entity will be skipped in updates while pending removal.
   */
  removeEntity(entityId: EntityId): boolean {
    if (!this.entities.has(entityId)) {
      return false
    }
    this.entitiesToRemove.add(entityId)
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
   * Get the number of entities pending removal.
   */
  get pendingRemovalCount(): number {
    return this.entitiesToRemove.size
  }

  /**
   * Get the number of active block entities.
   */
  get blockEntityCount(): number {
    return this.blockEntityIndex.size
  }

  /**
   * Get a block entity at a specific world position.
   */
  getBlockEntityAt(position: IWorldCoordinate): IBlockEntity | undefined {
    return this.blockEntityIndex.get(blockPosKey(position))
  }

  /**
   * Check if a block entity exists at a specific world position.
   */
  hasBlockEntityAt(position: IWorldCoordinate): boolean {
    return this.blockEntityIndex.has(blockPosKey(position))
  }

  /**
   * Remove all block entities in a specific chunk.
   * Called when a chunk is unloaded.
   */
  removeBlockEntitiesInChunk(chunkX: bigint, chunkZ: bigint): void {
    for (const [_key, entity] of this.blockEntityIndex) {
      if (entity.chunkCoordinate.x === chunkX && entity.chunkCoordinate.z === chunkZ) {
        this.entitiesToRemove.add(entity.id)
      }
    }
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

      // Skip entities that are pending removal (prevents update after block destroyed)
      if (this.entitiesToRemove.has(entity.id)) continue

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

      // Feed the same distance tier to the physics engine so a distant body is
      // stepped at the matching rate (no recompute in physics). Done before the
      // tier-gate skip below so the tier stays fresh every frame for every body.
      if (this.physicsEngine) {
        const physicsBody = entity.getPhysicsBody()
        if (physicsBody) {
          this.physicsEngine.setBodyTier(physicsBody, tier)
        }
      }

      // Skip if this tier isn't updating this frame
      if (!shouldUpdateTier[tier]) continue

      entity.update(tierDeltaTimes[tier])
      updatedCount++

      // Update entity lighting based on world light level. Throttled per entity
      // by block position + time to avoid a world lookup every tick.
      if (this.lightQueryFn && entity instanceof Entity) {
        const bx = Math.floor(entity.position.x)
        const by = Math.floor(entity.position.y)
        const bz = Math.floor(entity.position.z)
        let cache = this.lightCache.get(entity.id)
        if (
          cache === undefined ||
          bx !== cache.bx || by !== cache.by || bz !== cache.bz ||
          startTime - cache.time >= EntityManager.LIGHT_REFRESH_MS
        ) {
          const lightLevel = this.lightQueryFn(
            entity.position.x,
            entity.position.y,
            entity.position.z
          )
          entity.updateLightLevel(lightLevel)
          if (cache === undefined) {
            this.lightCache.set(entity.id, { bx, by, bz, time: startTime })
          } else {
            cache.bx = bx
            cache.by = by
            cache.bz = bz
            cache.time = startTime
          }
        }
      }

      // Check if entity died
      if (!entity.isAlive) {
        entity.state = EntityState.DESPAWNING
        this.entitiesToRemove.add(entity.id)
        continue
      }

      // Check despawn distance from player (skip for block entities - they despawn with chunks)
      if (this.playerBody && !isBlockEntity(entity)) {
        this.tempVector.copy(entity.position).sub(this.playerBody.position)
        const distSq = this.tempVector.x ** 2 + this.tempVector.z ** 2
        if (distSq > despawnDistanceSq) {
          entity.state = EntityState.DESPAWNING
          this.entitiesToRemove.add(entity.id)
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
    this.entitiesToRemove.clear()
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

    // Add to block entity index if applicable
    if (isBlockEntity(entity)) {
      this.blockEntityIndex.set(blockPosKey(entity.blockPosition), entity)
    }

    // Set player position reference for entities that need it (e.g., aggressive mobs for tracking)
    if (this.playerBody && 'setPlayerPositionRef' in entity) {
      const trackingEntity = entity as { setPlayerPositionRef: (pos: THREE.Vector3) => void }
      trackingEntity.setPlayerPositionRef(this.playerBody.position)
    }

    // Set player damage callback for aggressive entities
    if (this.playerDamageCallback && 'setPlayerDamageCallback' in entity) {
      const aggressiveEntity = entity as { setPlayerDamageCallback: (cb: (damage: number, knockback: THREE.Vector3) => void) => void }
      aggressiveEntity.setPlayerDamageCallback(this.playerDamageCallback)
    }

    // Set world query functions for entities that need them (e.g., EmberRoach for pillar detection)
    if (this.blockQueryFn && this.solidQueryFn && 'setWorldQueryFns' in entity) {
      const worldAwareEntity = entity as {
        setWorldQueryFns: (
          blockQuery: (x: number, y: number, z: number) => number,
          solidQuery: (x: number, y: number, z: number) => boolean
        ) => void
      }
      worldAwareEntity.setWorldQueryFns(this.blockQueryFn, this.solidQueryFn)
    }

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
    this.lightCache.delete(entityId)

    // Remove from block entity index if applicable
    if (isBlockEntity(entity)) {
      this.blockEntityIndex.delete(blockPosKey(entity.blockPosition))
    }

    entity.state = EntityState.DISPOSED

    entity.dispose()
  }

  /**
   * Force immediate removal of all entities.
   */
  clear(): void {
    this.entitiesToAdd.length = 0
    this.entitiesToRemove.clear()

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
