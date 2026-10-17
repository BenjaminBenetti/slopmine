import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'
import type { IChunkData } from '../../interfaces/IChunkData.ts'
import { MOLTEN_SEA_Y, isRiverColumn } from '../molten/MoltenTerrain.ts'
import { getDungeonKit } from '../dungeons/DungeonKitRegistry.ts'
import { proceduralDungeonPlacement } from '../dungeons/ProceduralDungeonFeature.ts'
import { regionDungeonAnchor } from '../dungeons/RegionPlacement.ts'
import { getCachedDungeonLayout } from '../dungeons/LayoutCache.ts'
import { BIOME_REGION_SIZE_BLOCKS } from '../caves/CaveBlend.ts'
import { INFERNAL_BASTION } from '../dungeons/kits/molten/BastionConfig.ts'
import { isInBastionFootprint } from '../dungeons/kits/molten/BastionGateRoute.ts'

/**
 * Configuration for Hell pillar generation.
 */
export interface HellPillarFeatureConfig {
  /** Spacing between potential pillar centers in blocks. */
  gridSize: number
  /** Probability of a pillar spawning at a grid cell (0.0-1.0). */
  density: number
  /** Minimum base radius of pillars. */
  minRadius: number
  /** Maximum base radius of pillars. */
  maxRadius: number
  /** The Y level pillars reach up to (Layer 1 floor). */
  targetTopY: number
  /** Frequency of magma veins (higher = more veins). Default: 0.08 */
  magmaVeinFrequency?: number
  /** Chance a pillar pours a lava fall from a spout on its flank. Default 0 */
  lavaFallChance?: number
  /** Skip pillars over the Molten Wastes' lava river canyons. Default false */
  avoidMoltenRivers?: boolean
  /** Skip pillars inside an Infernal Bastion's footprint. Default false */
  avoidInfernalBastions?: boolean
  /** Chance a pillar-root block (lowest rows) is infernium ore. Default 0.05 */
  rootOreChance?: number
}

/**
 * Blocks a pillar may displace: it rises out of the lava sea (through its
 * obsidian crust rafts), not over it.
 */
const DISPLACEABLE = new Set<number>([
  BlockIds.AIR,
  BlockIds.OBSIDIAN,
  BlockIds.LAVA,
  BlockIds.LAVA_SEVEN_EIGHTH,
  BlockIds.LAVA_THREE_QUARTER,
  BlockIds.LAVA_FIVE_EIGHTH,
  BlockIds.LAVA_HALF,
  BlockIds.LAVA_THREE_EIGHTH,
  BlockIds.LAVA_QUARTER,
  BlockIds.LAVA_EIGHTH,
  BlockIds.LAVA_FALLING,
])

/** Cardinal spout directions for lava falls. */
const FALL_DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/** Rows of pillar root (from its base up) that may hold infernium. */
const ROOT_ORE_ROWS = 8

/**
 * Max reach of biome-border dithering (8 + 8 noise): a pillar this close to
 * a foreign biome region would be cut off by the neighbour (features run
 * only for a chunk's primary biome).
 */
const BIOME_BORDER_MARGIN = 16

/**
 * Hell pillar feature: massive stone columns from the Hell terrain up
 * through the air gap toward the surface layer's floor.
 *
 * Algorithm:
 * 1. World-anchored jittered grid; a hash decides each cell's pillar
 * 2. Vetoes (all deterministic, so every chunk slice agrees): footprints
 *    reaching a foreign biome region, Molten Wastes river canyons, and
 *    Infernal Bastion footprints
 * 3. Tapered cylinder from the blended terrain surface up to targetTopY,
 *    displacing air and lava (pillars stand IN the lava sea), with magma
 *    veins and a few infernium nuggets in the root
 * 4. Some pillars pour a lava fall: a rock spout on the flank holds a lava
 *    source in a notch; its overflow falls as a column to the ground. The
 *    generated state is the one liquid physics settles to, so it stays put.
 */
export class HellPillarFeature extends Feature {
  private readonly config: HellPillarFeatureConfig

  constructor(config: HellPillarFeatureConfig) {
    super()
    this.config = config
  }

