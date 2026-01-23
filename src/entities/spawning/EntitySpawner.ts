import * as THREE from 'three'
import type { ITask, ITaskResult } from '../../core/interfaces/ITask.ts'
import { TaskPriority } from '../../core/interfaces/ITask.ts'
import type { EntityManager } from '../EntityManager.ts'
import type { WorldGenerator } from '../../world/generate/WorldGenerator.ts'
import type { WorldManager } from '../../world/WorldManager.ts'
import type { IPhysicsBody } from '../../physics/interfaces/IPhysicsBody.ts'
import type { EntitySpawnConfig } from './EntitySpawnConfig.ts'

// Spawning constants
const SPAWN_CHECK_INTERVAL = 20.0 // seconds between spawn checks (faster cycle)
const SPAWN_CHUNK_RADIUS = 6 // chunks from player to check for spawning (matches despawn distance)
const CHUNKS_PER_CYCLE = (2 * SPAWN_CHUNK_RADIUS + 1) ** 2 // 169 chunks in 13x13 grid
const SLOT_INTERVAL = SPAWN_CHECK_INTERVAL / CHUNKS_PER_CYCLE // ~0.12s per chunk
const MIN_SPAWN_DISTANCE = 24 // minimum distance from player to spawn
const CHUNK_SIZE = 32 // blocks per chunk
const DEFAULT_MAX_NEARBY = 8 // default max entities of one type nearby

/**
 * Entity spawner that spawns entities based on biome configurations.
 * Runs as a LOW priority task and periodically spawns entities around the player.
 */
export class EntitySpawner implements ITask {
  readonly id = 'entity-spawner'
  readonly priority = TaskPriority.LOW
  enabled = true

  private readonly entityManager: EntityManager
  private readonly worldGenerator: WorldGenerator
  private readonly worldManager: WorldManager
  private readonly playerBody: IPhysicsBody

  // Cycle state for staggered spawning
  private cycleTimer = SPAWN_CHECK_INTERVAL // Start at max to trigger first cycle
  private currentSlotIndex = CHUNKS_PER_CYCLE // Start past end to trigger reset
  private cyclePlayerChunkX = 0 // Player chunk X at cycle start
  private cyclePlayerChunkZ = 0 // Player chunk Z at cycle start

  // Pre-allocated chunk offsets for the 9x9 grid around player
  private readonly chunkOffsets: Array<{ dx: number; dz: number }> = []

  // Pre-allocated result object
  private readonly taskResult: ITaskResult = {
    completed: true,
    elapsedMs: 0,
    workUnits: 0,
  }

  // Pre-allocated vectors
  private readonly tempPosition = new THREE.Vector3()

  constructor(
    entityManager: EntityManager,
    worldGenerator: WorldGenerator,
    worldManager: WorldManager,
    playerBody: IPhysicsBody
  ) {
    this.entityManager = entityManager
    this.worldGenerator = worldGenerator
    this.worldManager = worldManager
    this.playerBody = playerBody

    // Populate chunk offsets for the 9x9 grid around player
    for (let dx = -SPAWN_CHUNK_RADIUS; dx <= SPAWN_CHUNK_RADIUS; dx++) {
      for (let dz = -SPAWN_CHUNK_RADIUS; dz <= SPAWN_CHUNK_RADIUS; dz++) {
        this.chunkOffsets.push({ dx, dz })
      }
    }
  }

  execute(deltaTime: number, _remainingBudgetMs: number): ITaskResult {
    const startTime = performance.now()

    this.cycleTimer += deltaTime

    // Check if we need to start a new cycle
    if (this.currentSlotIndex >= CHUNKS_PER_CYCLE) {
      this.startNewCycle()
    }

    // Calculate which time slot we should be at based on elapsed time
    const targetSlot = Math.min(
      Math.floor(this.cycleTimer / SLOT_INTERVAL),
      CHUNKS_PER_CYCLE
    )

    // Process all slots from currentSlotIndex to targetSlot (handles frame drops)
    let spawnsAttempted = 0
    while (this.currentSlotIndex < targetSlot) {
      spawnsAttempted += this.evaluateChunkAtSlot(this.currentSlotIndex)
      this.currentSlotIndex++
    }

    this.taskResult.workUnits = spawnsAttempted
    this.taskResult.elapsedMs = performance.now() - startTime
    return this.taskResult
  }

