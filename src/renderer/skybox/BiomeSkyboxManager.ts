import * as THREE from 'three'
import type { BiomeRegistry } from '../../world/generate/biomes/BiomeRegistry.ts'
import { BIOME_REGION_SIZE } from '../../world/generate/biomes/BiomeRegistry.ts'
import type { GenerationConfig } from '../../world/generate/GenerationConfig.ts'
import { LAYER_BOUNDARY_Y } from '../../world/generate/GenerationConfig.ts'
import type { SkyboxSettings } from '../../world/generate/BiomeGenerator.ts'
import {
  type BiomeAtmosphere, type AtmosphereTarget, createAtmosphereTarget, DEFAULT_CLOUD_COVERAGE, SKY_HORIZON_HEX,
} from './BiomeAtmosphere.ts'

/**
 * Default skybox settings when a biome doesn't specify any.
 */
const DEFAULT_SKYBOX: SkyboxSettings = {
  brightness: 1.0,
  tint: { r: 1, g: 1, b: 1 },
}

/** Upper bound for a biome's fog density multiplier. */
const MAX_FOG_DENSITY = 4

/**
 * A precomputed sample offset relative to the player, with its constant weight.
 */
interface SampleOffset {
  readonly dx: number
  readonly dz: number
  readonly weight: number
}

/**
 * Blends per-biome atmosphere settings (sky tint/brightness, fog color and
 * density, world light tint) around the player's position and feeds the
 * result to the shared BiomeAtmosphere, which eases toward it. Provides
 * smooth transitions when crossing biome boundaries.
 */
export class BiomeSkyboxManager {
  private readonly atmosphere: BiomeAtmosphere
  private readonly biomeRegistry: BiomeRegistry
  private readonly config: GenerationConfig

  // Cache of resolved per-biome atmosphere values (lazily populated)
  private readonly biomeAtmosphereCache: Map<string, AtmosphereTarget> = new Map()

  // Chunk size for world-to-chunk coordinate conversion
  private readonly CHUNK_SIZE = 32

  // Sample offsets around the player and their (constant) blend weights,
  // precomputed once since the ring geometry never changes - only the center
  // (player position) moves.
  private readonly sampleOffsets: SampleOffset[]
  private readonly totalWeight: number

  // The blended result is a step function of position that only changes when a
  // sample point crosses a 512-block biome-region boundary, so recompute at
  // most once per this many blocks of player movement (BiomeAtmosphere already
  // eases smoothly toward the target, so a coarse cadence is invisible).
  private readonly RECOMPUTE_CELL = 8
  private lastCellX = Number.NaN
  private lastCellZ = Number.NaN
  private lastLayer = -1

  // Reused blend accumulator/output to avoid per-recompute allocation.
  private readonly blended: AtmosphereTarget = createAtmosphereTarget()

  constructor(
    atmosphere: BiomeAtmosphere,
    biomeRegistry: BiomeRegistry,
    config: GenerationConfig
  ) {
    this.atmosphere = atmosphere
    this.biomeRegistry = biomeRegistry
    this.config = config

    this.sampleOffsets = this.buildSampleOffsets()
    let total = 0
    for (const offset of this.sampleOffsets) total += offset.weight
    this.totalWeight = total
  }

  /**
   * Precompute the radial sample offsets (relative to the player) and their
   * distance-based blend weights. Both are constant for the life of the manager.
   */
  private buildSampleOffsets(): SampleOffset[] {
    const offsets: SampleOffset[] = []

    const push = (dx: number, dz: number): void => {
      const distSq = dx * dx + dz * dz
      // Inverse-square falloff, avoiding division by zero at the player position.
      const weight = 1 / Math.max(1, distSq / 1000)
      offsets.push({ dx, dz, weight })
    }

    // Always include the player's exact position.
    push(0, 0)

    // Concentric rings.
    const rings = [32, 64, 96, 128]
    const anglesPerRing = [4, 8, 8, 8]
    for (let r = 0; r < rings.length; r++) {
      const radius = rings[r]
      const numAngles = anglesPerRing[r]
      for (let a = 0; a < numAngles; a++) {
        const angle = (a / numAngles) * Math.PI * 2
        push(Math.cos(angle) * radius, Math.sin(angle) * radius)
      }
    }

    return offsets
  }

  /**
   * Get the resolved atmosphere values for a biome type.
   * Caches the result for efficiency.
   */
  private getAtmosphereForBiome(biomeType: string): AtmosphereTarget {
    const cached = this.biomeAtmosphereCache.get(biomeType)
    if (cached) return cached

    // Get the biome generator to access its properties
    const registration = this.biomeRegistry.get(biomeType as any)
    // Create a temporary generator to get the biome properties
    const settings = registration
      ? registration.createGenerator(this.config).getBiomeProperties().skybox ?? DEFAULT_SKYBOX
      : DEFAULT_SKYBOX

    const resolved = resolveAtmosphere(settings)
    this.biomeAtmosphereCache.set(biomeType, resolved)
    return resolved
  }

