import type { WorldManager } from '../WorldManager.ts'
import type { ISubChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { createSubChunkKey, type SubChunkKey } from '../interfaces/ICoordinates.ts'
import { worldToChunk } from '../coordinates/CoordinateUtils.ts'
import { SUB_CHUNK_HEIGHT, SUB_CHUNK_COUNT } from '../interfaces/IChunk.ts'
import { GenerationConfig, type IGenerationConfig, type BiomeType } from './GenerationConfig.ts'
import type { BiomeGenerator } from './BiomeGenerator.ts'
import { biomeRegistry, BIOME_REGION_SIZE } from './biomes/BiomeRegistry.ts'
import { CliffFeature } from './features/CliffFeature.ts'
import { OreFeature } from './features/OreFeature.ts'
import { EntranceGenerator } from './caves/EntranceGenerator.ts'
import type { WorkerBiomeConfig, FeatureConfig, BiomeBlendData } from '../../workers/ChunkGenerationWorker.ts'
import type { PersistenceManager } from '../../persistence/PersistenceManager.ts'

interface QueuedSubChunk {
  coordinate: ISubChunkCoordinate
  priority: number
}

/**
 * Coordinates world generation:
 * - Maintains chunk generation queue sorted by distance to player
 * - Generates chunks asynchronously in the background
 * - Uses web workers for heavy terrain/caves/lighting generation
 * - Unloads chunks beyond the unload distance
 */
export class WorldGenerator {
  private readonly world: WorldManager
  private readonly config: GenerationConfig

  // Biome caches - lazily populated on demand
  private readonly generatorCache: Map<BiomeType, BiomeGenerator> = new Map()
  private readonly biomeConfigCache: Map<BiomeType, WorkerBiomeConfig> = new Map()

  // Sub-chunk queue for 3D generation
  private readonly subChunkQueue: QueuedSubChunk[] = []
  private readonly generatingSubChunks: Set<SubChunkKey> = new Set()
  private readonly generatedSubChunks: Set<SubChunkKey> = new Set()

  private readonly subChunksPerFrame: number = 2
  private playerChunkX: bigint = 0n
  private playerChunkZ: bigint = 0n
  private playerSubY: number = 0 // Player's sub-chunk Y index (0-15)
  private playerWorldY: number = 0 // Player's world Y position
  private initialized: boolean = false

  // Entrance generation (runs on main thread after sub-chunks are ready)
  private readonly entranceGenerator: EntranceGenerator
  private readonly entrancesGenerated: Set<string> = new Set() // "x,z" keys

  // Persistence manager for loading saved chunks
  private persistenceManager: PersistenceManager | null = null

  constructor(world: WorldManager, config?: Partial<IGenerationConfig>) {
    this.world = world
    this.config = new GenerationConfig(config)
    this.entranceGenerator = new EntranceGenerator(this.config.seed)
  }

  /**
   * Get the biome type for a chunk based on its biome region.
   * Biome regions are 16x16 chunks in size.
   */
  private getBiomeForChunk(chunkX: number, chunkZ: number): BiomeType {
    const { regionX, regionZ } = biomeRegistry.getRegionCoords(chunkX, chunkZ)
    return biomeRegistry.selectBiome(regionX, regionZ, this.config.seed)
  }

  /**
   * Get or create a BiomeGenerator for a biome type.
   */
  private getGeneratorForBiome(biomeType: BiomeType): BiomeGenerator {
    let generator = this.generatorCache.get(biomeType)
    if (!generator) {
      const registration = biomeRegistry.get(biomeType)
      if (!registration) {
        throw new Error(`Unknown biome type: ${biomeType}`)
      }
      generator = registration.createGenerator(this.config)
      this.generatorCache.set(biomeType, generator)
    }
    return generator
  }

  /**
   * Get or create a WorkerBiomeConfig for a biome type.
   */
  private getWorkerBiomeConfig(biomeType: BiomeType): WorkerBiomeConfig {
    let config = this.biomeConfigCache.get(biomeType)
    if (!config) {
      const generator = this.getGeneratorForBiome(biomeType)
      config = this.createWorkerBiomeConfig(generator)
      this.biomeConfigCache.set(biomeType, config)
    }
    return config
  }

  /**
   * Convert BiomeProperties to a plain object for worker communication.
   * Extracts feature settings from Feature class instances.
   */
  private createWorkerBiomeConfig(generator: BiomeGenerator): WorkerBiomeConfig {
    const props = generator.getBiomeProperties()

    // Convert Feature instances to serializable configs
    const features: FeatureConfig[] = props.features.map(feature => {
      if (feature instanceof CliffFeature) {
        return { type: 'cliff', settings: feature.settings }
      }
      if (feature instanceof OreFeature) {
        return { type: 'ore', settings: feature.settings }
      }
      throw new Error(`Unknown feature type: ${feature.constructor.name}`)
    })

    return {
      name: props.name,
      surfaceBlock: props.surfaceBlock,
      subsurfaceBlock: props.subsurfaceBlock,
      subsurfaceDepth: props.subsurfaceDepth,
      baseBlock: props.baseBlock,
      heightAmplitude: props.heightAmplitude,
      heightOffset: props.heightOffset,
      treeDensity: props.treeDensity,
      features,
      caves: props.caves,
    }
  }

  /**
   * Create BiomeBlendData for a chunk, including adjacent biome configs for blending.
   */
  private getBlendDataForChunk(chunkX: number, chunkZ: number): BiomeBlendData {
    const { localX, localZ } = biomeRegistry.getLocalChunkCoords(chunkX, chunkZ)
    const { regionX, regionZ } = biomeRegistry.getRegionCoords(chunkX, chunkZ)

    // Get primary biome
    const primaryType = biomeRegistry.selectBiome(regionX, regionZ, this.config.seed)
    const primary = this.getWorkerBiomeConfig(primaryType)

    // Get adjacent biomes for blending (cardinal directions)
    const northType = biomeRegistry.selectBiome(regionX, regionZ - 1, this.config.seed)
    const southType = biomeRegistry.selectBiome(regionX, regionZ + 1, this.config.seed)
    const westType = biomeRegistry.selectBiome(regionX - 1, regionZ, this.config.seed)
    const eastType = biomeRegistry.selectBiome(regionX + 1, regionZ, this.config.seed)

    // Get diagonal corner biomes for proper corner blending
    const northeastType = biomeRegistry.selectBiome(regionX + 1, regionZ - 1, this.config.seed)
    const northwestType = biomeRegistry.selectBiome(regionX - 1, regionZ - 1, this.config.seed)
    const southeastType = biomeRegistry.selectBiome(regionX + 1, regionZ + 1, this.config.seed)
    const southwestType = biomeRegistry.selectBiome(regionX - 1, regionZ + 1, this.config.seed)

    return {
      primary,
      north: northType !== primaryType ? this.getWorkerBiomeConfig(northType) : undefined,
      south: southType !== primaryType ? this.getWorkerBiomeConfig(southType) : undefined,
      west: westType !== primaryType ? this.getWorkerBiomeConfig(westType) : undefined,
      east: eastType !== primaryType ? this.getWorkerBiomeConfig(eastType) : undefined,
      northeast: northeastType !== primaryType ? this.getWorkerBiomeConfig(northeastType) : undefined,
      northwest: northwestType !== primaryType ? this.getWorkerBiomeConfig(northwestType) : undefined,
      southeast: southeastType !== primaryType ? this.getWorkerBiomeConfig(southeastType) : undefined,
      southwest: southwestType !== primaryType ? this.getWorkerBiomeConfig(southwestType) : undefined,
      chunkLocalX: localX,
      chunkLocalZ: localZ,
    }
  }

  /**
   * Update generation based on player position.
   * Call once per frame from game loop.
   *
   * @param playerX - Player world X position
   * @param playerZ - Player world Z position
   * @param playerY - Player world Y position
   */
  update(playerX: number, playerZ: number, playerY: number = 0): void {
    this.updateQueue(playerX, playerZ, playerY)
    this.processSubChunkQueue()
  }

  /**
   * Update the generation queue based on player position.
   * Does NOT process the queue - use processNextSubChunk() for that.
   * Call this every frame to keep the queue up to date.
   */
  updateQueue(playerX: number, playerZ: number, playerY: number = 0): void {
    // Convert to chunk coordinates
    const playerChunk = worldToChunk({
      x: BigInt(Math.floor(playerX)),
      y: 0n,
      z: BigInt(Math.floor(playerZ)),
    })

    // Calculate player's sub-chunk Y index
    const newPlayerSubY = Math.floor(Math.max(0, playerY) / SUB_CHUNK_HEIGHT)
    const clampedPlayerSubY = Math.min(newPlayerSubY, SUB_CHUNK_COUNT - 1)

    const chunkChanged =
      playerChunk.x !== this.playerChunkX ||
      playerChunk.z !== this.playerChunkZ

    const subYChanged = clampedPlayerSubY !== this.playerSubY

    this.playerChunkX = playerChunk.x
    this.playerChunkZ = playerChunk.z
    this.playerSubY = clampedPlayerSubY
    this.playerWorldY = playerY

    // Update queue on first call or when player moves to new chunk/sub-chunk
    if (!this.initialized || chunkChanged || subYChanged) {
      this.initialized = true
      this.updateSubChunkQueue()
      this.unloadDistantChunks()
    }
  }

  /**
   * Force a refresh of chunk loading based on current config.
   * Call this after changing chunkDistance to apply changes immediately.
   */
  refreshChunks(): void {
    if (!this.initialized) return
    this.updateSubChunkQueue()
    this.unloadDistantChunks()
  }

  /**
   * Generate spiral coordinates from center outward.
   * Yields {dx, dz, distance} for each position.
   */
  private *spiralCoordinates(
    radius: number
  ): Generator<{ dx: number; dz: number; distance: number }> {
    // Start at center
    yield { dx: 0, dz: 0, distance: 0 }

    // Spiral outward
    for (let r = 1; r <= radius; r++) {
      // Top edge (left to right)
      for (let dx = -r; dx <= r; dx++) {
        yield { dx, dz: -r, distance: r }
      }
      // Right edge (top to bottom, excluding corners)
      for (let dz = -r + 1; dz <= r - 1; dz++) {
        yield { dx: r, dz, distance: r }
      }
      // Bottom edge (right to left)
      for (let dx = r; dx >= -r; dx--) {
        yield { dx, dz: r, distance: r }
      }
      // Left edge (bottom to top, excluding corners)
      for (let dz = r - 1; dz >= -r + 1; dz--) {
        yield { dx: -r, dz, distance: r }
      }
    }
  }

  /**
   * Unload sub-chunks beyond the 3D spherical unload distance.
   * Columns are fully unloaded when horizontally too far.
   * Individual sub-chunks are cleared when vertically too far.
   */
  private unloadDistantChunks(): void {
    const unloadDistance = this.config.getUnloadDistance()

    const loadedColumns = this.world.getLoadedColumns()

    for (const column of loadedColumns) {
      const dx = Number(column.coordinate.x - this.playerChunkX)
      const dz = Number(column.coordinate.z - this.playerChunkZ)
      const horizontalDist = Math.sqrt(dx * dx + dz * dz)

      // If horizontally beyond unload distance, unload entire column
      if (horizontalDist > unloadDistance) {
        this.world.unloadChunk(column.coordinate)

        // Clear all sub-chunk keys for this column
        for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
          const subKey = createSubChunkKey(column.coordinate.x, column.coordinate.z, subY)
          this.generatedSubChunks.delete(subKey)
          this.generatingSubChunks.delete(subKey)
        }
        continue
      }

      // Check each sub-chunk's 3D distance
      for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
        const dy = subY - this.playerSubY
        const dist3D = Math.sqrt(dx * dx + dz * dz + dy * dy)

        if (dist3D > unloadDistance) {
          // Clear generated flag so it can be re-queued when player moves
          const subKey = createSubChunkKey(column.coordinate.x, column.coordinate.z, subY)
          this.generatedSubChunks.delete(subKey)
          this.generatingSubChunks.delete(subKey)
        }
      }
    }
  }

  /**
   * Get current configuration.
   */
  getConfig(): GenerationConfig {
    return this.config
  }

  /**
   * Set the persistence manager for loading saved chunks.
   */
  setPersistenceManager(manager: PersistenceManager): void {
    this.persistenceManager = manager
  }

  /**
   * Force regeneration of all sub-chunks (e.g., after seed change).
   */
  reset(): void {
    this.subChunkQueue.length = 0
    this.generatingSubChunks.clear()
    this.generatedSubChunks.clear()
    this.initialized = false
  }

  /**
   * Get the number of sub-chunks waiting to be generated.
   */
  getQueuedCount(): number {
    return this.subChunkQueue.length
  }

  /**
   * Get the number of sub-chunks currently generating.
   */
  getGeneratingCount(): number {
    return this.generatingSubChunks.size
  }

  /**
   * Get the number of sub-chunks that have been generated.
   */
  getGeneratedCount(): number {
    return this.generatedSubChunks.size
  }

  /**
   * Get the number of unique chunk columns that have at least one generated sub-chunk.
   */
  getGeneratedChunkColumnCount(): number {
    const columns = new Set<string>()
    for (const key of this.generatedSubChunks) {
      // SubChunkKey format is "x,z,subY" - extract "x,z" as column key
      const lastComma = key.lastIndexOf(',')
      const columnKey = key.substring(0, lastComma)
      columns.add(columnKey)
    }
    return columns.size
  }

  /**
   * Calculate 3D priority for a sub-chunk based on distance from player.
   * Prioritizes sub-chunks near the player's Y position.
   */
  private calculateSubChunkPriority(subCoord: ISubChunkCoordinate): number {
    const dx = Number(subCoord.x - this.playerChunkX)
    const dz = Number(subCoord.z - this.playerChunkZ)
    const dy = subCoord.subY - this.playerSubY

    // Weight Y distance slightly more for immediate visibility
    // This ensures sub-chunks at the player's eye level load first
    return Math.sqrt(dx * dx + dz * dz + dy * dy * 1.5)
  }

  /**
   * Rebuild the sub-chunk queue based on current player position.
   * Uses 3D distance for priority ordering.
   */
  private updateSubChunkQueue(): void {
    this.subChunkQueue.length = 0

    const distance = this.config.chunkDistance
    const centerX = this.playerChunkX
    const centerZ = this.playerChunkZ

    // Generate sub-chunks in a sphere around the player
    for (const coord of this.spiralCoordinates(distance)) {
      const chunkX = centerX + BigInt(coord.dx)
      const chunkZ = centerZ + BigInt(coord.dz)

      // For each column, only queue sub-chunks within 3D spherical distance
      for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
        const dy = subY - this.playerSubY

        // Check 3D spherical distance - skip sub-chunks outside the sphere
        const dist3D = Math.sqrt(coord.dx * coord.dx + coord.dz * coord.dz + dy * dy)
        if (dist3D > distance) continue

        const subCoord: ISubChunkCoordinate = {
          x: chunkX,
          z: chunkZ,
          subY,
        }

        const key = createSubChunkKey(chunkX, chunkZ, subY)

        // Skip already generated or in-progress sub-chunks
        if (this.generatedSubChunks.has(key) || this.generatingSubChunks.has(key)) {
          continue
        }

        const priority = this.calculateSubChunkPriority(subCoord)

        this.subChunkQueue.push({
          coordinate: subCoord,
          priority,
        })
      }
    }

    // Sort by priority (closest first)
    this.subChunkQueue.sort((a, b) => a.priority - b.priority)
  }

  /**
   * Process queued sub-chunks (generate N per frame).
   */
  private processSubChunkQueue(): void {
    let started = 0

    while (started < this.subChunksPerFrame && this.subChunkQueue.length > 0) {
      const queued = this.subChunkQueue.shift()
      if (!queued) break

      const key = createSubChunkKey(
        queued.coordinate.x,
        queued.coordinate.z,
        queued.coordinate.subY
      )

      // Double-check not already generating
      if (this.generatingSubChunks.has(key)) continue

      this.generatingSubChunks.add(key)

      // Start async generation (fire-and-forget)
      this.generateSubChunk(queued.coordinate, key)
      started++
    }
  }

  /**
   * Process a single sub-chunk from the queue.
   * Used by the task scheduler for budget-aware processing.
   * @returns true if more work remains in the queue
   */
  processNextSubChunk(): boolean {
    if (this.subChunkQueue.length === 0) return false

    const queued = this.subChunkQueue.shift()
    if (!queued) return this.subChunkQueue.length > 0

    const key = createSubChunkKey(
      queued.coordinate.x,
      queued.coordinate.z,
      queued.coordinate.subY
    )

    // Skip if already generating
    if (this.generatingSubChunks.has(key)) {
      return this.subChunkQueue.length > 0
    }

    this.generatingSubChunks.add(key)

    // Start async generation (fire-and-forget)
    this.generateSubChunk(queued.coordinate, key)

    return this.subChunkQueue.length > 0
  }

  /**
   * Generate a single sub-chunk using worker for heavy computation.
   * First checks persistence for saved data.
   */
  private async generateSubChunk(
    coordinate: ISubChunkCoordinate,
    key: SubChunkKey
  ): Promise<void> {
    try {
      // Check persistence first - load from storage if available
      if (this.persistenceManager) {
        const savedData = await this.persistenceManager.loadSubChunk(coordinate)
        if (savedData) {
          // Apply saved data instead of generating
          await this.world.applySubChunkData(
            coordinate,
            savedData.blocks,
            savedData.lightData
          )
          this.generatedSubChunks.add(key)
          return
        }
      }

      const chunkX = Number(coordinate.x)
      const chunkZ = Number(coordinate.z)
      const minWorldY = coordinate.subY * SUB_CHUNK_HEIGHT
      const maxWorldY = minWorldY + SUB_CHUNK_HEIGHT - 1

      // Get biome blend data for this chunk
      const biomeData = this.getBlendDataForChunk(chunkX, chunkZ)

      // Generate in worker with biome blending
      const workerResult = await this.world.generateSubChunkInWorker(
        coordinate,
        this.config.seed,
        this.config.seaLevel,
        minWorldY,
        maxWorldY,
        biomeData
      )

      // Apply results to the sub-chunk (pass worker-computed opacity to avoid main thread work)
      await this.world.applySubChunkData(
        coordinate,
        workerResult.blocks,
        workerResult.lightData,
        workerResult.isFullyOpaque
      )

      // Generate decorations (trees, etc) for this sub-chunk using the primary biome
      const subChunk = this.world.getSubChunk(coordinate)
      if (subChunk) {
        const biomeType = this.getBiomeForChunk(chunkX, chunkZ)
        const generator = this.getGeneratorForBiome(biomeType)
        await generator.generateSubChunkDecorations(subChunk, this.world)
      }

      // Generate cave entrances (once per chunk column)
      await this.tryGenerateEntrances(coordinate)

      this.generatedSubChunks.add(key)
    } catch (error) {
      console.error(`Failed to generate sub-chunk ${key}:`, error)
    } finally {
      this.generatingSubChunks.delete(key)
    }
  }

  /**
   * Try to generate cave entrances for the chunk column containing this sub-chunk.
   * Uses noise-based prediction to find guaranteed cave locations.
   * Only runs once per chunk column, and only if caves are enabled.
   */
  private async tryGenerateEntrances(coordinate: ISubChunkCoordinate): Promise<void> {
    const chunkX = Number(coordinate.x)
    const chunkZ = Number(coordinate.z)

    // Get the biome for this chunk to check cave settings
    const biomeType = this.getBiomeForChunk(chunkX, chunkZ)
    const biomeConfig = this.getWorkerBiomeConfig(biomeType)
    const caves = biomeConfig.caves
    if (!caves?.enabled || !caves.entrancesEnabled) {
      return
    }

    // Create a key for this chunk column
    const columnKey = `${coordinate.x},${coordinate.z}`

    // Only generate entrances once per column
    if (this.entrancesGenerated.has(columnKey)) {
      return
    }

    // Mark as generated (do this before generating to prevent duplicates)
    this.entrancesGenerated.add(columnKey)

    // Get the generator for height calculations
    const generator = this.getGeneratorForBiome(biomeType)

    // Track affected sub-chunks for batched remeshing
    const affectedSubChunks = new Set<string>()

    // World block setter that directly modifies chunk columns (no mesh/lighting triggers)
    const worldBlockSetter = (worldX: number, worldY: number, worldZ: number, blockId: number) => {
      // Calculate chunk coordinates
      const targetChunkX = BigInt(Math.floor(worldX / 32))
      const targetChunkZ = BigInt(Math.floor(worldZ / 32))
      const localX = ((worldX % 32) + 32) % 32
      const localZ = ((worldZ % 32) + 32) % 32

      // Get or skip if chunk column doesn't exist (don't create new chunks)
      const targetColumn = this.world.getChunkColumn({ x: targetChunkX, z: targetChunkZ })
      if (!targetColumn) {
        return
      }

      // Set block directly on chunk column (no mesh/lighting cascade)
      targetColumn.setBlockId(localX, worldY, localZ, blockId)

      // Track affected sub-chunk for later remeshing
      const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
      affectedSubChunks.add(`${targetChunkX},${targetChunkZ},${subY}`)
    }

    // Find entrance locations using noise prediction (guaranteed to find caves)
    const entrances = this.entranceGenerator.findEntranceLocations(
      coordinate.x,
      coordinate.z,
      caves,
      (worldX, worldZ) => generator.getHeightAt(worldX, worldZ)
    )

    // Carve all entrances
    for (const entrance of entrances) {
      this.entranceGenerator.carveEntrance(entrance, worldBlockSetter)
    }

    // Batch remesh all affected sub-chunks once
    for (const key of affectedSubChunks) {
      const [x, z, subY] = key.split(',').map(Number)
      const subChunk = this.world.getSubChunk({ x: BigInt(x), z: BigInt(z), subY })
      if (subChunk) {
        this.world.queueSubChunkForMeshing(subChunk)
      }
    }
  }
}
