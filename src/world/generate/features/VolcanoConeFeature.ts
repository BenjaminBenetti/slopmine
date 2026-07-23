import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for volcano cone generation.
 */
export interface VolcanoConeFeatureSettings {
  /** Cone spacing grid size (larger = rarer). */
  gridSize: number
  /** Cone density multiplier; per-cell chance = density / gridSize². */
  density: number
  /** Minimum cone height above local terrain. */
  minHeight: number
  /** Maximum cone height above local terrain. */
  maxHeight: number
  /**
   * Minimum base terrain height for a cone root. Keeps cones from rooting
   * inside lava lakes (volcanic lakes surface at Y=238).
   */
  minBaseHeight: number
}

/**
 * Max reach of biome-border dithering (see GiantConiferFeature). The probe
 * ring below sits at coneRadius + this margin so no part of the cone can
 * cross into a foreign biome region (which would never render its slice).
 */
const BIOME_BORDER_MARGIN = 16

/** Flank slope range (blocks of rise per block of run) — ~48°-53°. */
const MIN_SLOPE = 1.1
const SLOPE_VARIANCE = 0.3

/** Radius-jitter amplitude for ragged ridges (fraction of distance). */
const EDGE_JITTER = 0.1

/** Caldera rim radius jitter (fraction) — irregular, non-circular rims. */
const RIM_JITTER = 0.15

/** Magma core column radius. */
const CORE_RADIUS = 2.2

/**
 * Fraction of the apex height remaining at the caldera rim:
 * pow(1 - rimMax/R, 1.25) with rimMax/R ≈ 0.22·1.15 ≈ 0.25 → ~0.7.
 */
const APEX_TRUNCATION = 0.7

/**
 * Deterministic parameters for one volcano instance.
 */
interface VolcanoParams {
  /** Rim height above the base elevation (the visible summit rise). */
  height: number
  /**
   * Height of the un-truncated mathematical apex. The caldera truncates the
   * profile at ~0.7 of the apex, so the apex is scaled up to make the RIM
   * land `height` blocks above the base.
   */
  apexHeight: number
  /** Base flank radius. */
  radius: number
  /** Nominal caldera (crater) radius. */
  calderaRadius: number
  /** Caldera bowl depth below the guaranteed rim height. */
  calderaDepth: number
  /** Flank lava streams: direction unit vectors + run lengths. */
  streams: Array<{ ux: number; uz: number; length: number }>
}

/**
 * Volcano cone feature: rare, large basalt stratovolcanoes rising 40-60
 * blocks above local terrain, with a lava-filled summit caldera and 1-3
 * short lava streams carved into the flanks.
 *
 * Follows the GiantConiferFeature extended-grid pattern: the placement grid
 * is WORLD-anchored (grid lines at global multiples of gridSize) and every
 * cone parameter derives deterministically from the cone's world position,
 * so all chunks/sub-chunks render identical slices of the same cone.
 *
 * Runs AFTER cave carving, so the entire cone interior is written as solid
 * basalt (unconditionally overwriting carved cave air inside the footprint),
 * with a solid magma core column. Lava containment invariants (matching
 * LiquidPhysicsAlgorithm: sources on a solid floor spread sideways into air
 * at their own Y; liquid on liquid never spreads sideways):
 * - Caldera lava surface sits 2 blocks below the guaranteed (minimum-jitter)
 *   rim height, so every lateral neighbor at lava Y is basalt rim/bowl wall,
 *   and the bowl floor is solid basalt many blocks thick.
 * - Stream lava sits 2 blocks below the local cone surface inside a carved
 *   channel; channel walls and the uncarved downhill column (slope < 2)
 *   enclose it laterally. Streams start OUTSIDE the maximum rim jitter so
 *   they never notch the caldera and drain it.
 */
export class VolcanoConeFeature extends Feature {
  readonly settings: VolcanoConeFeatureSettings

  constructor(settings: VolcanoConeFeatureSettings) {
    super()
    this.settings = settings
  }

  /**
   * Deterministic pseudo-random number from world position + salt.
   */
  private positionRandom(x: number, z: number, salt: number): number {
    const hash = Math.sin(x * 12.9898 + z * 78.233 + salt * 43758.5453) * 43758.5453
    return hash - Math.floor(hash)
  }

