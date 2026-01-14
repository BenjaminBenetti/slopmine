import { TerrainGenerator } from './TerrainGenerator.ts'
import type { IChunkData } from '../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../WorldManager.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../interfaces/IChunk.ts'
import { localToWorld } from '../coordinates/CoordinateUtils.ts'
import { FrameBudget } from '../../core/FrameBudget.ts'
import { Feature, type FeatureContext } from './features/Feature.ts'
import { CaveCarver } from './caves/CaveCarver.ts'
import { SkylightPropagator } from '../lighting/SkylightPropagator.ts'
import { evaluateTerrainConfig } from './terrain/NoiseEvaluator.ts'
import type { TerrainConfig } from './terrain/TerrainConfig.ts'
import type { SimplexNoise } from './SimplexNoise.ts'
import type { BlockId } from '../interfaces/IBlock.ts'
import type { EntitySpawnConfig } from '../../entities/spawning/EntitySpawnConfig.ts'

/**
 * Configuration for water/liquid generation within a biome.
 */
export interface WaterSettings {
  /**
   * Turns water generation on or off for this specific biome.
   * If set to `false`, no water will appear in this biome.
   */
  readonly enabled: boolean

  /**
   * The block ID to use for water in this biome.
   * Allows for different liquid types (e.g., water, swamp water, lava in future).
   */
  readonly liquidBlock: BlockId

  /**
   * The Y level at which water surfaces will appear.
   * Water fills any terrain depression below this level.
   * Typically set slightly below seaLevel for natural-looking shores.
   */
  readonly waterLevel: number

  /**
   * Controls how common water pools are in the biome.
   * Uses noise to create distinct water regions rather than random per-block.
   * 0.0 = very rare pools, 0.5 = moderate, 1.0 = water everywhere terrain allows.
   * The noise creates natural-looking pool boundaries.
   */
  readonly frequency: number

  /**
   * Minimum depth of depression required for water to spawn.
   * Water only appears where (waterLevel - terrainHeight) >= minDepth.
   * Higher values = fewer, deeper pools. Lower values = more shallow puddles.
   * Example: minDepth=2 means terrain must be at least 2 blocks below waterLevel.
   */
  readonly minDepth: number
}

/**
 * Configuration for cave generation within a biome.
 */
export interface CaveSettings {
  /**
   * Turns cave generation on or off for this specific biome.
   * If set to `true`, caves will generate; if `false`, no caves will appear in this biome.
   */
  readonly enabled: boolean

  /**
   * Controls how often and long the 'spaghetti-like' cave tunnels appear.
   * A lower value (e.g., 0.01) creates longer, more winding tunnels, while a higher value creates shorter, more frequent ones.
   */
  readonly frequency: number
  /**
   * Determines how much of the rock is carved away to form caves.
   * A lower value (e.g., 0.01) results in larger and more numerous caves, making the underground feel more open.
   * A higher value makes caves smaller and less frequent, leading to a more solid underground.
   */
  readonly threshold: number
  /**
   * The lowest point in the world where these caves can begin to form.
   * Caves will not generate below this Y-level, leaving the deep underground mostly solid.
   */
  readonly minY: number
  /**
   * The highest point in the world where these caves can reach.
   * Caves will not generate above this Y-level, ensuring that the surface and sky remain undisturbed by cave openings (unless `entrancesEnabled` is on).
   */
  readonly maxY: number

  /**
   * The number of distinct horizontal layers of caves that will generate.
   * For example, a value of `1` creates a single main cave system, while `3` creates multiple distinct levels of caves stacked vertically.
   */
  readonly layerCount: number
  /**
   * The vertical distance between the centers of each cave layer.
   * A larger value will create more space between cave layers, making them feel more distinct.
   * A smaller value will make layers closer, potentially merging them into larger, more complex systems.
   */
  readonly layerSpacing: number
  /**
   * The central Y-level around which the cave layers are distributed.
   * This acts as the anchor point for all cave layers, influencing their overall vertical position in the world.
   */
  readonly layerPeakY: number

