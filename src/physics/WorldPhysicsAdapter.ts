import * as THREE from 'three'
import type { IPhysicsWorld } from './interfaces/IPhysicsWorld.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import { AABB } from './collision/AABB.ts'

/**
 * Adapts WorldManager to IPhysicsWorld interface.
 * Decouples physics from world implementation details.
 */
export class WorldPhysicsAdapter implements IPhysicsWorld {
  // Pre-allocated AABB pool to avoid per-frame allocations
  private readonly aabbPool: AABB[] = []
  private aabbPoolSize = 0

  // BigInt cache to avoid per-block allocations in collision loop
  // Cache size covers typical collision check range (-5 to +5 on each axis = 11 values)
  private static readonly BIGINT_CACHE_MIN = -32
  private static readonly BIGINT_CACHE_MAX = 320  // Covers typical world Y range
  private static readonly BIGINT_CACHE_OFFSET = -WorldPhysicsAdapter.BIGINT_CACHE_MIN
  private static readonly bigIntCache: bigint[] = (() => {
    const cache: bigint[] = []
    for (let i = WorldPhysicsAdapter.BIGINT_CACHE_MIN; i <= WorldPhysicsAdapter.BIGINT_CACHE_MAX; i++) {
      cache[i + WorldPhysicsAdapter.BIGINT_CACHE_OFFSET] = BigInt(i)
    }
    return cache
  })()

  constructor(private readonly world: WorldManager) {}

  /**
   * Get a cached BigInt for a number, or create one if out of cache range.
   */
  private static getBigInt(n: number): bigint {
    const idx = n + WorldPhysicsAdapter.BIGINT_CACHE_OFFSET
    if (idx >= 0 && idx < WorldPhysicsAdapter.bigIntCache.length) {
      return WorldPhysicsAdapter.bigIntCache[idx]
    }
    return BigInt(n)
  }

  isSolidBlock(x: number, y: number, z: number): boolean {
    const block = this.world.getBlock(
      WorldPhysicsAdapter.getBigInt(Math.floor(x)),
      WorldPhysicsAdapter.getBigInt(Math.floor(y)),
      WorldPhysicsAdapter.getBigInt(Math.floor(z))
    )
    return block.properties.isSolid
  }

  getBlockCollisions(region: AABB): AABB[] {
    // Reset pool usage counter (reuse existing AABBs)
    this.aabbPoolSize = 0

    // Iterate over all block positions that might intersect
    const minX = Math.floor(region.min.x)
    const maxX = Math.floor(region.max.x)
    const minY = Math.floor(region.min.y)
    const maxY = Math.floor(region.max.y)
    const minZ = Math.floor(region.min.z)
    const maxZ = Math.floor(region.max.z)

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.isSolidBlock(x, y, z)) {
            // Get or create AABB from pool
            if (this.aabbPoolSize >= this.aabbPool.length) {
              this.aabbPool.push(new AABB(new THREE.Vector3(), new THREE.Vector3()))
            }
            const aabb = this.aabbPool[this.aabbPoolSize]
            // Set block bounds directly (avoids AABB.forBlock allocation)
            aabb.min.set(x, y, z)
            aabb.max.set(x + 1, y + 1, z + 1)
            this.aabbPoolSize++
          }
        }
      }
    }

    // Return slice of pool with actual blocks (set length to avoid slice allocation)
    this.aabbPool.length = this.aabbPoolSize
    return this.aabbPool
  }
}
