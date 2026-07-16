import * as THREE from 'three'
import type { BlockId, IBlock, BlockFace } from '../world/interfaces/IBlock.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'

/**
 * Result of a block raycast hit.
 */
export interface IBlockRaycastHit {
  /** World X coordinate of the hit block */
  worldX: bigint
  /** World Y coordinate of the hit block */
  worldY: bigint
  /** World Z coordinate of the hit block */
  worldZ: bigint
  /** Block ID at hit position */
  blockId: BlockId
  /** Block instance at hit position */
  block: IBlock
  /** Face that was hit */
  face: BlockFace
  /** Distance from ray origin to hit */
  distance: number
  /** Exact hit point in world space */
  point: THREE.Vector3
  /** Interaction box in world space (for overlay sizing) */
  interactionBox: THREE.Box3
}

/**
 * Result of ray-box intersection test.
 */
interface IRayBoxHit {
  /** Distance along ray to entry point */
  tEntry: number
  /** Which face was hit (for determining block face) */
  face: BlockFace
}

/**
 * Test ray intersection with an axis-aligned bounding box.
 * Uses the slab method for efficient AABB-ray intersection.
 * @param origin Ray origin
 * @param direction Ray direction (normalized)
 * @param boxMin Box minimum corner (world space)
 * @param boxMax Box maximum corner (world space)
 * @returns Hit info if ray intersects box, null otherwise
 */
function rayIntersectsAABB(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  boxMin: THREE.Vector3,
  boxMax: THREE.Vector3
): IRayBoxHit | null {
  let tMin = -Infinity
  let tMax = Infinity
  let entryFace: BlockFace = 0

  // Test X slab
  if (direction.x !== 0) {
    const invD = 1 / direction.x
    let t1 = (boxMin.x - origin.x) * invD
    let t2 = (boxMax.x - origin.x) * invD
    let nearFace: BlockFace = 4 // WEST (-X face)
    if (t1 > t2) {
      const tmp = t1; t1 = t2; t2 = tmp
      nearFace = 5 // EAST (+X face)
    }
    if (t1 > tMin) {
      tMin = t1
      entryFace = nearFace
    }
    tMax = Math.min(tMax, t2)
  } else if (origin.x < boxMin.x || origin.x > boxMax.x) {
    return null
  }

  // Test Y slab
  if (direction.y !== 0) {
    const invD = 1 / direction.y
    let t1 = (boxMin.y - origin.y) * invD
    let t2 = (boxMax.y - origin.y) * invD
    let nearFace: BlockFace = 1 // BOTTOM (-Y face)
    if (t1 > t2) {
      const tmp = t1; t1 = t2; t2 = tmp
      nearFace = 0 // TOP (+Y face)
    }
    if (t1 > tMin) {
      tMin = t1
      entryFace = nearFace
    }
    tMax = Math.min(tMax, t2)
  } else if (origin.y < boxMin.y || origin.y > boxMax.y) {
    return null
  }

  // Test Z slab
  if (direction.z !== 0) {
    const invD = 1 / direction.z
    let t1 = (boxMin.z - origin.z) * invD
    let t2 = (boxMax.z - origin.z) * invD
    let nearFace: BlockFace = 2 // NORTH (-Z face)
    if (t1 > t2) {
      const tmp = t1; t1 = t2; t2 = tmp
      nearFace = 3 // SOUTH (+Z face)
    }
    if (t1 > tMin) {
      tMin = t1
      entryFace = nearFace
    }
    tMax = Math.min(tMax, t2)
  } else if (origin.z < boxMin.z || origin.z > boxMax.z) {
    return null
  }

  // Check if there's a valid intersection
  if (tMax < tMin || tMax < 0) {
    return null
  }

  // If tMin < 0, ray starts inside box - use tMax as exit point
  // For block selection, we want entry point, so return null if inside
  if (tMin < 0) {
    return null
  }

  return { tEntry: tMin, face: entryFace }
}

/**
 * Voxel raycaster using DDA (Digital Differential Analyzer) algorithm.
 * Efficiently traverses voxels along a ray to find the first solid block.
 */
export class BlockRaycaster {
  private readonly worldManager: WorldManager
  private readonly direction = new THREE.Vector3()
  private readonly origin = new THREE.Vector3()
  // Pre-allocated hit result to avoid per-frame GC pressure
  private readonly hitResult: IBlockRaycastHit = {
    worldX: 0n,
    worldY: 0n,
    worldZ: 0n,
    blockId: BlockIds.AIR,
    block: null as unknown as IBlock,
    face: 0,
    distance: 0,
    point: new THREE.Vector3(),
    interactionBox: new THREE.Box3(),
  }

  // Pre-allocated vectors for ray-box intersection tests
  private readonly boxMin = new THREE.Vector3()
  private readonly boxMax = new THREE.Vector3()

  // BigInt cache to avoid allocations in DDA loop
  private static readonly BIGINT_CACHE_MIN = -64
  private static readonly BIGINT_CACHE_MAX = 320
  private static readonly BIGINT_CACHE_OFFSET = -BlockRaycaster.BIGINT_CACHE_MIN
  private static readonly bigIntCache: bigint[] = (() => {
    const cache: bigint[] = []
    for (let i = BlockRaycaster.BIGINT_CACHE_MIN; i <= BlockRaycaster.BIGINT_CACHE_MAX; i++) {
      cache[i + BlockRaycaster.BIGINT_CACHE_OFFSET] = BigInt(i)
    }
    return cache
  })()

