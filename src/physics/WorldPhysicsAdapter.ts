import * as THREE from 'three'
import type { IPhysicsWorld } from './interfaces/IPhysicsWorld.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import { AABB } from './collision/AABB.ts'
import { BlockTags } from '../world/blocks/tags/BlockTags.ts'

/**
 * Adapts WorldManager to IPhysicsWorld interface.
 * Decouples physics from world implementation details.
 */
export class WorldPhysicsAdapter implements IPhysicsWorld {
  // Pre-allocated AABB object pool. Grows on demand and is NEVER shrunk, so
  // the AABB (+ its two Vector3) objects are reused across every query. Each
  // query fills `results` (references only) up to its hit count and returns it.
  private readonly aabbPool: AABB[] = []
  private readonly results: AABB[] = []

  constructor(private readonly world: WorldManager) {}

  isSolidBlock(x: number, y: number, z: number): boolean {
    // Numeric fast path: no BigInt / string-key allocation. getBlockFast floors
    // internally, so passing the (already integer) block coords is fine.
    return this.world.getBlockFast(x, y, z).properties.isSolid
  }

  isClimbableBlock(x: number, y: number, z: number): boolean {
    return this.world.getBlockFast(x, y, z).properties.tags.includes(BlockTags.CLIMBABLE)
  }

  getBlockCollisions(region: AABB): AABB[] {
    // Reset the results list (drops references only; pooled AABBs are retained).
    this.results.length = 0

    // Iterate over all block positions that might intersect
    const minX = Math.floor(region.min.x)
    const maxX = Math.floor(region.max.x)
    const minY = Math.floor(region.min.y)
    const maxY = Math.floor(region.max.y)
    const minZ = Math.floor(region.min.z)
    const maxZ = Math.floor(region.max.z)

    let poolIndex = 0

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.isSolidBlock(x, y, z)) {
            // Get or create AABB from pool (pool never shrinks)
            if (poolIndex >= this.aabbPool.length) {
              this.aabbPool.push(new AABB(new THREE.Vector3(), new THREE.Vector3()))
            }
            const aabb = this.aabbPool[poolIndex++]
            // Set block bounds directly (avoids AABB.forBlock allocation)
            aabb.min.set(x, y, z)
            aabb.max.set(x + 1, y + 1, z + 1)
            this.results.push(aabb)
          }
        }
      }
    }

    return this.results
  }
}
