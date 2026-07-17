import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for tall (two-block) fern generation.
 */
export interface TallFernFeatureSettings {
  /** Density of fern patches (higher = more patches). */
  density: number
  /** Grid size for patch placement (larger = more spread out patches). */
  gridSize: number
  /** Minimum ferns per patch. */
  minPatchSize: number
  /** Maximum ferns per patch. */
  maxPatchSize: number
  /** Radius of each patch in blocks. */
  patchRadius: number
  /** Lower-half block (e.g. BlockIds.COASTAL_FERN). */
  bottomBlockId: number
  /** Upper-half block (e.g. BlockIds.COASTAL_FERN_TOP). */
  topBlockId: number
}

/**
 * Tall fern feature: places two-block ferns (bottom + top halves) in clumps,
 * following JungleFernFeature's patch layout. Because a fern spans two Y
 * levels, a plant can straddle a sub-chunk boundary; both halves derive from
 * the same deterministic patch math, so each sub-chunk places just its own
 * slice and the halves always join up.
 */
export class TallFernFeature extends Feature {
  readonly settings: TallFernFeatureSettings

  constructor(settings: TallFernFeatureSettings) {
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
    const { chunk, getBaseHeightAt, biomeProperties, frameBudget, isSurfaceCarvedAt } = context
    const { density, gridSize, minPatchSize, maxPatchSize, patchRadius } = this.settings
    const coord = chunk.coordinate

    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Ferns on sanded shore columns would fail the ground check only where
    // it can run, so skip the shoreline deterministically (same rule as the
    // tree features)
    const shoreRadius = biomeProperties.water?.shoreRadius ?? 1
    const minGroundHeight = biomeProperties.water?.enabled
      ? biomeProperties.water.waterLevel + shoreRadius
      : -Infinity

    frameBudget?.startFrame()

    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 811) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 812) * gridSize)

        const patchCenterX = worldX + jitterX
        const patchCenterZ = worldZ + jitterZ

        const patchChance = this.positionRandom(patchCenterX, patchCenterZ, 810)
        if (patchChance > density / (gridSize * gridSize)) continue

        // Process the patch if any part of a fern (bottom or top) can land
        // in this sub-chunk
        const centerGroundHeight = getBaseHeightAt(patchCenterX, patchCenterZ)
        const centerBottomY = centerGroundHeight + 1
        if (centerBottomY + 1 < subChunkMinY - patchRadius * 2 || centerBottomY > subChunkMaxY + patchRadius * 2) continue

        const patchSize = minPatchSize + Math.floor(
          this.positionRandom(patchCenterX, patchCenterZ, 813) * (maxPatchSize - minPatchSize + 1)
        )

        this.placeFernPatch(
          chunk, coord, patchCenterX, patchCenterZ, patchSize, patchRadius,
          subChunkMinY, subChunkMaxY, getBaseHeightAt, minGroundHeight,
          isSurfaceCarvedAt
        )
      }
    }

    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Place a clump of tall ferns around a center point.
   */
  private placeFernPatch(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    coord: { x: bigint; z: bigint },
    centerWorldX: number,
    centerWorldZ: number,
    patchSize: number,
    patchRadius: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    getBaseHeightAt: (worldX: number, worldZ: number) => number,
    minGroundHeight: number,
    isSurfaceCarvedAt?: (worldX: number, worldZ: number) => boolean
  ): void {
    const { bottomBlockId, topBlockId } = this.settings
    let placed = 0

    // Deterministically shuffled offsets within the patch radius
    const offsets: [number, number][] = []
    for (let dx = -patchRadius; dx <= patchRadius; dx++) {
      for (let dz = -patchRadius; dz <= patchRadius; dz++) {
        if (dx * dx + dz * dz <= patchRadius * patchRadius) {
          offsets.push([dx, dz])
        }
      }
    }
    for (let i = offsets.length - 1; i > 0; i--) {
      const j = Math.floor(this.positionRandom(centerWorldX, centerWorldZ, 910 + i) * (i + 1))
      ;[offsets[i], offsets[j]] = [offsets[j], offsets[i]]
    }

    for (const [dx, dz] of offsets) {
      if (placed >= patchSize) break

      const worldX = centerWorldX + dx
      const worldZ = centerWorldZ + dz

      // Deterministic checks only may influence the counter: two sub-chunks
      // sharing a straddling patch must agree on which offsets were used.
      // (There is deliberately no ground-block check - ferns rooting on moss,
      // outcrop rock, or boulders all read naturally in a rain forest, and a
      // block-state check would desync the counter across sub-chunks.)
      const groundHeight = getBaseHeightAt(worldX, worldZ)
      if (groundHeight <= minGroundHeight) continue

      // Cave carving is deterministic across sub-chunks too, so this skip
      // keeps the counter in sync while preventing ferns floating over cave
      // mouths/ravines. Checked per fern position, not just the patch center,
      // because a cave mouth can clip one edge of a patch.
      if (isSurfaceCarvedAt?.(worldX, worldZ)) continue

      const localX = worldX - Number(coord.x) * CHUNK_SIZE_X
      const localZ = worldZ - Number(coord.z) * CHUNK_SIZE_Z
      if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

      placed++

      const bottomY = groundHeight + 1
      const topY = groundHeight + 2
      if (bottomY > subChunkMaxY || topY < subChunkMinY) continue

      // Bottom half
      let bottomPlaced = false
      if (bottomY >= subChunkMinY && bottomY <= subChunkMaxY) {
        const localY = bottomY - subChunkMinY
        if (chunk.getBlockId(localX, localY, localZ) === BlockIds.AIR) {
          chunk.setBlockId(localX, localY, localZ, bottomBlockId)
          bottomPlaced = true
        }
      }

      // Top half - only ever placed above a bottom half this same pass
      // placed, so a fern can never render as a floating top. A fern whose
      // ground sits right at a sub-chunk ceiling loses its top half and
      // reads as a small fern instead.
      if (bottomPlaced && topY >= subChunkMinY && topY <= subChunkMaxY) {
        const localY = topY - subChunkMinY
        if (chunk.getBlockId(localX, localY, localZ) === BlockIds.AIR) {
          chunk.setBlockId(localX, localY, localZ, topBlockId)
        }
      }
    }
  }
}