  /**
   * Deterministic random based on position (for reproducible placement).
   */
  private positionRandom(x: number, z: number, salt: number, seed: number): number {
    let hash = seed ^ (x * 73856093) ^ (z * 19349663) ^ (salt * 83492791)
    hash = ((hash ^ (hash >>> 16)) * 0x85ebca6b) >>> 0
    hash = ((hash ^ (hash >>> 13)) * 0xc2b2ae35) >>> 0
    return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff
  }

  /** Deterministic per-block hash in [0,1) (root ore). */
  private blockRandom(x: number, y: number, z: number, seed: number): number {
    let h =
      Math.imul(x | 0, 374761393) ^
      Math.imul(y | 0, 668265263) ^
      Math.imul(z | 0, 1610612741) ^
      Math.imul(seed | 0, 1013904223)
    h = Math.imul(h ^ (h >>> 15), 2246822519)
    h = Math.imul(h ^ (h >>> 13), 3266489917)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, noise, frameBudget, config, biomeProperties } = context
    const { gridSize, density, minRadius, maxRadius, targetTopY } = this.config
    const coord = chunk.coordinate
    const seed = config.seed

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Get chunk world origin
    const chunkOrigin = localToWorld(coord, { x: 0, y: 0, z: 0 })
    const chunkBaseX = Number(chunkOrigin.x)
    const chunkBaseZ = Number(chunkOrigin.z)

    // World-anchored grid cells whose pillar (plus lava-fall spout) can
    // reach this chunk (centres are jittered within [cell, cell + gridSize))
    const reach = maxRadius + 2
    const gridStartX = Math.floor((chunkBaseX - reach - gridSize) / gridSize) * gridSize
    const gridEndX = Math.floor((chunkBaseX + CHUNK_SIZE_X + reach) / gridSize) * gridSize
    const gridStartZ = Math.floor((chunkBaseZ - reach - gridSize) / gridSize) * gridSize
    const gridEndZ = Math.floor((chunkBaseZ + CHUNK_SIZE_Z + reach) / gridSize) * gridSize

    frameBudget?.startFrame()

    for (let gridX = gridStartX; gridX <= gridEndX; gridX += gridSize) {
      for (let gridZ = gridStartZ; gridZ <= gridEndZ; gridZ += gridSize) {
        // Deterministic spawn chance based on grid cell
        const spawnChance = this.positionRandom(gridX, gridZ, 0, seed)
        if (spawnChance > density) continue

        // Jitter within grid cell for more natural placement
        const jitterX = Math.floor(this.positionRandom(gridX, gridZ, 1, seed) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(gridX, gridZ, 2, seed) * gridSize)
        const pillarWorldX = gridX + jitterX
        const pillarWorldZ = gridZ + jitterZ

        // Quick reject: footprint (with spout) misses this chunk
        if (
          pillarWorldX + reach < chunkBaseX || pillarWorldX - reach >= chunkBaseX + CHUNK_SIZE_X ||
          pillarWorldZ + reach < chunkBaseZ || pillarWorldZ - reach >= chunkBaseZ + CHUNK_SIZE_Z
        ) continue

        // Calculate pillar radius based on position
        const radiusRand = this.positionRandom(pillarWorldX, pillarWorldZ, 3, seed)
        const baseRadius = minRadius + Math.floor(radiusRand * (maxRadius - minRadius + 1))

        if (!this.isSiteAllowed(context, pillarWorldX, pillarWorldZ, baseRadius, biomeProperties.name)) continue

        // Get terrain height at pillar center
        const terrainHeight = getBaseHeightAt(pillarWorldX, pillarWorldZ)
        const pillarBaseY = terrainHeight + 1

        // Pillar extends from terrain surface to targetTopY
        const totalHeight = targetTopY - pillarBaseY + 1
        if (totalHeight <= 0) continue

        const radiusAt = (worldY: number): number =>
          Math.max(1, Math.floor(baseRadius * (1 - ((worldY - pillarBaseY) / totalHeight) * 0.7)))

        // Root reaches a few blocks under the centre's surface: blended
        // neighbour columns (and the lava sea) may sit lower than the centre
        const rootBottom = pillarBaseY - 3
        for (let worldY = Math.max(rootBottom, subChunkMinY); worldY <= Math.min(targetTopY, subChunkMaxY); worldY++) {
          const radiusAtHeight = radiusAt(Math.max(worldY, pillarBaseY))

          for (let dx = -radiusAtHeight; dx <= radiusAtHeight; dx++) {
            for (let dz = -radiusAtHeight; dz <= radiusAtHeight; dz++) {
              if (dx * dx + dz * dz > radiusAtHeight * radiusAtHeight) continue

              const blockWorldX = pillarWorldX + dx
              const blockWorldZ = pillarWorldZ + dz
              const localX = blockWorldX - chunkBaseX
              const localZ = blockWorldZ - chunkBaseZ
              if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

              const localY = worldY - subChunkMinY

              // Only displace air and lava (don't carve into terrain)
              const currentBlock = chunk.getBlockId(localX, localY, localZ)
              if (!DISPLACEABLE.has(currentBlock)) continue

              let blockId: number
              if (dx === 0 && dz === 0) {
                // Center column gets corrupted hell rock (the pillar's "spine")
                blockId = BlockIds.CORRUPTED_HELL_ROCK
              } else if (
                worldY < pillarBaseY + ROOT_ORE_ROWS &&
                this.blockRandom(blockWorldX, worldY, blockWorldZ, seed) < (this.config.rootOreChance ?? 0.05)
              ) {
                // Infernium nuggets in the pillar root
                blockId = BlockIds.INFERNIUM_ORE
              } else {
                blockId = this.isMagmaVein(noise, blockWorldX, worldY, blockWorldZ)
                  ? BlockIds.HELL_MAGMA
                  : BlockIds.HELL_ROCK
              }

              chunk.setBlockId(localX, localY, localZ, blockId)
            }
          }
        }

        // Lava fall from a spout on the pillar's flank
        const fallChance = this.config.lavaFallChance ?? 0
        if (fallChance > 0 && totalHeight >= 30 && this.positionRandom(pillarWorldX, pillarWorldZ, 7, seed) < fallChance) {
          this.placeLavaFall(
            context, chunk, seed, pillarWorldX, pillarWorldZ, pillarBaseY, totalHeight, baseRadius, radiusAt,
            chunkBaseX, chunkBaseZ, subChunkMinY, subChunkMaxY
          )
        }
      }
    }