  /**
   * Toggles the generation of large, open cavern-like areas, often referred to as 'cheese caves'.
   * If `true`, these expansive chambers will appear alongside the regular tunnels.
   */
  readonly cheeseEnabled: boolean
  /**
   * Controls the size and frequency of the large 'cheese caves'.
   * A lower value (e.g., 0.005) will create massive, sprawling chambers, while a higher value will result in smaller, more numerous ones.
   */
  readonly cheeseFrequency: number
  /**
   * Adjusts how much rock is removed to create the large 'cheese caves'.
   * A higher value (e.g., 0.7) will make these chambers less common and more confined, while a lower value will make them more prevalent and vast.
   */
  readonly cheeseThreshold: number

  /**
   * Determines if caves can have openings that reach the surface of the world.
   * If `true`, you might find natural entrances to cave systems on the landscape.
   */
  readonly entrancesEnabled: boolean
  /**
   * Sets the minimum size for a cave entrance that reaches the surface.
   * A larger value ensures that surface entrances are always wide and easily noticeable.
   */
  readonly entranceMinWidth: number
  /**
   * Controls how rare cave entrances are.
   * A lower value (e.g., 0.3) makes entrances more common, while a higher value (e.g., 0.8) makes them rare.
   */
  readonly entranceThreshold?: number
}

/**
 * Configuration for biome-specific skybox modifications.
 * Used to create atmospheric effects that vary by biome.
 */
export interface SkyboxSettings {
  /**
   * Brightness multiplier for the skybox (0.0 to 1.0).
   * 1.0 = normal brightness, 0.5 = half brightness, 0.0 = completely dark.
   * Default: 1.0
   */
  readonly brightness?: number

  /**
   * Color tint to apply to the skybox (RGB values 0-1).
   * The tint is multiplied with the base sky colors.
   * Default: { r: 1, g: 1, b: 1 } (no tint)
   */
  readonly tint?: { r: number; g: number; b: number }
}

export interface BiomeProperties {
  /** The unique name of this biome, used for identification. */
  readonly name: string
  /**
   * Controls how likely this biome is to spawn relative to other biomes.
   * Higher values mean more frequent spawning. Values are relative weights,
   * so if all biomes have frequency 1.0, they spawn equally.
   */
  readonly frequency: number
  /**
   * Determines how many trees (or other large vegetation features) will attempt to generate in each chunk within this biome.
   * A higher density value means more trees will be scattered across the landscape.
   */
  readonly treeDensity: number
  /**
   * Controls the maximum skylight level for this biome (0-15).
   * Default is 15 (full brightness). Lower values create darker, spookier biomes.
   * This affects the flood-fill lighting algorithm during world generation.
   */
  readonly skylightValue?: number
  /**
   * A list of special geographical or structural elements (like custom rock formations, small ponds, or unique structures) that can appear in this biome.
   * These features are added on top of the base terrain.
   */
  readonly features: Feature[]
  /**
   * Optional settings specifically for how caves generate within this biome.
   * If not provided, default or no cave generation rules will apply.
   */
  readonly caves?: CaveSettings

  /**
   * Optional settings for water/liquid generation within this biome.
   * If not provided, no water will generate in this biome.
   */
  readonly water?: WaterSettings

  /**
   * Terrain configuration for height generation.
   * Defines noise layers, height scaling, and combination mode.
   */
  readonly terrainConfig: TerrainConfig

  /**
   * Optional settings for biome-specific skybox modifications.
   * If not provided, the skybox will use default settings (no modification).
   */
  readonly skybox?: SkyboxSettings

  /**
   * Optional entity spawn configurations for this biome.
   * Defines what entities can spawn naturally and at what rates.
   */
  readonly entitySpawns?: EntitySpawnConfig[]
}

/**
 * Abstract biome generator that provides biome-specific terrain generation.
 */
export abstract class BiomeGenerator extends TerrainGenerator {
  protected abstract readonly properties: BiomeProperties
  protected readonly frameBudget = new FrameBudget()
  private caveCarver: CaveCarver | null = null
  private readonly skylightPropagator = new SkylightPropagator()