  /**
   * Start a new spawn cycle by snapshotting player position.
   */
  private startNewCycle(): void {
    this.cycleTimer = 0
    this.currentSlotIndex = 0

    // Snapshot player chunk position for this cycle
    const playerPos = this.playerBody.position
    this.cyclePlayerChunkX = Math.floor(playerPos.x / CHUNK_SIZE)
    this.cyclePlayerChunkZ = Math.floor(playerPos.z / CHUNK_SIZE)
  }

  /**
   * Evaluate spawning for a single chunk at the given slot index.
   * Returns the number of spawn attempts made.
   */
  private evaluateChunkAtSlot(slotIndex: number): number {
    const offset = this.chunkOffsets[slotIndex]
    const chunkX = this.cyclePlayerChunkX + offset.dx
    const chunkZ = this.cyclePlayerChunkZ + offset.dz

    // Get spawn configs for biome at player's Y level
    const worldX = chunkX * CHUNK_SIZE + CHUNK_SIZE / 2
    const worldZ = chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2
    const worldY = this.playerBody.position.y
    const spawnConfigs = this.worldGenerator.getEntitySpawnsAtPosition(worldX, worldZ, worldY)

    if (!spawnConfigs || spawnConfigs.length === 0) {
      return 0
    }

    // Try to spawn entities based on configs
    let spawnsAttempted = 0
    for (const config of spawnConfigs) {
      if (this.trySpawnEntity(config, chunkX, chunkZ)) {
        spawnsAttempted++
      }
    }

    return spawnsAttempted
  }

  /**
   * Try to spawn an entity based on the spawn config.
   */
  private trySpawnEntity(config: EntitySpawnConfig, chunkX: number, chunkZ: number): boolean {
    // Roll for spawn chance
    if (Math.random() > config.spawnRate) {
      return false
    }

    // Check max nearby limit
    const maxNearby = config.maxNearby ?? DEFAULT_MAX_NEARBY
    const nearbyOfType = this.entityManager.getEntitiesByType(config.entityType)
    if (nearbyOfType.length >= maxNearby) {
      return false
    }

    // Find a valid spawn position within the chunk
    const spawnPos = this.findSpawnPosition(chunkX, chunkZ, config)
    if (!spawnPos) {
      return false
    }

    // Check distance from player
    const playerPos = this.playerBody.position
    const distSq =
      (spawnPos.x - playerPos.x) ** 2 +
      (spawnPos.z - playerPos.z) ** 2
    if (distSq < MIN_SPAWN_DISTANCE ** 2) {
      return false
    }

    // Create and add entity
    const entity = config.createEntity(spawnPos)
    this.entityManager.addEntity(entity)

    return true
  }

  /**
   * Find a valid spawn position within a chunk.
   * Uses player's Y position to find ground level, which correctly handles
   * underground biomes where getHighestBlockAt would return the ceiling.
   */
  private findSpawnPosition(
    chunkX: number,
    chunkZ: number,
    config: EntitySpawnConfig
  ): THREE.Vector3 | null {
    // Try a few random positions within the chunk
    const attempts = 5
    const playerY = this.playerBody.position.y

    for (let i = 0; i < attempts; i++) {
      const localX = Math.random() * CHUNK_SIZE
      const localZ = Math.random() * CHUNK_SIZE
      const worldX = chunkX * CHUNK_SIZE + localX
      const worldZ = chunkZ * CHUNK_SIZE + localZ

      // Get ground height near player's Y level
      // This correctly finds the floor in underground biomes instead of the ceiling
      const groundY = this.worldManager.getGroundNearY(
        BigInt(Math.floor(worldX)),
        BigInt(Math.floor(worldZ)),
        Math.floor(playerY)
      )

      if (groundY === null) continue

      const spawnY = Number(groundY) + 1.25 // Spawn slightly above ground to avoid clipping

      // Check Y range constraints
      const minY = config.minY ?? 0
      const maxY = config.maxY ?? 1024
      if (spawnY < minY || spawnY > maxY) continue

      // Check light level constraint if specified
      if (config.maxLightLevel !== undefined) {
        const lightLevel = this.worldManager.getLightLevelAtWorld(worldX, spawnY, worldZ)
        if (lightLevel > config.maxLightLevel) continue
      }

      // Valid position found
      this.tempPosition.set(worldX, spawnY, worldZ)
      return this.tempPosition.clone()
    }

    return null
  }

  /**
   * Reset spawn cycle to trigger a new cycle on next update.
   */
  clear(): void {
    this.cycleTimer = SPAWN_CHECK_INTERVAL
    this.currentSlotIndex = CHUNKS_PER_CYCLE
  }
}