    // Yield after processing
    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }

  /** Deterministic site vetoes (same answer in every chunk slice). */
  private isSiteAllowed(context: FeatureContext, x: number, z: number, radius: number, owner: string): boolean {
    // Footprint (+ spout + dither reach) must stay inside the owning biome
    if (context.getBiomeNameAt) {
      const m = radius + 2 + BIOME_BORDER_MARGIN
      for (const [ox, oz] of [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m], [m, m], [m, -m], [-m, m], [-m, -m]]) {
        if (context.getBiomeNameAt(x + ox, z + oz) !== owner) return false
      }
    }
    // Not over a river canyon (the base would float above the cut)
    if (this.config.avoidMoltenRivers) {
      const r = radius + 1
      for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        if (isRiverColumn(context.noise, x + ox, z + oz, context.getBaseHeightAt(x + ox, z + oz))) return false
      }
    }
    // Not inside an Infernal Bastion
    if (this.config.avoidInfernalBastions && isNearInfernalBastion(context, x, z, radius + 3)) {
      return false
    }
    return true
  }

  private isMagmaVein(noise: FeatureContext['noise'], x: number, y: number, z: number): boolean {
    // Primary vein noise - stretched in Y for vertical veins
    const veinFreq = this.config.magmaVeinFrequency ?? 0.08
    const veinNoise1 = noise.noise3D(x * veinFreq, y * veinFreq * 0.3, z * veinFreq)
    // Secondary vein noise at different angle for crossing veins
    const veinNoise2 = noise.noise3D(
      (x + y * 0.5) * veinFreq * 0.7,
      y * veinFreq * 0.4,
      (z + y * 0.3) * veinFreq * 0.7
    )
    // Narrow bands around the noise zero crossings: thin sparse veins
    const veinWidth = 0.04
    return Math.abs(veinNoise1) < veinWidth || Math.abs(veinNoise2) < veinWidth * 0.5
  }

  /**
   * A lava fall: at spout height S a 3-wide rock beam juts from the pillar
   * along a cardinal direction to one block past the pillar's base radius.
   * Its tip holds a lava source in a notch (rock behind, beside and below),
   * the overflow cell beyond the tip holds 7/8 lava, and a falling-lava
   * column drops from there to the ground, ending in a source that pools.
   */
  private placeLavaFall(
    context: FeatureContext,
    chunk: IChunkData,
    seed: number,
    px: number,
    pz: number,
    baseY: number,
    totalHeight: number,
    baseRadius: number,
    radiusAt: (worldY: number) => number,
    chunkBaseX: number,
    chunkBaseZ: number,
    minY: number,
    maxY: number
  ): void {
    const [dirX, dirZ] = FALL_DIRS[Math.floor(this.positionRandom(px, pz, 8, seed) * 4) % 4]
    const spoutY = baseY + Math.floor((0.45 + 0.3 * this.positionRandom(px, pz, 9, seed)) * totalHeight)
    const tip = baseRadius + 1 // source cell, clear of the pillar's widest (base) radius
    const latX = dirZ !== 0 ? 1 : 0 // lateral axis (perpendicular to the spout)
    const latZ = dirX !== 0 ? 1 : 0

    const set = (wx: number, wy: number, wz: number, id: number, onlyDisplaceable: boolean): void => {
      if (wy < minY || wy > maxY) return
      const lx = wx - chunkBaseX
      const lz = wz - chunkBaseZ
      if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) return
      if (onlyDisplaceable && !DISPLACEABLE.has(chunk.getBlockId(lx, wy - minY, lz))) return
      chunk.setBlockId(lx, wy - minY, lz, id)
    }

    // Rock beam (spout floor and walls) from inside the pillar out to the tip
    const beamStart = Math.max(1, radiusAt(spoutY) - 1)
    for (let d = beamStart; d <= tip; d++) {
      for (let l = -1; l <= 1; l++) {
        const bx = px + dirX * d + latX * l
        const bz = pz + dirZ * d + latZ * l
        set(bx, spoutY - 1, bz, BlockIds.HELL_ROCK, true)
        const isSource = d === tip && l === 0
        set(bx, spoutY, bz, isSource ? BlockIds.LAVA : BlockIds.HELL_ROCK, !isSource)
      }
    }

    // Overflow and the falling column beyond the tip
    const fx = px + dirX * (tip + 1)
    const fz = pz + dirZ * (tip + 1)
    set(fx, spoutY, fz, BlockIds.LAVA_SEVEN_EIGHTH, true)
    const groundY = context.getBaseHeightAt(fx, fz)
    // Over the sea (or a river) the fall ends on the lava surface
    const landsInLava = groundY < MOLTEN_SEA_Y || isRiverColumn(context.noise, fx, fz, groundY)
    const bottomY = landsInLava ? MOLTEN_SEA_Y + 1 : groundY + 1
    for (let y = spoutY - 1; y >= bottomY; y--) {
      // The landing cell becomes a source (as physics would make it) and pools
      const id = y === bottomY && !landsInLava ? BlockIds.LAVA : BlockIds.LAVA_FALLING
      set(fx, y, fz, id, true)
    }
  }
}

