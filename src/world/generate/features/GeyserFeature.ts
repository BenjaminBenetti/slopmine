import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for geyser vent generation.
 */
export interface GeyserFeatureSettings {
  /** Grid size for vent placement (larger = more spread out). */
  gridSize: number
  /**
   * Density multiplier; per-cell threshold = density / gridSize².
   * Expected vents per chunk = cells/chunk × threshold
   *   = (1024 / gridSize²) × (density / gridSize²) = 1024 × density / gridSize⁴.
   * e.g. gridSize 8 → 8⁴ = 4096 → density 3 ≈ 0.75 vents/chunk.
   */
  density: number
  /** Ground block a vent may replace (e.g. BlockIds.BASALT). */
  surfaceBlockId: number
  /** Skip vents whose surface is at or below this Y (keeps them out of lava pools). */
  minSurfaceY: number
}

/**
 * Geyser feature: small rocky basalt cones on flat volcanic surface spots.
 * Each geyser is a ragged 3x3 basalt mound rising 1-2 blocks (corners are
 * skipped deterministically, ring heights vary) with the GEYSER vent block
 * sitting on the elevated top center like a real geyser cone, and the
 * occasional SULFUR_ORE fleck on the mound sides. Eruptions are driven at
 * runtime by the GeyserSystem main-thread task (worldgen blocks never receive
 * scheduled ticks); the launch column above the vent block stays a clear 1x1
 * air shaft.
 */
export class GeyserFeature extends Feature {
  readonly settings: GeyserFeatureSettings

  constructor(settings: GeyserFeatureSettings) {
    super()
    this.settings = settings
  }

