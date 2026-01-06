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
  }

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
      // Check if current voxel contains a solid block
      // Use cached BigInt to avoid allocations in hot loop
      const bx = BlockRaycaster.getBigInt(x)
      const by = BlockRaycaster.getBigInt(y)
      const bz = BlockRaycaster.getBigInt(z)
      const blockId = this.worldManager.getBlockId(bx, by, bz)

      if (blockId !== BlockIds.AIR) {
        const block = this.worldManager.getBlock(bx, by, bz)

        if (block.properties.isSolid) {
          // Update pre-allocated hit result to avoid allocation
          this.hitResult.worldX = bx
          this.hitResult.worldY = by
          this.hitResult.worldZ = bz
          this.hitResult.blockId = blockId
          this.hitResult.block = block
          this.hitResult.face = lastFace
          this.hitResult.distance = distance
          // Update hit point in-place
          this.hitResult.point.set(
            origin.x + direction.x * distance,
            origin.y + direction.y * distance,
            origin.z + direction.z * distance
          )

          return this.hitResult
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
