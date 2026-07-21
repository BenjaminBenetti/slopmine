import * as THREE from 'three'
import { BlockIds } from '../../../world/blocks/BlockIds.ts'

/**
 * A climbable tree as seen by a monkey: a vertical log column with a
 * perch point on top of its canopy.
 */
export interface TreePerch {
  /** Block coordinates of the trunk column */
  readonly trunkX: number
  readonly trunkZ: number
  /** Y of the lowest trunk log (climb starts beside this) */
  readonly baseY: number
  /** Y of the highest contiguous trunk log */
  readonly topY: number
  /** Entity position on top of the canopy (centered on the trunk column) */
  readonly perch: THREE.Vector3
  /** Unique key for deduplication / "not the tree I'm on" checks */
  readonly key: string
}

// Log block IDs monkeys can climb (any wood type)
const LOG_BLOCK_IDS = new Set<number>([
  BlockIds.OAK_LOG,
  BlockIds.PINE_LOG,
  BlockIds.REDWOOD_LOG,
])

// Leaf block IDs a perch can rest on
const LEAF_BLOCK_IDS = new Set<number>([
  BlockIds.OAK_LEAVES,
  BlockIds.PINE_NEEDLES,
  BlockIds.REDWOOD_LEAVES,
  BlockIds.SNOWY_PINE_NEEDLES,
])

// Minimum contiguous trunk logs for a column to count as a climbable tree
// (filters out fallen logs, stumps, and single placed log blocks)
const MIN_TRUNK_HEIGHT = 3
// How far above the trunk top to search for the canopy surface
const MAX_CANOPY_SEARCH = 8
// Vertical scan band relative to the query center
const SCAN_BELOW = 12
const SCAN_ABOVE = 40

/**
 * Finds climbable trees around a monkey. Same caching discipline as the
 * ember roach's PillarDetector: results are reused until the entity moves
 * away from the cache center, and empty scans are throttled so a monkey on
 * treeless ground cannot peg the main thread with block queries.
 */
export class TreeDetector {
  private readonly getBlockIdFn: (x: number, y: number, z: number) => number

  private cachedTrees: TreePerch[] = []
  private readonly cacheCenter = new THREE.Vector3()
  private readonly cacheValidDistance = 8
  private cacheInitialized = false
  private lastScanEmpty = false
  private lastScanTimeMs = 0
  private readonly emptyRescanCooldownMs = 2000

  constructor(getBlockIdFn: (x: number, y: number, z: number) => number) {
    this.getBlockIdFn = getBlockIdFn
  }

  private isLog(x: number, y: number, z: number): boolean {
    return LOG_BLOCK_IDS.has(this.getBlockIdFn(x, y, z))
  }

  /**
   * Find trees near a position, sorted nearest-perch-first.
   */
  findTrees(center: THREE.Vector3, maxDistance: number): TreePerch[] {
    const distFromCache = center.distanceTo(this.cacheCenter)
    if (this.cacheInitialized) {
      if (distFromCache < this.cacheValidDistance) {
        return this.filterAndSort(center, maxDistance)
      }
      if (
        this.lastScanEmpty &&
        performance.now() - this.lastScanTimeMs < this.emptyRescanCooldownMs
      ) {
        return this.filterAndSort(center, maxDistance)
      }
    }

    this.cachedTrees = this.scan(center, maxDistance)
    this.cacheCenter.copy(center)
    this.cacheInitialized = true
    this.lastScanEmpty = this.cachedTrees.length === 0
    this.lastScanTimeMs = performance.now()

    return this.filterAndSort(center, maxDistance)
  }

  /**
   * Re-validate that a tree still exists (its trunk top log is intact).
   * Cheap single-block check used before committing to a climb or leap.
   */
  isTreeStillThere(tree: TreePerch): boolean {
    return this.isLog(tree.trunkX, tree.topY, tree.trunkZ)
  }

  invalidateCache(): void {
    this.cachedTrees = []
    this.cacheInitialized = false
    this.lastScanEmpty = false
  }

  /**
   * Scan a square area for trunk columns. Every column is sampled: jungle
   * trunks are single blocks wide, so a strided scan misses most of them
   * (a 2-block stride in both axes saw only ~25% of trees, leaving monkeys
   * blind to the forest around them). Cost is bounded by the cache, the
   * empty-scan cooldown, and the early exit below.
   */
  private scan(center: THREE.Vector3, maxDistance: number): TreePerch[] {
    const trees: TreePerch[] = []
    const seen = new Set<string>()

    const centerX = Math.floor(center.x)
    const centerZ = Math.floor(center.z)
    const minY = Math.max(0, Math.floor(center.y - SCAN_BELOW))
    const maxY = Math.floor(center.y + SCAN_ABOVE)
    const radius = Math.ceil(maxDistance)

    const checkColumn = (x: number, z: number): boolean => {
      // Find the first log in this column's band
      let logY = -1
      for (let y = minY; y <= maxY; y++) {
        if (this.isLog(x, y, z)) {
          logY = y
          break
        }
      }
      if (logY === -1) return false

      const tree = this.buildTree(x, z, logY)
      if (!tree || seen.has(tree.key)) return false
      seen.add(tree.key)
      trees.push(tree)
      // Plenty of options - stop scanning. Ring order means the early exit
      // keeps the NEAREST trees, not a corner of the search box.
      return trees.length >= 24
    }

    // Expanding square rings from the center outward
    if (checkColumn(centerX, centerZ)) return trees
    for (let r = 1; r <= radius; r++) {
      for (let z = centerZ - r; z <= centerZ + r; z++) {
        if (checkColumn(centerX - r, z)) return trees
        if (checkColumn(centerX + r, z)) return trees
      }
      for (let x = centerX - r + 1; x <= centerX + r - 1; x++) {
        if (checkColumn(x, centerZ - r)) return trees
        if (checkColumn(x, centerZ + r)) return trees
      }
    }

    return trees
  }

  /**
   * Grow a trunk column from one discovered log: walk down to the base,
   * up to the top, then find the canopy surface above.
   */
  private buildTree(x: number, z: number, logY: number): TreePerch | null {
    let baseY = logY
    while (baseY > 0 && this.isLog(x, baseY - 1, z)) baseY--

    let topY = logY
    while (this.isLog(x, topY + 1, z)) topY++

    if (topY - baseY + 1 < MIN_TRUNK_HEIGHT) return null

    // Perch on the local canopy summit: the highest leaf block in the 3x3
    // columns around the trunk top. Standing on the summit keeps the monkey
    // visible instead of tucked into a leaf pocket, and the support block is
    // guaranteed (it IS the leaf we found). Falls back to the bare trunk top.
    let perchX = x
    let perchZ = z
    let supportY = topY
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let y = topY + MAX_CANOPY_SEARCH; y > supportY; y--) {
          if (LEAF_BLOCK_IDS.has(this.getBlockIdFn(x + dx, y, z + dz))) {
            supportY = y
            perchX = x + dx
            perchZ = z + dz
            break
          }
        }
      }
    }

    return {
      trunkX: x,
      trunkZ: z,
      baseY,
      topY,
      perch: new THREE.Vector3(perchX + 0.5, supportY + 1.1, perchZ + 0.5),
      key: `${x},${z},${baseY}`,
    }
  }

  private filterAndSort(center: THREE.Vector3, maxDistance: number): TreePerch[] {
    return this.cachedTrees
      .filter((t) => t.perch.distanceTo(center) <= maxDistance)
      .sort((a, b) => a.perch.distanceTo(center) - b.perch.distanceTo(center))
  }
}
