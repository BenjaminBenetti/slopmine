import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { BlockFacing, setMetadataFacing } from '../../blocks/BlockFacing.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Chunk interface with metadata support for vine placement.
 */
interface ChunkWithMetadata {
  getBlockId: (x: number, y: number, z: number) => number
  setBlockId: (x: number, y: number, z: number, id: number) => void
  setMetadata?: (x: number, y: number, z: number, value: number) => boolean
}

/**
 * Convert offset from tree center to vine facing direction.
 * Vine faces AWAY from the attachment block (toward the player viewing from outside).
 *
 * @param dx X offset from tree center (positive = vine is to the east)
 * @param dz Z offset from tree center (positive = vine is to the south)
 * @returns BlockFacing direction the vine should face
 */
function offsetToFacing(dx: number, dz: number): BlockFacing {
  // Use the axis with larger absolute value
  // Vine faces AWAY from trunk (outward toward player)
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx > 0 ? BlockFacing.EAST : BlockFacing.WEST
  } else {
    return dz > 0 ? BlockFacing.SOUTH : BlockFacing.NORTH
  }
}

/**
 * Maximum possible tree height including canopy and roots for cross-chunk boundary detection.
 */
const MAX_MEGA_TREE_HEIGHT = 130 // 80 trunk + 15 canopy + 20 roots + buffer

/**
 * Maximum depth roots can extend below tree base.
 */
const MAX_ROOT_DEPTH = 25

/**
 * Configuration for mega tree generation.
 */
export interface MegaTreeFeatureSettings {
  /** Grid spacing for tree placement (larger = rarer). Default: 64 */
  gridSize: number
  /** Tree density multiplier (0-1 range works with gridSize). Default: 0.15 */
  density: number
  /** Minimum trunk height. Default: 40 */
  minTrunkHeight: number
  /** Maximum trunk height. Default: 80 */
  maxTrunkHeight: number
  /** Base trunk radius at ground level. Default: 2 */
  baseTrunkRadius: number
  /** Minimum number of branches. Default: 4 */
  minBranches: number
  /** Maximum number of branches. Default: 8 */
  maxBranches: number
  /** Minimum branch length in blocks. Default: 8 */
  minBranchLength: number
  /** Maximum branch length in blocks. Default: 20 */
  maxBranchLength: number
  /** Minimum root depth below ground. Default: 8 */
  minRootDepth: number
  /** Maximum root depth below ground. Default: 15 */
  maxRootDepth: number
  /** Minimum horizontal root sprawl. Default: 6 */
  minRootSprawl: number
  /** Maximum horizontal root sprawl. Default: 12 */
  maxRootSprawl: number
  /** Minimum number of roots. Default: 4 */
  minRoots: number
  /** Maximum number of roots. Default: 6 */
  maxRoots: number
  /** Radius of leaf clusters. Default: 5 */
  leafClusterRadius: number
  /** Probability of vines on leaf edges (0-1). Default: 0.4 */
  vineChance: number
  /** Maximum vine length. Default: 15 */
  maxVineLength: number
}

/**
 * Parameters for a single branch.
 */
interface BranchParams {
  /** Y offset from trunk base where branch starts */
  startY: number
  /** Horizontal angle in radians */
  angle: number
  /** Length of the branch in blocks */
  length: number
  /** Branch radius (2-3 for walkability) */
  radius: number
  /** Upward tilt angle in radians */
  tilt: number
}

/**
 * Parameters for a single root.
 */
interface RootParams {
  /** Horizontal angle in radians */
  angle: number
  /** Horizontal sprawl distance */
  sprawl: number
  /** Depth below ground */
  depth: number
  /** Root thickness radius */
  radius: number
  /** Height of buttress above ground */
  buttressHeight: number
}

/**
 * Complete parameters for a mega tree instance.
 */
interface MegaTreeParams {
  /** Total height from roots to canopy top */
  totalHeight: number
  /** Height of just the trunk */
  trunkHeight: number
  /** Base trunk radius */
  baseTrunkRadius: number
  /** Number of branches */
  branchCount: number
  /** Branch parameters */
  branches: BranchParams[]
  /** Number of roots */
  rootCount: number
  /** Root parameters */
  roots: RootParams[]
  /** Radius of leaf clusters */
  leafClusterRadius: number
  /** Maximum root depth */
  maxRootDepth: number
}