  /**
   * Fill a chunk/sub-chunk with terrain blocks. Must be implemented by each biome.
   * Only processes blocks within the given Y range for efficient sub-chunk generation.
   *
   * @param chunk The chunk data to write blocks into
   * @param minY Minimum world Y coordinate to fill (inclusive)
   * @param maxY Maximum world Y coordinate to fill (inclusive)
   * @param noise The noise generator for additional variation
   * @param getHeightAt Function to get terrain height at world coordinates
   */
  protected abstract fillChunk(
    chunk: IChunkData,
    minY: number,
    maxY: number,
    noise: SimplexNoise,
    getHeightAt: (worldX: number, worldZ: number) => number
  ): void

  /**
   * Get the biome properties for serialization to workers.
   */
  getBiomeProperties(): BiomeProperties {
    return this.properties
  }

  /**
   * Generate decorations only (trees, flowers, etc).
   * Called after worker has generated terrain/caves/lighting/features.
   */
  async generateDecorationsOnly(chunk: IChunkData, world: WorldManager | null): Promise<void> {
    await this.generateDecorations(chunk, world)
  }

  /**
   * Get base terrain height at world coordinates (before features).
   */
  override getHeightAt(worldX: number, worldZ: number): number {
    const height = evaluateTerrainConfig(
      this.noise,
      this.properties.terrainConfig,
      worldX,
      worldZ,
      this.config.seaLevel
    )
    return Math.floor(height)
  }

  /**
   * Generate the base terrain by calling fillChunk.
   * For full chunks, minY is 0 (no offset) and maxY covers the full height.
   */
  protected async generateTerrain(chunk: IChunkData): Promise<void> {
    const maxY = this.config.seaLevel + 100 // Allow for terrain above sea level

    // For full chunks, minY=0 means no Y offset (world Y = local Y)
    this.fillChunk(chunk, 0, maxY, this.noise, (worldX, worldZ) => this.getHeightAt(worldX, worldZ))
  }

  /**
   * Apply all features from the biome's feature list.
   */
  protected async generateFeatures(chunk: IChunkData, world: WorldManager | null): Promise<void> {
    const context: FeatureContext = {
      chunk,
      world,
      noise: this.noise,
      config: this.config,
      biomeProperties: this.properties,
      getBaseHeightAt: (worldX, worldZ) => this.getHeightAt(worldX, worldZ),
      frameBudget: this.frameBudget,
    }

    for (const feature of this.properties.features) {
      await feature.scan(context)
    }
  }

  /**
   * Generate decorations (trees, flowers, etc.). Override in subclasses.
   */
  protected async generateDecorations(
    chunk: IChunkData,
    world: WorldManager | null
  ): Promise<void> {
    // Default: no decorations - override in subclasses
  }

  /**
   * Generate decorations for a specific sub-chunk.
   * Called from the main thread after worker generation is applied.
   */
  async generateSubChunkDecorations(
    subChunk: ISubChunkData,
    world: WorldManager
  ): Promise<void> {
    // Default: no-op - override in subclasses
  }

  /**
   * Generate caves by carving air pockets in the terrain.
   */
  protected async generateCaves(chunk: IChunkData): Promise<void> {
    const caves = this.properties.caves
    if (!caves?.enabled) return

    // Lazy initialization of cave carver
    if (!this.caveCarver) {
      this.caveCarver = new CaveCarver(this.config.seed)
    }

    await this.caveCarver.carve(
      chunk,
      caves,
      (worldX, worldZ) => this.getHeightAt(worldX, worldZ),
      this.frameBudget
    )
  }

  /**
   * Main generation method.
   */
  async generate(chunk: IChunkData, world: WorldManager | null): Promise<void> {
    await this.generateTerrain(chunk)
    await this.generateCaves(chunk)
    this.skylightPropagator.propagate(chunk, this.properties.skylightValue ?? 15)
    await this.generateFeatures(chunk, world)
    await this.generateDecorations(chunk, world)
  }

  /**
   * Yield to the event loop to prevent blocking.
   * Uses requestAnimationFrame for smooth frame alignment.
   */
  protected yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()))
  }
}