  /**
   * Largest possible flank radius, including edge jitter expansion.
   */
  private maxConeRadius(): number {
    const maxApex = this.settings.maxHeight / APEX_TRUNCATION
    return Math.ceil((maxApex / MIN_SLOPE) / (1 - EDGE_JITTER)) + 2
  }

  private shouldPlaceCone(coneWorldX: number, coneWorldZ: number): boolean {
    const { density, gridSize } = this.settings
    const chance = this.positionRandom(coneWorldX, coneWorldZ, 0)
    return chance <= density / (gridSize * gridSize)
  }

  /**
   * Derive all cone parameters deterministically from world position.
   */
  private getConeParams(coneWorldX: number, coneWorldZ: number): VolcanoParams {
    const { minHeight, maxHeight } = this.settings

    const height = minHeight +
      Math.floor(this.positionRandom(coneWorldX, coneWorldZ, 10) * (maxHeight - minHeight + 1))
    const slope = MIN_SLOPE + this.positionRandom(coneWorldX, coneWorldZ, 11) * SLOPE_VARIANCE
    const apexHeight = Math.round(height / APEX_TRUNCATION)
    const radius = apexHeight / slope
    const calderaRadius = Math.max(4,
      Math.round(radius * 0.22 + this.positionRandom(coneWorldX, coneWorldZ, 12) * 2))
    const calderaDepth = 9 + Math.floor(this.positionRandom(coneWorldX, coneWorldZ, 13) * 5)

    const streamCount = 1 + Math.floor(this.positionRandom(coneWorldX, coneWorldZ, 14) * 3)
    const streams: VolcanoParams['streams'] = []
    for (let i = 0; i < Math.min(streamCount, 3); i++) {
      const angle = this.positionRandom(coneWorldX, coneWorldZ, 20 + i) * Math.PI * 2
      const length = 10 + Math.floor(this.positionRandom(coneWorldX, coneWorldZ, 30 + i) * 11)
      streams.push({ ux: Math.cos(angle), uz: Math.sin(angle), length })
    }

    return { height, apexHeight, radius, calderaRadius, calderaDepth, streams }
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, biomeProperties } = context
    const { gridSize, minBaseHeight } = this.settings
    const coord = chunk.coordinate

    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // WORLD-anchored extended grid (grid lines at global multiples of
    // gridSize, never chunk-anchored) so every chunk computes the identical
    // cone set — chunk-anchored grids seam-tear cross-chunk structures.
    const searchRadius = this.maxConeRadius()
    const firstGridX = Math.floor((chunkWorldX - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridX = chunkWorldX + CHUNK_SIZE_X - 1 + searchRadius
    const firstGridZ = Math.floor((chunkWorldZ - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + searchRadius

    for (let gridX = firstGridX; gridX <= lastGridX; gridX += gridSize) {
      for (let gridZ = firstGridZ; gridZ <= lastGridZ; gridZ += gridSize) {
        const jitterX = Math.floor(this.positionRandom(gridX, gridZ, 1) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(gridX, gridZ, 2) * gridSize)
        const coneX = gridX + jitterX
        const coneZ = gridZ + jitterZ

        if (!this.shouldPlaceCone(coneX, coneZ)) continue

        const baseElev = getBaseHeightAt(coneX, coneZ)
        // Never root a cone inside a lava lake bed
        if (baseElev < minBaseHeight) continue

        const params = this.getConeParams(coneX, coneZ)

        // Vertical clip: skip if the cone can't touch this sub-chunk.
        // apexHeight is the safe upper bound (rim jitter can push rim
        // columns above baseElev + height).
        const summitY = baseElev + params.apexHeight + 2
        if (summitY < subChunkMinY || baseElev - 30 > subChunkMaxY) continue
        if (summitY > 508) continue // world height guard (Y 0-511)

        // Biome-region border veto: probe a ring at radius + dither margin.
        // A cone whose footprint crosses into a foreign biome region renders
        // partially (that biome's chunks never run this feature).
        if (context.getBiomeNameAt) {
          const owner = biomeProperties.name
          const probeR = Math.ceil(params.radius / (1 - EDGE_JITTER)) + BIOME_BORDER_MARGIN
          let nearForeignBiome = false
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2
            const px = coneX + Math.round(Math.cos(a) * probeR)
            const pz = coneZ + Math.round(Math.sin(a) * probeR)
            if (context.getBiomeNameAt(px, pz) !== owner) {
              nearForeignBiome = true
              break
            }
          }
          if (nearForeignBiome) continue
          if (context.getBiomeNameAt(coneX, coneZ) !== owner) continue
        }

        this.placeCone(context, coneX, coneZ, baseElev, params,
          subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)
      }
    }
  }

  /**
   * Place the cone, clipped to this chunk's XZ bounds and sub-chunk Y range.
   * All per-column math is deterministic from world coordinates.
   */
  private placeCone(
    context: FeatureContext,
    coneX: number,
    coneZ: number,
    baseElev: number,
    params: VolcanoParams,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const { chunk, noise, getBaseHeightAt } = context
    const { apexHeight, radius, calderaRadius, calderaDepth, streams } = params

    // Guaranteed rim height: cone profile evaluated at the LARGEST possible
    // jittered rim radius. Every actual rim column is at least this tall, so
    // lava filled to rimMinY - 2 is always laterally enclosed by basalt.
    const rimMax = calderaRadius * (1 + RIM_JITTER)
    const rimMinY = Math.floor(baseElev + apexHeight * Math.pow(1 - rimMax / radius, 1.25))
    const lavaY = rimMinY - 2

    // Streams start outside the max jittered rim so they never breach the
    // caldera wall, and stop well short of the skirt so the channel stays
    // carved into solid cone flank.
    const streamStart = rimMax + 2
    const maxStreamEnd = radius * 0.85

    // XZ iteration bounds: cone reach (incl. jitter expansion) ∩ this chunk
    const reach = Math.ceil(radius / (1 - EDGE_JITTER)) + 1
    const xStart = Math.max(coneX - reach, chunkWorldX)
    const xEnd = Math.min(coneX + reach, chunkWorldX + CHUNK_SIZE_X - 1)
    const zStart = Math.max(coneZ - reach, chunkWorldZ)
    const zEnd = Math.min(coneZ + reach, chunkWorldZ + CHUNK_SIZE_Z - 1)
    if (xStart > xEnd || zStart > zEnd) return

    for (let worldX = xStart; worldX <= xEnd; worldX++) {
      for (let worldZ = zStart; worldZ <= zEnd; worldZ++) {
        const dx = worldX - coneX
        const dz = worldZ - coneZ
        const dist = Math.sqrt(dx * dx + dz * dz)

        // Ragged ridges: jitter the effective distance with low-frequency
        // noise (deterministic per column — same world seed in every worker).
        const edgeNoise = noise.noise2D(worldX * 0.09 + 7100, worldZ * 0.09 + 7100)
        const effDist = dist * (1 + EDGE_JITTER * edgeNoise)
        if (effDist >= radius) continue

        // Irregular caldera rim radius per column (clamped to [.., rimMax]
        // so the rimMinY / lavaY containment guarantee holds everywhere)
        const rimNoise = noise.noise2D(worldX * 0.13 + 8200, worldZ * 0.13 + 8200)
        const rimJ = Math.min(rimMax,
          Math.max(3, calderaRadius * (1 + RIM_JITTER * rimNoise)))

        const terrain = getBaseHeightAt(worldX, worldZ)
        const inCrater = effDist < rimJ

        // Stratovolcano profile: steep, slightly concave flanks. Inside the
        // crater the shell height is evaluated at the rim (plateau) before
        // the bowl is subtracted below.
        const profileDist = Math.max(effDist, rimJ)
        const coneY = Math.floor(baseElev + apexHeight * Math.pow(1 - profileDist / radius, 1.25))

        // Buried skirt: nothing to add where the flank dips under terrain
        if (!inCrater && coneY <= terrain) continue

        // Base blends into terrain: fill starts a few blocks below the
        // local surface, crushing any cave air carved inside the footprint
        const bottomY = Math.min(terrain, baseElev) - 6

        // Column classification -----------------------------------------
        let basaltTop = coneY   // solid fill top (basalt/magma/obsidian)
        let lavaFrom = -1       // inclusive lava fill range (world Y)
        let lavaTo = -2
        let isCore = false
        let obsidianAccent = false
        let smolderAccent = false

        if (inCrater) {
          // Caldera bowl: steep inner walls, flat-ish floor, filled with
          // lava up to 2 below the guaranteed rim. Floor and everything
          // beneath it is solid basalt (whole interior is filled), so the
          // caldera cannot drain into caves.
          const bowlDepth = calderaDepth * Math.min(1, (1 - effDist / rimJ) * 2.2)
          const floorY = Math.floor(rimMinY - bowlDepth)
          basaltTop = Math.min(coneY, floorY)
          if (basaltTop < lavaY) {
            lavaFrom = basaltTop + 1
            lavaTo = lavaY
          }
          // Solid magma core column up the conduit, capped 4 blocks below
          // the bowl floor to keep the basalt-floor spec
          isCore = dist < CORE_RADIUS

          // Smoldering stone paves the caldera floor DIRECTLY BENEATH the lava
          // (~30% of submerged floor columns). The smoke system walks up
          // through the lava to emit at the surface, so plumes appear to pour
          // off the lava lake itself. Purely a swap of the top floor block —
          // lava containment (rim clamps, floor fill) is untouched, and the
          // block still sits under a full lava column.
          if (basaltTop < lavaY) {
            smolderAccent = this.positionRandom(worldX, worldZ, 42) < 0.30
          }
        } else {
          // Flank lava streams: shallow carved channels. Lava rests 2 below
          // the local surface on solid basalt; the two cells above are left
          // open. Lateral walls are the uncarved neighbors' higher surface,
          // and the channel terminus faces the uncarved downhill column
          // (slope < 2), so the stream is contained at rest.
          for (const s of streams) {
            const along = dx * s.ux + dz * s.uz
            const cross = Math.abs(dx * s.uz - dz * s.ux)
            const streamEnd = Math.min(streamStart + s.length, maxStreamEnd)
            if (cross <= 1.4 && along >= streamStart && along <= streamEnd &&
                coneY - 2 > terrain + 2) {
              basaltTop = coneY - 3
              lavaFrom = coneY - 2
              lavaTo = coneY - 2
              break
            }
          }

          // Rim shoulder accent: sparse obsidian (~18%), a surface-only swap.
          // (Smoldering stone now lives under the lava, not on the rim.)
          if (lavaFrom < 0 && Math.abs(effDist - rimJ) < 1.3) {
            obsidianAccent = this.positionRandom(worldX, worldZ, 40) < 0.18
          }
        }

        // Column write, clipped to this sub-chunk ------------------------
        const topY = Math.max(basaltTop, lavaTo)
        const yFrom = Math.max(bottomY, subChunkMinY, 0)
        const yTo = Math.min(topY, subChunkMaxY)
        if (yFrom > yTo) continue

        const localX = worldX - chunkWorldX
        const localZ = worldZ - chunkWorldZ
        const coreTop = basaltTop - 4

        // Buried treasure: the inner core (within 55% of the flank radius),
        // at least 3 blocks beneath this column's solid surface, hides a
        // deterministic scatter of gold (~2.5%) and diamond (~0.8%) blocks.
        // Rough yield for a typical cone (height 50 → radius ~57): core area
        // π·(0.55·57)² ≈ 3100 columns × ~30 eligible blocks/column ≈ 90k
        // blocks → ~2200 gold + ~700 diamond, a dense-but-not-solid scatter
        // through a large volume of hard basalt the player must tunnel into.
        const treasureCore = effDist < radius * 0.55
        const treasureTop = basaltTop - 3

        for (let worldY = yFrom; worldY <= yTo; worldY++) {
          const localY = worldY - subChunkMinY
          let blockId: number
          if (worldY >= lavaFrom && worldY <= lavaTo) {
            blockId = BlockIds.LAVA
          } else if (worldY > basaltTop) {
            continue // open channel head-space above stream lava
          } else if (isCore && worldY <= coreTop) {
            blockId = BlockIds.MAGMA
          } else if (smolderAccent && worldY === basaltTop) {
            blockId = BlockIds.SMOLDERING_STONE
          } else if (obsidianAccent && worldY === basaltTop) {
            blockId = BlockIds.OBSIDIAN
          } else if (treasureCore && worldY <= treasureTop) {
            const r = this.positionRandom(worldX, worldZ, 50 + worldY * 7)
            if (r < 0.008) blockId = BlockIds.DIAMOND_BLOCK
            else if (r < 0.033) blockId = BlockIds.GOLD_BLOCK
            else blockId = BlockIds.BASALT
          } else {
            blockId = BlockIds.BASALT
          }
          chunk.setBlockId(localX, localY, localZ, blockId)
        }
      }
    }
  }
}