/**
 * Mega tree feature that generates massive trees with:
 * - Multi-block wide tapered trunk
 * - Sprawling root system above and below ground
 * - Large walkable branches
 * - Massive leaf canopy with vines
 *
 * Handles cross-chunk boundaries by deterministically calculating tree
 * parameters and checking if trees from other sub-chunks extend into the current one.
 */
export class MegaTreeFeature extends Feature {
  readonly settings: MegaTreeFeatureSettings

  constructor(settings: MegaTreeFeatureSettings) {
    super()
    this.settings = settings
  }

  /**
   * Generate a deterministic random number based on position and salt.
   * Returns value in [0, 1).
   */
  private positionRandom(x: number, z: number, salt: number): number {
    const hash = Math.sin(x * 12.9898 + z * 78.233 + salt * 43758.5453) * 43758.5453
    return hash - Math.floor(hash)
  }

  /**
   * Deterministically calculate tree parameters for a world position.
   */
  private getTreeParams(treeWorldX: number, treeWorldZ: number): MegaTreeParams {
    const {
      minTrunkHeight, maxTrunkHeight, baseTrunkRadius,
      minBranches, maxBranches, minBranchLength, maxBranchLength,
      minRootDepth, maxRootDepth, minRootSprawl, maxRootSprawl,
      minRoots, maxRoots, leafClusterRadius
    } = this.settings

    // Trunk height
    const heightRoll = this.positionRandom(treeWorldX, treeWorldZ, 100)
    const trunkHeight = Math.floor(minTrunkHeight + heightRoll * (maxTrunkHeight - minTrunkHeight))

    // Branch count
    const branchCountRoll = this.positionRandom(treeWorldX, treeWorldZ, 101)
    const branchCount = Math.floor(minBranches + branchCountRoll * (maxBranches - minBranches + 1))

    // Generate branches
    const branches: BranchParams[] = []
    for (let i = 0; i < branchCount; i++) {
      // Branches start in upper 40-95% of trunk
      const startYRoll = this.positionRandom(treeWorldX, treeWorldZ, 200 + i * 10)
      const startYFraction = 0.40 + startYRoll * 0.55
      const startY = Math.floor(trunkHeight * startYFraction)

      // Horizontal angle - evenly distributed with some jitter
      const baseAngle = (i / branchCount) * Math.PI * 2
      const angleJitter = (this.positionRandom(treeWorldX, treeWorldZ, 201 + i * 10) - 0.5) * 0.5
      const angle = baseAngle + angleJitter

      // Branch length
      const lengthRoll = this.positionRandom(treeWorldX, treeWorldZ, 202 + i * 10)
      const length = Math.floor(minBranchLength + lengthRoll * (maxBranchLength - minBranchLength))

      // Branch radius (1 block - thinner branches)
      const radius = 1

      // Upward tilt (5-20 degrees)
      const tiltRoll = this.positionRandom(treeWorldX, treeWorldZ, 204 + i * 10)
      const tilt = (5 + tiltRoll * 15) * (Math.PI / 180)

      branches.push({ startY, angle, length, radius, tilt })
    }

    // Root count
    const rootCountRoll = this.positionRandom(treeWorldX, treeWorldZ, 102)
    const rootCount = Math.floor(minRoots + rootCountRoll * (maxRoots - minRoots + 1))

    // Generate roots
    const roots: RootParams[] = []
    for (let i = 0; i < rootCount; i++) {
      // Horizontal angle - evenly distributed with jitter
      const baseAngle = (i / rootCount) * Math.PI * 2
      const angleJitter = (this.positionRandom(treeWorldX, treeWorldZ, 301 + i * 10) - 0.5) * 0.6
      const angle = baseAngle + angleJitter

      // Sprawl distance
      const sprawlRoll = this.positionRandom(treeWorldX, treeWorldZ, 302 + i * 10)
      const sprawl = Math.floor(minRootSprawl + sprawlRoll * (maxRootSprawl - minRootSprawl))

      // Depth below ground
      const depthRoll = this.positionRandom(treeWorldX, treeWorldZ, 303 + i * 10)
      const depth = Math.floor(minRootDepth + depthRoll * (maxRootDepth - minRootDepth))

      // Root thickness (beefy roots: 2-3 blocks)
      const radiusRoll = this.positionRandom(treeWorldX, treeWorldZ, 304 + i * 10)
      const radius = radiusRoll < 0.5 ? 2 : 3

      // Buttress height above ground (5-10 blocks for big visible roots)
      const buttressRoll = this.positionRandom(treeWorldX, treeWorldZ, 305 + i * 10)
      const buttressHeight = Math.floor(5 + buttressRoll * 6)

      roots.push({ angle, sprawl, depth, radius, buttressHeight })
    }

    // Calculate total height
    const maxButtress = roots.reduce((max, r) => Math.max(max, r.buttressHeight), 0)
    const rootsMaxDepth = roots.reduce((max, r) => Math.max(max, r.depth), 0)
    const canopyExtension = leafClusterRadius + 3 // Canopy above trunk top
    const totalHeight = trunkHeight + canopyExtension + maxButtress

    return {
      totalHeight,
      trunkHeight,
      baseTrunkRadius,
      branchCount,
      branches,
      rootCount,
      roots,
      leafClusterRadius,
      maxRootDepth: rootsMaxDepth,
    }
  }