  /**
   * Generate a deterministic random number based on position.
   */
  private positionRandom(x: number, z: number, salt: number): number {
    const hash = Math.sin(x * 12.9898 + z * 78.233 + salt * 43758.5453) * 43758.5453
    return hash - Math.floor(hash)
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt } = context
    const { gridSize, density, surfaceBlockId, minSurfaceY } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Jittered grid for natural scattering
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 7001) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 7002) * gridSize)

        const ventWorldX = worldX + jitterX
        const ventWorldZ = worldZ + jitterZ

        // Probability check (see settings.density for the expected-count math)
        const chance = this.positionRandom(ventWorldX, ventWorldZ, 7000)
        if (chance > density / (gridSize * gridSize)) continue

        // The mound writes span groundHeight+1 .. groundHeight+moundHeight
        // (max +2), which may cross the sub-chunk top boundary: process the
        // vent from every sub-chunk its writes can touch and clamp each
        // write to this sub-chunk's Y range (all decisions below derive
        // deterministically from world coordinates, so every sub-chunk
        // computes the identical mound and writes only its slice).
        const groundHeight = getBaseHeightAt(ventWorldX, ventWorldZ)
        if (groundHeight < minSurfaceY) continue
        if (groundHeight + 2 < subChunkMinY || groundHeight > subChunkMaxY) continue

        // Don't place over cave mouths or ravines
        if (context.isSurfaceCarvedAt?.(ventWorldX, ventWorldZ)) continue

        // Flat-spot check: neighbors within 1 block of the vent height. Exact
        // equality rejected ~95% of candidates on rough volcanic terrain
        // (measured 0.04 vents/chunk vs the ~0.5 target); a 1-block lip still
        // reads as a ground fixture and keeps the launch column clear.
        if (
          Math.abs(getBaseHeightAt(ventWorldX + 1, ventWorldZ) - groundHeight) > 1 ||
          Math.abs(getBaseHeightAt(ventWorldX - 1, ventWorldZ) - groundHeight) > 1 ||
          Math.abs(getBaseHeightAt(ventWorldX, ventWorldZ + 1) - groundHeight) > 1 ||
          Math.abs(getBaseHeightAt(ventWorldX, ventWorldZ - 1) - groundHeight) > 1
        ) continue

        // Convert to local coordinates within this chunk; jitter may push the
        // mound outside — require the full 3x3 footprint in-chunk so mounds
        // never get sliced at chunk borders (the grid scan is chunk-local,
        // so a neighboring chunk would never generate the missing columns)
        const ventLocalX = ventWorldX - Number(coord.x) * CHUNK_SIZE_X
        const ventLocalZ = ventWorldZ - Number(coord.z) * CHUNK_SIZE_Z
        if (ventLocalX < 1 || ventLocalX >= CHUNK_SIZE_X - 1) continue
        if (ventLocalZ < 1 || ventLocalZ >= CHUNK_SIZE_Z - 1) continue

        const groundLocalY = groundHeight - subChunkMinY

        // Content checks run only where this sub-chunk can read (when the
        // mound spills into the sub-chunk above, the ground block itself is
        // out of range — the ground sub-chunk performed the strict check).
        if (groundLocalY >= 0) {
          // Strict surface check: only build on the biome's bare surface
          // block (skips magma valleys, craters, ore intrusions, lava pools)
          if (chunk.getBlockId(ventLocalX, groundLocalY, ventLocalZ) !== surfaceBlockId) continue
        }
        // The mound base must rise into open air (also guards the spillover
        // sub-chunk against building over lava pools it cannot see below)
        const baseLocalY = Math.max(groundLocalY + 1, 0)
        if (baseLocalY <= SUB_CHUNK_HEIGHT - 1) {
          const above = chunk.getBlockId(ventLocalX, baseLocalY, ventLocalZ)
          if (above !== BlockIds.AIR) continue
        }

        this.placeMound(
          context, ventWorldX, ventWorldZ, groundHeight,
          ventLocalX, ventLocalZ, subChunkMinY
        )
      }
    }
  }

  /**
   * Build the ragged 3x3 basalt mound with the GEYSER vent on top center.
   *
   * Shape (all rolls deterministic from world coordinates so every sub-chunk
   * that processes this vent computes the identical mound):
   * - moundHeight 1-2: the vent block sits at groundHeight + moundHeight,
   *   with basalt filling the center column beneath it.
   * - Edge-adjacent ring columns always exist, height 1 (or 2 on a tall
   *   mound, ~40% each) — usually below the vent so it sits proud, and never
   *   above it, keeping the 1x1 launch column over the vent clear.
   * - Corner columns are skipped ~55% of the time (ragged outline), height 1.
   * - Up to 2 edge ring tops become SULFUR_ORE flecks (~30% roll each, in
   *   fixed iteration order so the cap is deterministic).
   *
   * Every write is clamped to this sub-chunk's Y range (mounds may span the
   * sub-chunk boundary).
   */
  private placeMound(
    context: FeatureContext,
    ventWorldX: number,
    ventWorldZ: number,
    groundHeight: number,
    ventLocalX: number,
    ventLocalZ: number,
    subChunkMinY: number
  ): void {
    const { chunk } = context

    const moundHeight = 1 +
      (this.positionRandom(ventWorldX, ventWorldZ, 7005) < 0.5 ? 1 : 0)

    const writeBlock = (localX: number, worldY: number, localZ: number, blockId: number): void => {
      const localY = worldY - subChunkMinY
      if (localY < 0 || localY >= SUB_CHUNK_HEIGHT) return
      chunk.setBlockId(localX, localY, localZ, blockId)
    }

    // Ring columns (fixed iteration order for the deterministic sulfur cap)
    let sulfurFlecks = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue
        const bx = ventWorldX + dx
        const bz = ventWorldZ + dz
        const isCorner = dx !== 0 && dz !== 0

        // Ragged outline: drop most corners
        if (isCorner && this.positionRandom(bx, bz, 7006) < 0.55) continue

        // Ring height: corners stay low; edges occasionally rise to 2 on a
        // tall mound (never above the vent)
        const ringHeight = !isCorner && moundHeight > 1 &&
          this.positionRandom(bx, bz, 7007) < 0.4 ? 2 : 1

        // Occasional sulfur fleck on the visible top of an edge column
        const sulfurTop = !isCorner && sulfurFlecks < 2 &&
          this.positionRandom(bx, bz, 7008) < 0.3
        if (sulfurTop) sulfurFlecks++

        for (let h = 1; h <= ringHeight; h++) {
          const blockId = sulfurTop && h === ringHeight
            ? BlockIds.SULFUR_ORE
            : BlockIds.BASALT
          writeBlock(ventLocalX + dx, groundHeight + h, ventLocalZ + dz, blockId)
        }
      }
    }

    // Center column: basalt pedestal capped by the vent block
    for (let h = 1; h < moundHeight; h++) {
      writeBlock(ventLocalX, groundHeight + h, ventLocalZ, BlockIds.BASALT)
    }
    writeBlock(ventLocalX, groundHeight + moundHeight, ventLocalZ, BlockIds.GEYSER)
  }
}
