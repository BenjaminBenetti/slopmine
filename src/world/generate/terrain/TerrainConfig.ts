/**
 * Terrain configuration types for biome-specific terrain generation.
 * These types are serializable and can be passed to workers.
 */

/**
 * Supported noise function types.
 * - 'fractal': Standard fractal Brownian motion noise (current default)
 * - 'ridged': Absolute value noise creating sharp ridges/peaks
 * - 'billowed': Absolute value noise creating soft dunes/clouds
 * - 'warped': Domain-warped noise for organic, twisty terrain
 */
export type NoiseType = 'fractal' | 'ridged' | 'billowed' | 'warped'

/**
 * How to combine multiple noise layers.
 * - 'add': Sum all layer values (default)
 * - 'multiply': Multiply layer values together
 * - 'max': Take the maximum value across layers
 * - 'min': Take the minimum value across layers
 */
export type CombineMode = 'add' | 'multiply' | 'max' | 'min'

/**
 * Configuration for a single noise layer in terrain generation.
 */
export interface NoiseLayerConfig {
  /** Type of noise function to use */
  readonly type: NoiseType

  /** Number of noise octaves (higher = more detail, slower) */
  readonly octaves: number

  /** Amplitude decay per octave (0.5 = each octave half as strong) */
  readonly persistence: number

  /** Base frequency scale (higher = more compressed terrain) */
  readonly scale: number

  /** Weight/contribution of this layer when combining */
  readonly weight: number

  /** Constant added to noise output before weighting */
  readonly offset?: number

  /**
   * Clamp the layer's (noise + offset) value to at least this, applied before
   * weighting. With a negative offset and clampMin 0, the layer contributes
   * only where the noise crests above the offset — e.g. ridged mountain
   * layers that raise peaks without deepening the valleys between them.
   */
  readonly clampMin?: number

  /** For 'warped' type: how far to offset coordinates (in blocks) */
  readonly warpStrength?: number

  /** For 'warped' type: frequency scale for the warp noise */
  readonly warpScale?: number
}

/**
 * Complete terrain height configuration for a biome.
 * Describes how to generate terrain height at any world position.
 */
export interface TerrainConfig {
  /** One or more noise layers that are combined to form the terrain */
  readonly layers: readonly NoiseLayerConfig[]

  /** Base height offset from sea level (replaces heightOffset) */
  readonly baseHeight: number

  /** Multiplier for combined noise value (replaces heightAmplitude) */
  readonly heightScale: number

  /** How to combine multiple layers */
  readonly combineMode: CombineMode

  /**
   * If true, baseHeight is an absolute world Y coordinate (seaLevel not added).
   * Use this for underground biomes where terrain is at low Y values.
   * Default: false (baseHeight is relative to seaLevel)
   */
  readonly absoluteHeight?: boolean
}

/**
 * Default terrain config matching the current fractal noise behavior.
 * Uses the exact same parameters as the original implementation:
 * - 4 octaves
 * - 0.5 persistence
 * - 0.01 scale (frequency)
 */
export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  layers: [
    {
      type: 'fractal',
      octaves: 4,
      persistence: 0.5,
      scale: 0.01,
      weight: 1.0,
    },
  ],
  baseHeight: 0,
  heightScale: 8,
  combineMode: 'add',
}
