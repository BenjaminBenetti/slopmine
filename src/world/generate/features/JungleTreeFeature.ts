import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for jungle tree generation.
 */
export interface JungleTreeFeatureSettings {
  /** Tree spacing grid size (smaller = denser). Default: 6 */
  gridSize: number
  /** Tree density multiplier. Default: 8.0 */
  density: number
  /** Probability of vines on leaf perimeter (0-1). Default: 0.6 */
  vineChanceOnLeaves: number
  /** Probability of vines on trunk sides (0-1). Default: 0.3 */
  vineChanceOnTrunk: number
  /** Minimum vine length. Default: 2 */
  minVineLength: number
  /** Maximum vine length. Default: 8 */
  maxVineLength: number
}

/**
 * Tree type determines the overall shape and size of the tree.
 */
type TreeType = 'bush' | 'small' | 'medium' | 'tall' | 'giant' | 'emergent'

/**
 * Parameters for a specific tree instance.
 */
interface TreeParams {
  type: TreeType
  trunkHeight: number
  leafStyle: 'dome' | 'layered' | 'umbrella' | 'irregular' | 'massive'
  leafRadius: number
  leafLayers: number
}

// Maximum tree height (emergent trunk 29 + leaves extending 3 above = ~32)
// Plus a buffer for safety
const MAX_TREE_HEIGHT = 35

/**
 * Jungle tree feature that places varied trees with vines in a worker thread.
 * Trees range from small bushes to massive emergent giants.
 *
 * Handles cross-chunk boundaries by deterministically calculating tree
 * parameters and checking if trees from lower sub-chunks extend into
 * the current one.
 */
export class JungleTreeFeature extends Feature {
  readonly settings: JungleTreeFeatureSettings

