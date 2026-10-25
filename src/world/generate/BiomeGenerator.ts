import { TerrainGenerator } from './TerrainGenerator.ts'
import type { IChunkData } from '../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../WorldManager.ts'
import type { IDecorationWorld } from './IDecorationWorld.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../interfaces/IChunk.ts'
import { localToWorld } from '../coordinates/CoordinateUtils.ts'
import { FrameBudget } from '../../core/FrameBudget.ts'
import { Feature, type FeatureContext } from './features/Feature.ts'
import { CaveCarver } from './caves/CaveCarver.ts'
import { createConstantCaveSampleGetter, type CaveConfig } from './caves/CaveConfig.ts'
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

  /**
   * Optional block ID to place as a sandy bottom beneath water and along the shore.
   * When set, the top few terrain blocks under water are replaced with this block,
   * and shore blocks within shoreRadius are also replaced.
   * Typical value: BlockIds.SAND
   */
  readonly sandBlock?: number

  /**
   * Number of blocks of sand depth placed under water and on the shore.
   * Default: 3
   */
  readonly sandDepth?: number

  /**
   * How far above the water level shore sand extends (in Y levels).
   * Columns with terrain height between waterLevel and waterLevel + shoreRadius
   * will have their surface replaced with sand.
   * Default: 1
   */
  readonly shoreRadius?: number
}

// Cave generation configuration lives in ./caves/CaveConfig.ts.
// Re-exported here so biome generators can import it alongside WaterSettings.
export type { CaveConfig } from './caves/CaveConfig.ts'

/**
 * Configuration for biome-specific skybox and atmosphere modifications
 * (sky, distance fog, world light color). Blended across biome borders
 * around the player by BiomeSkyboxManager. All values are perceptual (sRGB):
 * a factor of 0.8 scales the displayed color by 0.8.
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

  /**
   * Horizon haze / distance fog color (sRGB, 0-1). Replaces the tinted sky
   * horizon color, so the sky's horizon band and the fog that distant terrain
   * fades into always match. `brightness` still applies on top.
   * Default: the default horizon color multiplied by `tint`.
   */
  readonly fogColor?: { r: number; g: number; b: number }

  /**
   * Aerial haze thickness multiplier (>= 1). 1 = clear air (distant terrain
   * picks up a light horizon-colored haze, 63% at ~1500 blocks); 2 = hazy
   * (63% at ~530 blocks). Absolute distances: the far view is tinted and
   * softened the same way whatever the render distance or LOD ring.
   * Default: 1
   */
  readonly fogDensity?: number

  /**
   * Fog (and sky) color when the camera is underground, below the sky-darkness
   * band (sRGB, 0-1). Only meaningful for caves and underground-layer biomes.
   * Default: black
   */
  readonly undergroundFogColor?: { r: number; g: number; b: number }

  /**
   * Color multiplier for the world's sun, ambient and sky/ground light
   * (RGB 0-1). Keep it close to white - it colors every lit face.
   * Default: { r: 1, g: 1, b: 1 } (no tint)
   */
  readonly lightTint?: { r: number; g: number; b: number }

  /**
   * Light floor while the camera is in this biome: the light (linear RGB
   * multiplier of albedo) that remains where no sky or block light reaches.
   * Raise it where darkness is ambient rather than a cave (Hell's red glow,
   * like Minecraft's Nether ambient light).
   * Default: the cave floor, LIGHT_FLOOR grey (0.025) - caves barely show.
   */
  readonly minimumLight?: { r: number; g: number; b: number }

  /**
   * Sky light brightness while the camera is in this biome (0-1, linear):
   * overcast biomes dim everything lit by the sky - terrain, far terrain,
   * water, the held item, mobs - eased smoothly across biome borders, like
   * weather. Prefer this to a `skylightValue` cap for mood: a cap is baked
   * per chunk into the light data, so its biome border shows as a hard
   * 32-block brightness step.
   * No surface biome uses it: darkness comes from the clouds and the weather
   * (cloud cover, cloud shadows, the weathers' looks), not a biome-wide dimmer
   * (Ben - the coastal rainforest's 0.82 and the swamp's 0.62 read as always
   * shaded once clouds cast real shadows).
   * Default: 1
   */
  readonly daylight?: number

  /**
   * The sky's cloud deck while the camera is in this biome, eased across
   * biome borders like the rest of the atmosphere:
   * - `coverage`: fraction of the sky covered (0-1). Default 0.42 (fair weather)
   * - `color`: sRGB multiplier of the cloud colour (grey overcast, dark ash).
   *   Default white
   * - `opacity`: cloud density multiplier (0-1). Default 1
   */
  readonly clouds?: {
    readonly coverage?: number
    readonly color?: { r: number; g: number; b: number }
    readonly opacity?: number
  }
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
   * Which vertical layer this biome belongs to.
   * - Layer 1 (default): Surface biomes (Y=128-511, sub-chunks 4-15)
   * - Layer 0: Underground biomes (Y=0-127, sub-chunks 0-3)
   *
   * If not specified, defaults to 1 (surface layer).
   */
  readonly layer?: 0 | 1
  /**
   * Determines how many trees (or other large vegetation features) will attempt to generate in each chunk within this biome.
   * A higher density value means more trees will be scattered across the landscape.
   */
  readonly treeDensity: number
  /**
   * Skylight cap for this biome's sub-chunks (0-15, default 15): stored sky
   * light in a sub-chunk never exceeds it. Enforced by the generation
   * worker's local light pass (SubChunkLight) and by the main-thread
   * LightEngine when light crosses sub-chunk and column borders.
   *
   * The cap is baked per 32-block sub-chunk into the light data, so a biome
   * border shows as a hard 32-block brightness step. Use it only for
   * underground biomes that must never see the sky (Hell = 0). A surface
   * biome's gloom comes from its clouds and weather (see `SkyboxSettings.daylight`).
   */
  readonly skylightValue?: number
  /**
   * A list of special geographical or structural elements (like custom rock formations, small ponds, or unique structures) that can appear in this biome.
   * These features are added on top of the base terrain.
   */
  readonly features: Feature[]
  /**
   * Optional settings specifically for how caves generate within this biome.
   * If not provided, no caves will generate in this biome.
   */
  readonly caves?: CaveConfig

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
   * Optional settings for biome-specific skybox/atmosphere modifications
   * (sky tint, horizon fog, world light tint).
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
    world: IDecorationWorld
  ): Promise<void> {
    // Default: no-op - override in subclasses
  }

  /**
   * Generate caves by carving air pockets in the terrain.
   * Main-thread path: no biome blending, so the resolved parameters of this
   * biome apply uniformly (the worker path blends across biome borders).
   */
  protected async generateCaves(chunk: IChunkData): Promise<void> {
    const caves = this.properties.caves
    if (!caves?.enabled) return

    // Lazy initialization of cave carver
    if (!this.caveCarver) {
      this.caveCarver = new CaveCarver(this.config.seed)
    }

    this.caveCarver.carve(
      chunk,
      createConstantCaveSampleGetter(caves),
      (worldX, worldZ) => this.getHeightAt(worldX, worldZ)
    )
  }

  /**
   * Main generation method.
   */
  async generate(chunk: IChunkData, world: WorldManager | null): Promise<void> {
    await this.generateTerrain(chunk)
    await this.generateCaves(chunk)
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