/**
 * True if (x, z) lies within `margin` blocks of the Infernal Bastion of its
 * biome region (walls, towers, causeway). The anchor is region-inset past
 * the blend band, so only the site's own region can hold one; the layout
 * comes from the same per-worker cache the dungeon feature uses.
 */
function isNearInfernalBastion(context: FeatureContext, x: number, z: number, margin: number): boolean {
  const kit = getDungeonKit(INFERNAL_BASTION.kitId)
  if (!kit) return false
  const seed = context.config.seed
  const placement = proceduralDungeonPlacement(INFERNAL_BASTION, kit)
  const anchor = regionDungeonAnchor(
    placement,
    Math.floor(x / BIOME_REGION_SIZE_BLOCKS),
    Math.floor(z / BIOME_REGION_SIZE_BLOCKS),
    seed
  )
  if (!anchor) return false
  const reach = placement.footprintRadius + margin
  if (Math.abs(x - anchor.x) > reach || Math.abs(z - anchor.z) > reach) return false
  if (context.getBiomeNameAt && context.getBiomeNameAt(anchor.x, anchor.z) !== INFERNAL_BASTION.biome) return false
  const layout = getCachedDungeonLayout(
    kit, anchor.x, anchor.z, seed, INFERNAL_BASTION.salt, context.getBaseHeightAt, INFERNAL_BASTION.biome
  )
  return isInBastionFootprint(layout, (hx, hz) => context.getBaseHeightAt(hx, hz), x, z, margin)
}