  /**
   * Calculate the blended atmosphere based on player position and push it to
   * the shared BiomeAtmosphere.
   */
  private recomputeAndApply(worldX: number, worldZ: number, layer: 0 | 1): void {
    const out = this.blended
    out.skyBrightness = 0
    out.fogDensity = 0
    out.daylight = 0
    out.cloudCoverage = 0
    out.cloudOpacity = 0
    out.cloudTint.setRGB(0, 0, 0)
    out.skyTint.setRGB(0, 0, 0)
    out.horizonColor.setRGB(0, 0, 0)
    out.undergroundColor.setRGB(0, 0, 0)
    out.lightTint.setRGB(0, 0, 0)
    out.lightFloor.setRGB(0, 0, 0)

    for (const offset of this.sampleOffsets) {
      const sampleX = worldX + offset.dx
      const sampleZ = worldZ + offset.dz

      // Region coordinates, computed inline to avoid allocating a temporary.
      const chunkX = Math.floor(sampleX / this.CHUNK_SIZE)
      const chunkZ = Math.floor(sampleZ / this.CHUNK_SIZE)
      const regionX = Math.floor(chunkX / BIOME_REGION_SIZE)
      const regionZ = Math.floor(chunkZ / BIOME_REGION_SIZE)

      // Use selectBiomeForLayer to match the terrain generation for this layer.
      const biomeType = this.biomeRegistry.selectBiomeForLayer(
        regionX,
        regionZ,
        this.config.seed,
        layer
      )

      const a = this.getAtmosphereForBiome(biomeType)
      const w = offset.weight

      out.skyBrightness += a.skyBrightness * w
      out.fogDensity += a.fogDensity * w
      out.daylight += a.daylight * w
      out.cloudCoverage += a.cloudCoverage * w
      out.cloudOpacity += a.cloudOpacity * w
      addScaled(out.cloudTint, a.cloudTint, w)
      addScaled(out.skyTint, a.skyTint, w)
      addScaled(out.horizonColor, a.horizonColor, w)
      addScaled(out.undergroundColor, a.undergroundColor, w)
      addScaled(out.lightTint, a.lightTint, w)
      addScaled(out.lightFloor, a.lightFloor, w)
    }

    const inv = 1 / this.totalWeight
    out.skyBrightness *= inv
    out.fogDensity *= inv
    out.daylight *= inv
    out.cloudCoverage *= inv
    out.cloudOpacity *= inv
    out.cloudTint.multiplyScalar(inv)
    out.skyTint.multiplyScalar(inv)
    out.horizonColor.multiplyScalar(inv)
    out.undergroundColor.multiplyScalar(inv)
    out.lightTint.multiplyScalar(inv)
    out.lightFloor.multiplyScalar(inv)
    this.atmosphere.setTarget(out)
  }

  /**
   * Update the biome atmosphere based on player position.
   * Call this each tick with the player's world coordinates. The blend is only
   * recomputed when the player crosses into a new ~8-block cell or changes
   * vertical layer, since the result is otherwise unchanged.
   */
  update(worldX: number, worldY: number, worldZ: number): void {
    // Determine layer based on player height (same boundary as WorldGenerator).
    const layer: 0 | 1 = worldY < LAYER_BOUNDARY_Y ? 0 : 1

    const cellX = Math.floor(worldX / this.RECOMPUTE_CELL)
    const cellZ = Math.floor(worldZ / this.RECOMPUTE_CELL)

    if (cellX === this.lastCellX && cellZ === this.lastCellZ && layer === this.lastLayer) {
      return
    }
    this.lastCellX = cellX
    this.lastCellZ = cellZ
    this.lastLayer = layer

    this.recomputeAndApply(worldX, worldZ, layer)
  }
}

const scratchColor = new THREE.Color()

function addScaled(out: THREE.Color, c: THREE.Color, weight: number): void {
  out.r += c.r * weight
  out.g += c.g * weight
  out.b += c.b * weight
}

/**
 * Convert a biome's authored SkyboxSettings into linear atmosphere values.
 * `brightness` and the colours (tint, fog, underground fog, light tint,
 * cloud colour) are authored perceptually (sRGB): a brightness of 0.6 or a
 * tint channel of 0.8 scales the displayed colour by that factor.
 * `minimumLight` and `daylight` are linear light multipliers, used as is;
 * fog density and cloud coverage/opacity are plain scalars.
 */
function resolveAtmosphere(settings: SkyboxSettings): AtmosphereTarget {
  const out = createAtmosphereTarget()
  const tint = settings.tint ?? { r: 1, g: 1, b: 1 }
  const brightness = Math.max(0, Math.min(1, settings.brightness ?? 1))
  out.skyBrightness = scratchColor.setRGB(brightness, brightness, brightness, THREE.SRGBColorSpace).r
  out.skyTint.setRGB(tint.r, tint.g, tint.b, THREE.SRGBColorSpace)
  if (settings.fogColor) {
    const f = settings.fogColor
    out.horizonColor.setRGB(f.r, f.g, f.b, THREE.SRGBColorSpace)
  } else {
    out.horizonColor.set(SKY_HORIZON_HEX).multiply(out.skyTint)
  }
  if (settings.undergroundFogColor) {
    const u = settings.undergroundFogColor
    out.undergroundColor.setRGB(u.r, u.g, u.b, THREE.SRGBColorSpace)
  }
  out.fogDensity = Math.max(1, Math.min(MAX_FOG_DENSITY, settings.fogDensity ?? 1))
  out.daylight = Math.max(0, Math.min(1, settings.daylight ?? 1))
  const light = settings.lightTint ?? { r: 1, g: 1, b: 1 }
  out.lightTint.setRGB(light.r, light.g, light.b, THREE.SRGBColorSpace)
  if (settings.minimumLight) {
    // Already linear (a light multiplier, like LIGHT_FLOOR)
    const m = settings.minimumLight
    out.lightFloor.setRGB(m.r, m.g, m.b, THREE.LinearSRGBColorSpace)
  }
  const clouds = settings.clouds
  if (clouds) {
    out.cloudCoverage = Math.max(0, Math.min(1, clouds.coverage ?? DEFAULT_CLOUD_COVERAGE))
    out.cloudOpacity = Math.max(0, Math.min(1, clouds.opacity ?? 1))
    if (clouds.color) out.cloudTint.setRGB(clouds.color.r, clouds.color.g, clouds.color.b, THREE.SRGBColorSpace)
  }
  return out
}