  private static getBigInt(n: number): bigint {
    const idx = n + BlockRaycaster.BIGINT_CACHE_OFFSET
    if (idx >= 0 && idx < BlockRaycaster.bigIntCache.length) {
      return BlockRaycaster.bigIntCache[idx]
    }
    return BigInt(n)
  }

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager
  }

  /**
   * Cast a ray from the camera center and return the first solid block hit.
   * @param camera - The camera to cast from
   * @param maxDistance - Maximum distance to check (in blocks)
   * @returns The hit result, or null if no solid block was hit
   */
  castFromCamera(
    camera: THREE.PerspectiveCamera,
    maxDistance: number
  ): IBlockRaycastHit | null {
    // Get ray origin and direction from camera
    camera.getWorldPosition(this.origin)
    camera.getWorldDirection(this.direction)

    return this.cast(this.origin, this.direction, maxDistance)
  }

  /**
   * Cast a ray and return the first solid block hit using DDA algorithm.
   */
  cast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number
  ): IBlockRaycastHit | null {
    // Current voxel position (floored)
    let x = Math.floor(origin.x)
    let y = Math.floor(origin.y)
    let z = Math.floor(origin.z)

    // Direction signs for stepping
    const stepX = direction.x >= 0 ? 1 : -1
    const stepY = direction.y >= 0 ? 1 : -1
    const stepZ = direction.z >= 0 ? 1 : -1

    // How far along the ray we must move for each axis to cross a voxel boundary
    // (avoiding division by zero with large numbers)
    const tDeltaX = direction.x !== 0 ? Math.abs(1 / direction.x) : 1e30
    const tDeltaY = direction.y !== 0 ? Math.abs(1 / direction.y) : 1e30
    const tDeltaZ = direction.z !== 0 ? Math.abs(1 / direction.z) : 1e30

    // Distance to the next voxel boundary on each axis
    let tMaxX = direction.x !== 0
      ? ((stepX > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(direction.x))
      : 1e30
    let tMaxY = direction.y !== 0
      ? ((stepY > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(direction.y))
      : 1e30
    let tMaxZ = direction.z !== 0
      ? ((stepZ > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(direction.z))
      : 1e30

    // Track which face was last crossed
    let lastFace: BlockFace = 0 // TOP as default

    // Total distance traveled
    let distance = 0

    // DDA loop
    while (distance < maxDistance) {
      // Check if current voxel contains a solid block via the numeric fast path
      // (no per-step BigInt/string-key allocation).
      const blockId = this.worldManager.getBlockIdFast(x, y, z)

      if (blockId !== BlockIds.AIR) {
        const block = this.worldManager.getBlockFast(x, y, z)

        // Target any non-air, non-liquid block (solids + torches, flowers, etc.)
        if (!block.properties.isLiquid) {
          // Get the block's interaction box (for custom hitbox shapes)
          const metadata = this.worldManager.getBlockMetadataFast(x, y, z)
          const interactionBox = block.getInteractionBox?.(metadata) ?? null

          // Only process if block has an interaction box
          if (interactionBox) {
            // Transform interaction box to world space
            this.boxMin.set(
              x + interactionBox.min.x,
              y + interactionBox.min.y,
              z + interactionBox.min.z
            )
            this.boxMax.set(
              x + interactionBox.max.x,
              y + interactionBox.max.y,
              z + interactionBox.max.z
            )

            // Test ray against the interaction box
            const boxHit = rayIntersectsAABB(origin, direction, this.boxMin, this.boxMax)

            // If ray hits the interaction box and within range, return hit
            if (boxHit && boxHit.tEntry <= maxDistance) {
              // Update pre-allocated hit result to avoid allocation. BigInt is
              // only built here, on an actual hit (once per successful cast),
              // not on every DDA step.
              this.hitResult.worldX = BlockRaycaster.getBigInt(x)
              this.hitResult.worldY = BlockRaycaster.getBigInt(y)
              this.hitResult.worldZ = BlockRaycaster.getBigInt(z)
              this.hitResult.blockId = blockId
              this.hitResult.block = block
              this.hitResult.face = boxHit.face
              this.hitResult.distance = boxHit.tEntry
              // Update hit point in-place (using actual intersection point)
              this.hitResult.point.set(
                origin.x + direction.x * boxHit.tEntry,
                origin.y + direction.y * boxHit.tEntry,
                origin.z + direction.z * boxHit.tEntry
              )
              // Copy interaction box to world space for overlay
              this.hitResult.interactionBox.min.copy(this.boxMin)
              this.hitResult.interactionBox.max.copy(this.boxMax)

              return this.hitResult
            }
            // If ray misses, fall through to DDA stepping (check next voxel)
          }
          // If no interaction box, fall through to DDA stepping
        }
      }

      // Step to the next voxel (along the axis with smallest tMax)
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          distance = tMaxX
          x += stepX
          tMaxX += tDeltaX
          // Stepped in X direction: hit face is opposite to step direction
          lastFace = stepX > 0 ? 4 : 5 // WEST (4) if stepping +X, EAST (5) if stepping -X
        } else {
          distance = tMaxZ
          z += stepZ
          tMaxZ += tDeltaZ
          // Stepped in Z direction
          lastFace = stepZ > 0 ? 2 : 3 // NORTH (2) if stepping +Z, SOUTH (3) if stepping -Z
        }
      } else {
        if (tMaxY < tMaxZ) {
          distance = tMaxY
          y += stepY
          tMaxY += tDeltaY
          // Stepped in Y direction
          lastFace = stepY > 0 ? 1 : 0 // BOTTOM (1) if stepping +Y, TOP (0) if stepping -Y
        } else {
          distance = tMaxZ
          z += stepZ
          tMaxZ += tDeltaZ
          // Stepped in Z direction
          lastFace = stepZ > 0 ? 2 : 3 // NORTH (2) if stepping +Z, SOUTH (3) if stepping -Z
        }
      }

      // Skip invalid Y coordinates
      if (y < 0 || y >= 1024) {
        continue
      }
    }

    return null
  }
}