  /**
   * Check if a tree should be placed at this position (deterministic).
   */
  private shouldPlaceTree(treeWorldX: number, treeWorldZ: number): boolean {
    const { density, gridSize } = this.settings
    const treeChance = this.positionRandom(treeWorldX, treeWorldZ, 0)
    const threshold = density / (gridSize * gridSize)
    return treeChance <= threshold
  }

  /**
   * Easing function for smooth root curves.
   */
  private easeOutQuad(t: number): number {
    return t * (2 - t)
  }

  /**
   * Easing function for root descent.
   */
  private easeInQuad(t: number): number {
    return t * t
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, biomeProperties } = context
    const { gridSize, density } = this.settings
    const coord = chunk.coordinate

    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Get water level to skip trees underwater
    const waterLevel = biomeProperties.water?.enabled ? biomeProperties.water.waterLevel : -Infinity

    // Calculate search range for tree bases
    // Trees can affect this sub-chunk from:
    // - Above: if tree base is above us, roots extend down into us
    // - Below: if tree base is below us, trunk/branches/canopy extend up
    const maxPossibleBaseY = subChunkMaxY + MAX_ROOT_DEPTH // Tree base above us, roots reach down
    const minPossibleBaseY = subChunkMinY - MAX_MEGA_TREE_HEIGHT // Tree base below us, canopy reaches up

    // Extend search area to account for tree horizontal extent
    const searchRadius = this.settings.maxRootSprawl + this.settings.maxBranchLength + this.settings.leafClusterRadius
    const gridExtend = Math.ceil(searchRadius / gridSize) + 1

