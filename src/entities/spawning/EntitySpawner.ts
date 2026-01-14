import * as THREE from 'three'
import type { ITask, ITaskResult } from '../../core/interfaces/ITask.ts'
import { TaskPriority } from '../../core/interfaces/ITask.ts'
import type { EntityManager } from '../EntityManager.ts'
import type { WorldGenerator } from '../../world/generate/WorldGenerator.ts'
import type { WorldManager } from '../../world/WorldManager.ts'
import type { IPhysicsBody } from '../../physics/interfaces/IPhysicsBody.ts'
import type { EntitySpawnConfig } from './EntitySpawnConfig.ts'

// Spawning constants
const SPAWN_CHECK_INTERVAL = 2.0 // seconds between spawn checks
const SPAWN_RADIUS = 64 // blocks from player to check for spawning
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

  // Track which chunks have been processed for spawning
  private readonly processedChunks: Set<string> = new Set()

  // Timer for spawn checks
  private spawnTimer = 0

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
  }

  execute(deltaTime: number, _remainingBudgetMs: number): ITaskResult {
    const startTime = performance.now()

    this.spawnTimer += deltaTime

    if (this.spawnTimer >= SPAWN_CHECK_INTERVAL) {
      this.spawnTimer = 0
      this.checkSpawns()
    }

    this.taskResult.elapsedMs = performance.now() - startTime
    return this.taskResult
  }

  /**
   * Check for possible entity spawns around the player.
   */
  private checkSpawns(): void {
    const playerPos = this.playerBody.position
    const playerChunkX = Math.floor(playerPos.x / CHUNK_SIZE)
    const playerChunkZ = Math.floor(playerPos.z / CHUNK_SIZE)

    // Calculate chunk range to check
    const chunkRadius = Math.ceil(SPAWN_RADIUS / CHUNK_SIZE)

    let spawnsAttempted = 0

    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
      for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
        const chunkX = playerChunkX + dx
        const chunkZ = playerChunkZ + dz
        const chunkKey = `${chunkX},${chunkZ}`

        // Skip if already processed
        if (this.processedChunks.has(chunkKey)) continue

        // Mark as processed
        this.processedChunks.add(chunkKey)

        // Get spawn configs for this chunk's biome
        const worldX = chunkX * CHUNK_SIZE + CHUNK_SIZE / 2
        const worldZ = chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2
        const spawnConfigs = this.worldGenerator.getEntitySpawnsAtPosition(worldX, worldZ)

        if (!spawnConfigs || spawnConfigs.length === 0) continue

        // Try to spawn entities based on configs
        for (const config of spawnConfigs) {
          if (this.trySpawnEntity(config, chunkX, chunkZ)) {
            spawnsAttempted++
          }
        }
      }
    }

    // Clean up old processed chunks that are far from player
    this.cleanupProcessedChunks(playerChunkX, playerChunkZ)

    this.taskResult.workUnits = spawnsAttempted
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
   */
  private findSpawnPosition(
    chunkX: number,
    chunkZ: number,
    config: EntitySpawnConfig
  ): THREE.Vector3 | null {
    // Try a few random positions within the chunk
    const attempts = 5

    for (let i = 0; i < attempts; i++) {
      const localX = Math.random() * CHUNK_SIZE
      const localZ = Math.random() * CHUNK_SIZE
      const worldX = chunkX * CHUNK_SIZE + localX
      const worldZ = chunkZ * CHUNK_SIZE + localZ

      // Get ground height at this position
      const groundY = this.worldManager.getHighestBlockAt(
        BigInt(Math.floor(worldX)),
        BigInt(Math.floor(worldZ))
      )

      if (groundY === null) continue

      const spawnY = Number(groundY) + 1 // Spawn one block above ground

      // Check Y range constraints
      const minY = config.minY ?? 0
      const maxY = config.maxY ?? 1024
      if (spawnY < minY || spawnY > maxY) continue

      // Valid position found
      this.tempPosition.set(worldX, spawnY, worldZ)
      return this.tempPosition.clone()
    }

    return null
  }

  /**
   * Clean up processed chunks that are far from the player.
   * This allows respawning in areas the player returns to later.
   */
  private cleanupProcessedChunks(playerChunkX: number, playerChunkZ: number): void {
    const cleanupRadius = Math.ceil(SPAWN_RADIUS / CHUNK_SIZE) + 2

    for (const key of this.processedChunks) {
      const [cx, cz] = key.split(',').map(Number)
      const dx = Math.abs(cx - playerChunkX)
      const dz = Math.abs(cz - playerChunkZ)

      if (dx > cleanupRadius || dz > cleanupRadius) {
        this.processedChunks.delete(key)
      }
    }
  }

  /**
   * Clear all tracking state.
   */
  clear(): void {
    this.processedChunks.clear()
    this.spawnTimer = 0
  }
}
