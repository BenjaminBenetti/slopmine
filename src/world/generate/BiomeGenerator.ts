import { TerrainGenerator } from './TerrainGenerator.ts'
import type { IChunkData } from '../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../interfaces/ISubChunkData.ts'
import type { WorldManager } from '../WorldManager.ts'
import type { BlockId } from '../interfaces/IBlock.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../interfaces/IChunk.ts'
import { localToWorld } from '../coordinates/CoordinateUtils.ts'
import { FrameBudget } from '../../core/FrameBudget.ts'
import { Feature, type FeatureContext } from './features/Feature.ts'
import { CaveCarver } from './caves/CaveCarver.ts'
import { SkylightPropagator } from '../lighting/SkylightPropagator.ts'

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
   * The block type that will form the very top layer of the terrain in this biome.
   * For example, this might be `dirt` or `sand`.
   */
  readonly surfaceBlock: BlockId
  /**
   * The block type found directly beneath the surface block in this biome.
   * For example, this could be `dirt` below grass, or `sandstone` below sand.
   */
  readonly subsurfaceBlock: BlockId
  /**
   * How many blocks deep the `subsurfaceBlock` layer extends before hitting the base block.
   * A higher value means a thicker layer of subsurface material.
   */
  readonly subsurfaceDepth: number
  /**
   * The primary block type that makes up the bulk of the terrain underneath the surface and subsurface layers.
   * This is typically `stone` in most biomes.
   */
  readonly baseBlock: BlockId
  /**
   * Controls the intensity of height variations in the biome's terrain.
   * A higher amplitude creates more dramatic hills and valleys, while a lower value results in flatter terrain.
   */
  readonly heightAmplitude: number
  /**
   * Shifts the entire terrain up or down from the standard sea level.
   * A positive offset raises the biome, creating elevated plateaus; a negative offset lowers it, forming depressions.
   */
  readonly heightOffset: number
  /**
   * Determines how many trees (or other large vegetation features) will attempt to generate in each chunk within this biome.
   * A higher density value means more trees will be scattered across the landscape.
   */
  readonly treeDensity: number
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
    const baseNoise = this.noise.fractalNoise2D(worldX, worldZ, 4, 0.5, 0.01)

    const { seaLevel } = this.config
    const { heightAmplitude, heightOffset } = this.properties

    const height = seaLevel + heightOffset + baseNoise * heightAmplitude

    return Math.floor(height)
  }

  /**
   * Generate the base terrain (stone/dirt/grass layers).
   * Yields based on time budget to prevent blocking the main thread.
   */
  protected async generateTerrain(chunk: IChunkData): Promise<void> {
    const { surfaceBlock, subsurfaceBlock, subsurfaceDepth, baseBlock } =
      this.properties
    const coord = chunk.coordinate

    this.frameBudget.startFrame()

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const height = this.getHeightAt(worldX, worldZ)

        this.fillColumn(
          chunk,
          localX,
          localZ,
          height,
          surfaceBlock,
          subsurfaceBlock,
          subsurfaceDepth,
          baseBlock
        )
      }
      // Yield when frame budget is exhausted
      await this.frameBudget.yieldIfNeeded()
    }
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
    this.skylightPropagator.propagate(chunk)
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