    // Iterate through all grid cells (including neighbors for cross-chunk trees)
    for (let gridOffsetX = -gridExtend; gridOffsetX <= Math.ceil(CHUNK_SIZE_X / gridSize) + gridExtend; gridOffsetX++) {
      for (let gridOffsetZ = -gridExtend; gridOffsetZ <= Math.ceil(CHUNK_SIZE_Z / gridSize) + gridExtend; gridOffsetZ++) {
        const gridX = gridOffsetX * gridSize
        const gridZ = gridOffsetZ * gridSize

        const worldX = chunkWorldX + gridX
        const worldZ = chunkWorldZ + gridZ

        // Deterministic jitter
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 1) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 2) * gridSize)

        const treeWorldX = worldX + jitterX
        const treeWorldZ = worldZ + jitterZ

        // Check if tree should exist
        if (!this.shouldPlaceTree(treeWorldX, treeWorldZ)) continue

        // Don't grow trees over cave mouths or ravines (the check is
        // deterministic, so every sub-chunk slice of the tree agrees)
        if (context.isSurfaceCarvedAt?.(treeWorldX, treeWorldZ)) continue

        // Get ground height and tree base
        const groundHeight = getBaseHeightAt(treeWorldX, treeWorldZ)
        const treeBaseY = groundHeight + 1

        // Skip underwater trees
        if (treeBaseY <= waterLevel) continue

        // Skip if tree base is outside possible range
        if (treeBaseY < minPossibleBaseY || treeBaseY > maxPossibleBaseY) continue

        // Get tree parameters (deterministic)
        const params = this.getTreeParams(treeWorldX, treeWorldZ)

        // Calculate full vertical extent
        const treeBottomY = treeBaseY - params.maxRootDepth
        const treeTopY = treeBaseY + params.totalHeight

        // Skip if tree doesn't intersect this sub-chunk at all
        if (treeTopY < subChunkMinY || treeBottomY > subChunkMaxY) continue

        // Place the tree (only the portion in this sub-chunk)
        this.placeTree(
          chunk,
          treeWorldX,
          treeWorldZ,
          treeBaseY,
          params,
          subChunkMinY,
          subChunkMaxY,
          chunkWorldX,
          chunkWorldZ,
          groundHeight
        )
      }
    }
  }

  /**
   * Place a mega tree at the specified world position.
   * Only places blocks that fall within the sub-chunk's Y range and chunk XZ bounds.
   */
  private placeTree(
    chunk: ChunkWithMetadata,
    treeWorldX: number,
    treeWorldZ: number,
    treeBaseY: number,
    params: MegaTreeParams,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number,
    groundHeight: number
  ): void {
    // Place trunk
    this.placeTrunk(chunk, treeWorldX, treeWorldZ, treeBaseY, params, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)

    // Place roots
    this.placeRoots(chunk, treeWorldX, treeWorldZ, treeBaseY, params, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ, groundHeight)

    // Place branches
    this.placeBranches(chunk, treeWorldX, treeWorldZ, treeBaseY, params, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)

    // Place main canopy at trunk top
    const canopyY = treeBaseY + params.trunkHeight
    this.placeLeafCluster(chunk, treeWorldX, treeWorldZ, canopyY, params.leafClusterRadius, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ, treeWorldX, treeWorldZ)

    // Place vines
    this.placeVines(chunk, treeWorldX, treeWorldZ, treeBaseY, params, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)
  }

  /**
   * Place the tapered trunk.
   */
  private placeTrunk(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    treeWorldX: number,
    treeWorldZ: number,
    treeBaseY: number,
    params: MegaTreeParams,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const { trunkHeight, baseTrunkRadius } = params

    for (let dy = 0; dy < trunkHeight; dy++) {
      const worldY = treeBaseY + dy
      if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

      const localY = worldY - subChunkMinY

      // Taper: radius decreases toward top
      const taperFactor = 1 - (dy / trunkHeight) * 0.6
      const radiusAtHeight = Math.max(1, Math.floor(baseTrunkRadius * taperFactor + 0.5))

      // Place circular cross-section
      for (let dx = -radiusAtHeight; dx <= radiusAtHeight; dx++) {
        for (let dz = -radiusAtHeight; dz <= radiusAtHeight; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz)

          // Circular with slight noise at edges
          const edgeNoise = this.positionRandom(treeWorldX + dx, treeWorldZ + dz, 500 + dy) * 0.3
          if (dist > radiusAtHeight + 0.5 + edgeNoise) continue

          const worldX = treeWorldX + dx
          const worldZ = treeWorldZ + dz
          const localX = worldX - chunkWorldX
          const localZ = worldZ - chunkWorldZ

          if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

          const currentBlock = chunk.getBlockId(localX, localY, localZ)
          if (currentBlock === BlockIds.AIR || currentBlock === BlockIds.OAK_LEAVES || currentBlock === BlockIds.VINE) {
            chunk.setBlockId(localX, localY, localZ, BlockIds.OAK_LOG)
          }
        }
      }
    }
  }

  /**
   * Place the root system with buttresses above ground and roots below.
   */
  private placeRoots(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    treeWorldX: number,
    treeWorldZ: number,
    treeBaseY: number,
    params: MegaTreeParams,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number,
    groundHeight: number
  ): void {
    for (const root of params.roots) {
      const { angle, sprawl, depth, radius, buttressHeight } = root
      const steps = sprawl + depth + buttressHeight

      // Parametric curve: t goes from 0 (at trunk) to 1 (at tip)
      for (let step = 0; step <= steps; step++) {
        const t = step / steps

        // Calculate position along root curve
        let horizontalDist: number
        let verticalOffset: number

        if (t < 0.2) {
          // First 20%: buttress above ground, curving down
          const buttressT = t / 0.2
          horizontalDist = sprawl * 0.1 * buttressT // Slight outward
          verticalOffset = buttressHeight * (1 - buttressT) // Starts high, goes to ground
        } else {
          // Remaining 80%: underground, spreading outward
          const undergroundT = (t - 0.2) / 0.8
          horizontalDist = sprawl * (0.1 + 0.9 * this.easeOutQuad(undergroundT))
          verticalOffset = -depth * this.easeInQuad(undergroundT)
        }

        const worldX = Math.round(treeWorldX + Math.cos(angle) * horizontalDist)
        const worldZ = Math.round(treeWorldZ + Math.sin(angle) * horizontalDist)
        const worldY = Math.round(groundHeight + verticalOffset)

        // Check if in sub-chunk range
        if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

        const localY = worldY - subChunkMinY
        const localX = worldX - chunkWorldX
        const localZ = worldZ - chunkWorldZ

        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        // Place root blocks in a circle around this point
        for (let rx = -radius; rx <= radius; rx++) {
          for (let rz = -radius; rz <= radius; rz++) {
            const rootDist = Math.sqrt(rx * rx + rz * rz)
            if (rootDist > radius + 0.5) continue

            const rootLocalX = localX + rx
            const rootLocalZ = localZ + rz

            if (rootLocalX < 0 || rootLocalX >= CHUNK_SIZE_X || rootLocalZ < 0 || rootLocalZ >= CHUNK_SIZE_Z) continue

            const currentBlock = chunk.getBlockId(rootLocalX, localY, rootLocalZ)
            // Replace air, dirt, grass (not stone)
            if (currentBlock === BlockIds.AIR ||
                currentBlock === BlockIds.DIRT ||
                currentBlock === BlockIds.GRASS) {
              chunk.setBlockId(rootLocalX, localY, rootLocalZ, BlockIds.OAK_LOG)
            }
          }
        }
      }
    }
  }

  /**
   * Place large walkable branches.
   */
  private placeBranches(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    treeWorldX: number,
    treeWorldZ: number,
    treeBaseY: number,
    params: MegaTreeParams,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    for (const branch of params.branches) {
      const { startY, angle, length, radius, tilt } = branch
      const branchWorldY = treeBaseY + startY

      // Place branch as a thin cylinder with leaves along it
      for (let dist = 0; dist <= length; dist++) {
        const worldX = Math.round(treeWorldX + Math.cos(angle) * dist)
        const worldZ = Math.round(treeWorldZ + Math.sin(angle) * dist)
        const worldY = Math.round(branchWorldY + Math.sin(tilt) * dist)

        // Place thin branch cross-section
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            const branchDist = Math.sqrt(dx * dx + dz * dz)
            if (branchDist > radius + 0.5) continue

            const bWorldX = worldX + dx
            const bWorldZ = worldZ + dz

            if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

            const localY = worldY - subChunkMinY
            const localX = bWorldX - chunkWorldX
            const localZ = bWorldZ - chunkWorldZ

            if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

            const currentBlock = chunk.getBlockId(localX, localY, localZ)
            if (currentBlock === BlockIds.AIR || currentBlock === BlockIds.OAK_LEAVES || currentBlock === BlockIds.VINE) {
              chunk.setBlockId(localX, localY, localZ, BlockIds.OAK_LOG)
            }
          }
        }

        // Place leaf clusters along the branch every 4 blocks (starting from dist 3)
        if (dist >= 3 && dist % 4 === 0) {
          const clusterSize = Math.floor(params.leafClusterRadius * 0.5) // Medium clusters along branch
          this.placeLeafCluster(
            chunk,
            worldX,
            worldZ,
            worldY,
            clusterSize,
            subChunkMinY,
            subChunkMaxY,
            chunkWorldX,
            chunkWorldZ,
            treeWorldX,
            treeWorldZ
          )
        }

        // Place big leaf cluster at branch end
        if (dist === length) {
          this.placeLeafCluster(
            chunk,
            worldX,
            worldZ,
            worldY,
            params.leafClusterRadius, // Full size cluster at end
            subChunkMinY,
            subChunkMaxY,
            chunkWorldX,
            chunkWorldZ,
            treeWorldX,
            treeWorldZ
          )
        }
      }
    }
  }

  /**
   * Place a spherical leaf cluster.
   */
  private placeLeafCluster(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    centerWorldX: number,
    centerWorldZ: number,
    centerWorldY: number,
    radius: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number,
    treeWorldX: number,
    treeWorldZ: number
  ): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

          // Spherical with noise for irregular edges
          const edgeNoise = this.positionRandom(centerWorldX + dx, centerWorldZ + dz, 600 + dy) * 0.8
          if (dist > radius + edgeNoise) continue

          // Skip if too sparse toward edges
          const sparsityCheck = this.positionRandom(centerWorldX + dx, centerWorldZ + dz, 700 + dy)
          if (dist > radius * 0.7 && sparsityCheck > 0.7) continue

          const worldX = centerWorldX + dx
          const worldZ = centerWorldZ + dz
          const worldY = centerWorldY + dy

          if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

          const localY = worldY - subChunkMinY
          const localX = worldX - chunkWorldX
          const localZ = worldZ - chunkWorldZ

          if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

          const currentBlock = chunk.getBlockId(localX, localY, localZ)
          if (currentBlock === BlockIds.AIR) {
            chunk.setBlockId(localX, localY, localZ, BlockIds.OAK_LEAVES)
          }
        }
      }
    }
  }

  /**
   * Place hanging vines from leaf edges.
   */
  private placeVines(
    chunk: ChunkWithMetadata,
    treeWorldX: number,
    treeWorldZ: number,
    treeBaseY: number,
    params: MegaTreeParams,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const { vineChance, maxVineLength } = this.settings
    const canopyY = treeBaseY + params.trunkHeight
    const radius = params.leafClusterRadius

    // Vines from main canopy
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      for (let dz = -radius - 1; dz <= radius + 1; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz)
        // Only on perimeter
        if (dist < radius - 0.5 || dist > radius + 1.5) continue

        const vineWorldX = treeWorldX + dx
        const vineWorldZ = treeWorldZ + dz

        // Check vine chance
        const vineRoll = this.positionRandom(vineWorldX, vineWorldZ, 800)
        if (vineRoll > vineChance) continue

        // Find start Y (bottom of canopy at this position)
        const startY = canopyY - Math.floor(radius * 0.5)

        // Vine length
        const lengthRoll = this.positionRandom(vineWorldX, vineWorldZ, 801)
        const vineLength = Math.floor(3 + lengthRoll * (maxVineLength - 3))

        // Calculate facing direction for canopy vines (face toward tree center)
        const canopyVineFacing = offsetToFacing(dx, dz)
        const canopyVineMetadata = setMetadataFacing(0, canopyVineFacing)

        // Place vine blocks
        for (let vdy = 0; vdy < vineLength; vdy++) {
          const worldY = startY - vdy
          if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

          const localY = worldY - subChunkMinY
          const localX = vineWorldX - chunkWorldX
          const localZ = vineWorldZ - chunkWorldZ

          if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

          const currentBlock = chunk.getBlockId(localX, localY, localZ)
          if (currentBlock === BlockIds.AIR) {
            chunk.setBlockId(localX, localY, localZ, BlockIds.VINE)
            chunk.setMetadata?.(localX, localY, localZ, canopyVineMetadata)
          } else if (currentBlock !== BlockIds.VINE && currentBlock !== BlockIds.OAK_LEAVES) {
            // Stop if we hit something solid
            break
          }
        }
      }
    }

    // Vines from branch ends
    for (const branch of params.branches) {
      const endX = Math.round(treeWorldX + Math.cos(branch.angle) * branch.length)
      const endZ = Math.round(treeWorldZ + Math.sin(branch.angle) * branch.length)
      const endY = Math.round(treeBaseY + branch.startY + Math.sin(branch.tilt) * branch.length)
      const branchLeafRadius = Math.floor(params.leafClusterRadius * 0.7)

      for (let dx = -branchLeafRadius - 1; dx <= branchLeafRadius + 1; dx++) {
        for (let dz = -branchLeafRadius - 1; dz <= branchLeafRadius + 1; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist < branchLeafRadius - 0.5 || dist > branchLeafRadius + 1.5) continue

          const vineWorldX = endX + dx
          const vineWorldZ = endZ + dz

          const vineRoll = this.positionRandom(vineWorldX, vineWorldZ, 850 + branch.startY)
          if (vineRoll > vineChance) continue

          const startY = endY - Math.floor(branchLeafRadius * 0.5)
          const lengthRoll = this.positionRandom(vineWorldX, vineWorldZ, 851)
          const vineLength = Math.floor(2 + lengthRoll * (maxVineLength * 0.5))

          // Calculate facing direction for branch vines (face toward branch center)
          const branchVineFacing = offsetToFacing(dx, dz)
          const branchVineMetadata = setMetadataFacing(0, branchVineFacing)

          for (let vdy = 0; vdy < vineLength; vdy++) {
            const worldY = startY - vdy
            if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

            const localY = worldY - subChunkMinY
            const localX = vineWorldX - chunkWorldX
            const localZ = vineWorldZ - chunkWorldZ

            if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

            const currentBlock = chunk.getBlockId(localX, localY, localZ)
            if (currentBlock === BlockIds.AIR) {
              chunk.setBlockId(localX, localY, localZ, BlockIds.VINE)
              chunk.setMetadata?.(localX, localY, localZ, branchVineMetadata)
            } else if (currentBlock !== BlockIds.VINE && currentBlock !== BlockIds.OAK_LEAVES) {
              break
            }
          }
        }
      }
    }
  }
}