  constructor(settings: JungleTreeFeatureSettings) {
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

  /**
   * Determine tree type and parameters based on position.
   * This is fully deterministic based on world coordinates.
   */
  private getTreeParams(treeWorldX: number, treeWorldZ: number): TreeParams {
    const typeRoll = this.positionRandom(treeWorldX, treeWorldZ, 10)
    const sizeVariation = this.positionRandom(treeWorldX, treeWorldZ, 11)
    const styleRoll = this.positionRandom(treeWorldX, treeWorldZ, 12)

    let type: TreeType
    let trunkHeight: number
    let leafRadius: number
    let leafLayers: number
    let leafStyle: TreeParams['leafStyle']

    if (typeRoll < 0.15) {
      // 15% - Bush: very short, wide leaves
      type = 'bush'
      trunkHeight = 2 + Math.floor(sizeVariation * 2) // 2-3
      leafRadius = 2 + Math.floor(sizeVariation * 2) // 2-3
      leafLayers = 1
      leafStyle = 'dome'
    } else if (typeRoll < 0.35) {
      // 20% - Small tree
      type = 'small'
      trunkHeight = 4 + Math.floor(sizeVariation * 3) // 4-6
      leafRadius = 2 + Math.floor(sizeVariation * 2) // 2-3
      leafLayers = 1
      leafStyle = styleRoll < 0.5 ? 'dome' : 'irregular'
    } else if (typeRoll < 0.60) {
      // 25% - Medium tree (most common)
      type = 'medium'
      trunkHeight = 6 + Math.floor(sizeVariation * 4) // 6-9
      leafRadius = 3 + Math.floor(sizeVariation * 2) // 3-4
      leafLayers = styleRoll < 0.3 ? 2 : 1
      leafStyle = styleRoll < 0.3 ? 'layered' : (styleRoll < 0.6 ? 'dome' : 'irregular')
    } else if (typeRoll < 0.80) {
      // 20% - Tall tree
      type = 'tall'
      trunkHeight = 10 + Math.floor(sizeVariation * 5) // 10-14
      leafRadius = 3 + Math.floor(sizeVariation * 2) // 3-4
      leafLayers = styleRoll < 0.4 ? 2 : 1
      leafStyle = styleRoll < 0.4 ? 'layered' : 'umbrella'
    } else if (typeRoll < 0.95) {
      // 15% - Giant tree
      type = 'giant'
      trunkHeight = 14 + Math.floor(sizeVariation * 6) // 14-19
      leafRadius = 4 + Math.floor(sizeVariation * 3) // 4-6
      leafLayers = 2 + Math.floor(styleRoll * 2) // 2-3 layers
      leafStyle = styleRoll < 0.5 ? 'layered' : 'massive'
    } else {
      // 5% - Emergent giant (breaks through canopy)
      type = 'emergent'
      trunkHeight = 20 + Math.floor(sizeVariation * 10) // 20-29
      leafRadius = 5 + Math.floor(sizeVariation * 3) // 5-7
      leafLayers = 3 + Math.floor(styleRoll * 2) // 3-4 layers
      leafStyle = 'massive'
    }

    return { type, trunkHeight, leafStyle, leafRadius, leafLayers }
  }

  /**
   * Check if a tree should be placed at this position (deterministic).
   */
  private shouldPlaceTree(treeWorldX: number, treeWorldZ: number, density: number, gridSize: number): boolean {
    const treeChance = this.positionRandom(treeWorldX, treeWorldZ, 0)
    const threshold = density / (gridSize * gridSize)
    return treeChance <= threshold
  }

  /**
   * Calculate the maximum Y extent of a tree (top of canopy).
   */
  private getTreeTopY(treeBaseY: number, params: TreeParams): number {
    // Trunk height + max leaf extension above trunk top
    // For massive trees, leaves can extend 3 blocks above trunk top
    return treeBaseY + params.trunkHeight + 3
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

    // Get water level to skip trees that would be underwater
    const waterLevel = biomeProperties.water?.enabled ? biomeProperties.water.waterLevel : -Infinity

    // How far below this sub-chunk could a tree base be and still reach us?
    // A tree at (subChunkMinY - MAX_TREE_HEIGHT) could have its top at subChunkMinY
    const minPossibleBaseY = subChunkMinY - MAX_TREE_HEIGHT

    // Iterate through all grid cells
    for (let gridX = 0; gridX < CHUNK_SIZE_X; gridX += gridSize) {
      for (let gridZ = 0; gridZ < CHUNK_SIZE_Z; gridZ += gridSize) {
        const worldX = chunkWorldX + gridX
        const worldZ = chunkWorldZ + gridZ

        // Deterministic jitter
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 1) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 2) * gridSize)

        const treeWorldX = worldX + jitterX
        const treeWorldZ = worldZ + jitterZ

        // Check if tree should exist at this position
        if (!this.shouldPlaceTree(treeWorldX, treeWorldZ, density, gridSize)) continue

        // Get ground height and tree base
        const groundHeight = getBaseHeightAt(treeWorldX, treeWorldZ)
        const treeBaseY = groundHeight + 1

        // Skip if tree base would be underwater
        if (treeBaseY <= waterLevel) continue

        // Skip if tree base is too far below to reach this sub-chunk
        if (treeBaseY < minPossibleBaseY) continue

        // Get tree parameters (deterministic)
        const params = this.getTreeParams(treeWorldX, treeWorldZ)

        // Calculate tree's vertical extent
        const treeTopY = this.getTreeTopY(treeBaseY, params)

        // Skip if tree doesn't reach this sub-chunk at all
        if (treeTopY < subChunkMinY) continue
        if (treeBaseY > subChunkMaxY) continue

        // Calculate local coordinates
        const localX = treeWorldX - chunkWorldX
        const localZ = treeWorldZ - chunkWorldZ

        // Skip if outside chunk XZ bounds
        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        // For trees whose base IS in this sub-chunk, validate ground and air
        const baseIsInThisSubChunk = treeBaseY >= subChunkMinY && treeBaseY <= subChunkMaxY

        if (baseIsInThisSubChunk) {
          // Validate ground block is grass or dirt
          const groundLocalY = groundHeight - subChunkMinY
          if (groundLocalY >= 0 && groundLocalY < SUB_CHUNK_HEIGHT) {
            const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
            if (groundBlock !== BlockIds.GRASS && groundBlock !== BlockIds.DIRT) continue
          }

          // Check that tree base position is air (not water)
          const treeBaseLocalY = treeBaseY - subChunkMinY
          if (treeBaseLocalY >= 0 && treeBaseLocalY < SUB_CHUNK_HEIGHT) {
            const baseBlock = chunk.getBlockId(localX, treeBaseLocalY, localZ)
            if (baseBlock !== BlockIds.AIR) continue
          }
        }
        // For trees from below, we trust the deterministic placement
        // (water check by waterLevel, ground is assumed valid from terrain gen)

        // Place the tree (only the portion in this sub-chunk)
        this.placeTree(
          chunk,
          localX,
          localZ,
          treeBaseY,
          params,
          subChunkMinY,
          subChunkMaxY,
          treeWorldX,
          treeWorldZ
        )
      }
    }
  }

  /**
   * Place a tree with the given parameters.
   * Only places blocks that fall within the sub-chunk's Y range.
   */
  private placeTree(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    localX: number,
    localZ: number,
    treeBaseY: number,
    params: TreeParams,
    subChunkMinY: number,
    subChunkMaxY: number,
    treeWorldX: number,
    treeWorldZ: number
  ): void {
    const { trunkHeight, leafStyle, leafRadius, leafLayers } = params

    // Place trunk
    for (let dy = 0; dy < trunkHeight; dy++) {
      const worldY = treeBaseY + dy
      if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

      const localY = worldY - subChunkMinY
      const currentBlock = chunk.getBlockId(localX, localY, localZ)
      if (currentBlock === BlockIds.AIR || currentBlock === BlockIds.OAK_LEAVES) {
        chunk.setBlockId(localX, localY, localZ, BlockIds.OAK_LOG)
      }
    }

    // Place leaves based on style
    const leafCenterY = treeBaseY + trunkHeight - 1

    switch (leafStyle) {
      case 'dome':
        this.placeDomeLeaves(chunk, localX, localZ, leafCenterY, leafRadius, subChunkMinY, subChunkMaxY, treeWorldX, treeWorldZ)
        break
      case 'layered':
        this.placeLayeredLeaves(chunk, localX, localZ, leafCenterY, leafRadius, leafLayers, subChunkMinY, subChunkMaxY, treeWorldX, treeWorldZ)
        break
      case 'umbrella':
        this.placeUmbrellaLeaves(chunk, localX, localZ, leafCenterY, leafRadius, subChunkMinY, subChunkMaxY, treeWorldX, treeWorldZ)
        break
      case 'irregular':
        this.placeIrregularLeaves(chunk, localX, localZ, leafCenterY, leafRadius, subChunkMinY, subChunkMaxY, treeWorldX, treeWorldZ)
        break
      case 'massive':
        this.placeMassiveLeaves(chunk, localX, localZ, leafCenterY, leafRadius, leafLayers, subChunkMinY, subChunkMaxY, treeWorldX, treeWorldZ)
        break
    }

    // Place vines
    this.placeVines(chunk, localX, localZ, treeBaseY, trunkHeight, leafCenterY, leafRadius, subChunkMinY, subChunkMaxY, treeWorldX, treeWorldZ)
  }

  /**
   * Standard dome-shaped canopy.
   */
  private placeDomeLeaves(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    localX: number,
    localZ: number,
    leafCenterY: number,
    leafRadius: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    treeWorldX: number,
    treeWorldZ: number
  ): void {
    for (let dy = -1; dy <= 2; dy++) {
      const leafWorldY = leafCenterY + dy
      if (leafWorldY < subChunkMinY || leafWorldY > subChunkMaxY) continue

      const localY = leafWorldY - subChunkMinY
      const yFactor = 1 - Math.abs(dy - 0.5) / 2.5
      const effectiveRadius = Math.max(1, Math.floor(leafRadius * yFactor))

      this.placeLeafLayer(chunk, localX, localZ, localY, effectiveRadius, treeWorldX, treeWorldZ, dy)
    }
  }

  /**
   * Multiple distinct tiers of leaves along the trunk.
   */
  private placeLayeredLeaves(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    localX: number,
    localZ: number,
    leafCenterY: number,
    leafRadius: number,
    layers: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    treeWorldX: number,
    treeWorldZ: number
  ): void {
    const layerSpacing = Math.max(3, Math.floor(leafRadius * 1.5))

    for (let layer = 0; layer < layers; layer++) {
      const layerY = leafCenterY - layer * layerSpacing
      const layerRadius = leafRadius - layer

      if (layerRadius < 2) continue

      for (let dy = -1; dy <= 1; dy++) {
        const leafWorldY = layerY + dy
        if (leafWorldY < subChunkMinY || leafWorldY > subChunkMaxY) continue

        const localY = leafWorldY - subChunkMinY
        const yFactor = dy === 0 ? 1.0 : 0.7
        const effectiveRadius = Math.max(1, Math.floor(layerRadius * yFactor))

        this.placeLeafLayer(chunk, localX, localZ, localY, effectiveRadius, treeWorldX, treeWorldZ, dy + layer * 10)
      }
    }
  }

  /**
   * Flat, wide umbrella-shaped canopy at the top.
   */
  private placeUmbrellaLeaves(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    localX: number,
    localZ: number,
    leafCenterY: number,
    leafRadius: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    treeWorldX: number,
    treeWorldZ: number
  ): void {
    const wideRadius = leafRadius + 1

    for (let dy = 0; dy <= 2; dy++) {
      const leafWorldY = leafCenterY + dy
      if (leafWorldY < subChunkMinY || leafWorldY > subChunkMaxY) continue

      const localY = leafWorldY - subChunkMinY
      const effectiveRadius = dy === 0 ? wideRadius : (dy === 1 ? wideRadius - 1 : Math.max(1, wideRadius - 3))

      this.placeLeafLayer(chunk, localX, localZ, localY, effectiveRadius, treeWorldX, treeWorldZ, dy)
    }
  }

  /**
   * Irregular, patchy leaves with gaps.
   */
  private placeIrregularLeaves(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    localX: number,
    localZ: number,
    leafCenterY: number,
    leafRadius: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    treeWorldX: number,
    treeWorldZ: number
  ): void {
    for (let dy = -1; dy <= 2; dy++) {
      const leafWorldY = leafCenterY + dy
      if (leafWorldY < subChunkMinY || leafWorldY > subChunkMaxY) continue

      const localY = leafWorldY - subChunkMinY

      for (let dx = -leafRadius; dx <= leafRadius; dx++) {
        for (let dz = -leafRadius; dz <= leafRadius; dz++) {
          const lx = localX + dx
          const lz = localZ + dz

          if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) continue
          if (dx === 0 && dz === 0) continue

          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist > leafRadius + 0.5) continue

          const skipChance = this.positionRandom(treeWorldX + dx, treeWorldZ + dz, 20 + dy)
          if (skipChance > 0.7) continue

          const currentBlock = chunk.getBlockId(lx, localY, lz)
          if (currentBlock === BlockIds.AIR) {
            chunk.setBlockId(lx, localY, lz, BlockIds.OAK_LEAVES)
          }
        }
      }
    }
  }

  /**
   * Massive, dense canopy for giant trees with multiple thick layers.
   */
  private placeMassiveLeaves(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    localX: number,
    localZ: number,
    leafCenterY: number,
    leafRadius: number,
    layers: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    treeWorldX: number,
    treeWorldZ: number
  ): void {
    // Main canopy at top - extra thick
    for (let dy = -2; dy <= 3; dy++) {
      const leafWorldY = leafCenterY + dy
      if (leafWorldY < subChunkMinY || leafWorldY > subChunkMaxY) continue

      const localY = leafWorldY - subChunkMinY
      const yFactor = 1 - Math.abs(dy) / 4
      const effectiveRadius = Math.max(2, Math.floor(leafRadius * yFactor))

      this.placeLeafLayer(chunk, localX, localZ, localY, effectiveRadius, treeWorldX, treeWorldZ, dy)
    }

    // Additional lower canopy layers for giant trees
    const layerSpacing = 4
    for (let layer = 1; layer < layers; layer++) {
      const layerY = leafCenterY - layer * layerSpacing
      const layerRadius = Math.max(2, leafRadius - layer)

      for (let dy = -1; dy <= 1; dy++) {
        const leafWorldY = layerY + dy
        if (leafWorldY < subChunkMinY || leafWorldY > subChunkMaxY) continue

        const localY = leafWorldY - subChunkMinY
        const effectiveRadius = dy === 0 ? layerRadius : Math.max(1, layerRadius - 1)

        for (let dx = -effectiveRadius; dx <= effectiveRadius; dx++) {
          for (let dz = -effectiveRadius; dz <= effectiveRadius; dz++) {
            const lx = localX + dx
            const lz = localZ + dz

            if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) continue
            if (dx === 0 && dz === 0) continue

            const dist = Math.sqrt(dx * dx + dz * dz)
            if (dist > effectiveRadius + 0.5) continue

            const skipChance = this.positionRandom(treeWorldX + dx, treeWorldZ + dz, 30 + layer * 10 + dy)
            if (skipChance > 0.6) continue

            const currentBlock = chunk.getBlockId(lx, localY, lz)
            if (currentBlock === BlockIds.AIR) {
              chunk.setBlockId(lx, localY, lz, BlockIds.OAK_LEAVES)
            }
          }
        }
      }
    }
  }

  /**
   * Helper to place a circular layer of leaves.
   */
  private placeLeafLayer(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    localX: number,
    localZ: number,
    localY: number,
    radius: number,
    treeWorldX: number,
    treeWorldZ: number,
    salt: number
  ): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const lx = localX + dx
        const lz = localZ + dz

        if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) continue
        if (dx === 0 && dz === 0) continue

        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > radius + 0.5) continue

        const currentBlock = chunk.getBlockId(lx, localY, lz)
        if (currentBlock === BlockIds.AIR) {
          chunk.setBlockId(lx, localY, lz, BlockIds.OAK_LEAVES)
        }
      }
    }
  }

  /**
   * Place vines on leaves and trunk.
   */
  private placeVines(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    localX: number,
    localZ: number,
    treeBaseY: number,
    trunkHeight: number,
    leafCenterY: number,
    leafRadius: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    treeWorldX: number,
    treeWorldZ: number
  ): void {
    const { vineChanceOnLeaves, vineChanceOnTrunk, minVineLength, maxVineLength } = this.settings

    // Vines from leaf perimeter
    for (let dx = -leafRadius - 1; dx <= leafRadius + 1; dx++) {
      for (let dz = -leafRadius - 1; dz <= leafRadius + 1; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < leafRadius - 0.5 || dist > leafRadius + 1.5) continue

        const lx = localX + dx
        const lz = localZ + dz

        if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) continue

        const vineWorldX = treeWorldX + dx
        const vineWorldZ = treeWorldZ + dz
        const vineChance = this.positionRandom(vineWorldX, vineWorldZ, 5)
        if (vineChance > vineChanceOnLeaves) continue

        // Find highest leaf at this position (within this sub-chunk)
        let startY = -1
        for (let checkDy = 3; checkDy >= -2; checkDy--) {
          const checkWorldY = leafCenterY + checkDy
          if (checkWorldY < subChunkMinY || checkWorldY > subChunkMaxY) continue
          const checkLocalY = checkWorldY - subChunkMinY
          if (chunk.getBlockId(lx, checkLocalY, lz) === BlockIds.OAK_LEAVES) {
            startY = checkWorldY
            break
          }
        }

        if (startY === -1) continue

        const vineLength = minVineLength +
          Math.floor(this.positionRandom(vineWorldX, vineWorldZ, 6) * (maxVineLength - minVineLength + 1))

        for (let vdy = 1; vdy <= vineLength; vdy++) {
          const vineWorldY = startY - vdy
          if (vineWorldY < subChunkMinY || vineWorldY > subChunkMaxY) continue

          const vineLocalY = vineWorldY - subChunkMinY
          const blockBelow = chunk.getBlockId(lx, vineLocalY, lz)

          if (blockBelow === BlockIds.AIR) {
            chunk.setBlockId(lx, vineLocalY, lz, BlockIds.VINE)
          } else {
            break
          }
        }
      }
    }

    // Vines on trunk
    const sides: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

    for (let dy = 2; dy < trunkHeight - 1; dy++) {
      const trunkWorldY = treeBaseY + dy
      if (trunkWorldY < subChunkMinY || trunkWorldY > subChunkMaxY) continue

      const trunkLocalY = trunkWorldY - subChunkMinY

      for (const [sdx, sdz] of sides) {
        const sideLocalX = localX + sdx
        const sideLocalZ = localZ + sdz

        if (sideLocalX < 0 || sideLocalX >= CHUNK_SIZE_X) continue
        if (sideLocalZ < 0 || sideLocalZ >= CHUNK_SIZE_Z) continue

        const vineChance = this.positionRandom(treeWorldX + sdx + dy, treeWorldZ + sdz, 7)
        if (vineChance > vineChanceOnTrunk) continue

        const currentBlock = chunk.getBlockId(sideLocalX, trunkLocalY, sideLocalZ)
        if (currentBlock === BlockIds.AIR) {
          chunk.setBlockId(sideLocalX, trunkLocalY, sideLocalZ, BlockIds.VINE)
        }
      }
    }
  }
}
