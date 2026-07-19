import * as THREE from 'three'
import type { IPhysicsWorld } from './interfaces/IPhysicsWorld.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import { AABB } from './collision/AABB.ts'
import { BlockTags } from '../world/blocks/tags/BlockTags.ts'
import { BlockFacing, getMetadataFacing, getMetadataFlipped } from '../world/blocks/BlockFacing.ts'

/** Shared sentinel for blocks that collide as the full cell */
const FULL_CUBE = new Float32Array([0, 0, 0, 1, 1, 1])

/** Orientation-relevant metadata: facing bits 0-2 + flip bit 4 */
const ORIENTATION_MASK = 0b10111

interface ICollisionBlock {
  getCollisionBox?: () => THREE.Box3 | null
  getCollisionBoxes?: () => THREE.Box3[]
}

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

  // Canonical (facing SOUTH, unflipped) collision boxes per block id, as a
  // flat Float32Array of 6 floats per box in [0,1] cell space. Cached because
  // getCollisionBox(es)() allocates and blocks are stateless flyweights.
  private readonly canonicalBoundsCache = new Map<number, Float32Array>()
  // Oriented variants keyed by blockId * 32 + (metadata & ORIENTATION_MASK)
  private readonly orientedBoundsCache = new Map<number, Float32Array>()

  constructor(private readonly world: WorldManager) {}

  private getCanonicalBounds(blockId: number, block: ICollisionBlock): Float32Array {
    let bounds = this.canonicalBoundsCache.get(blockId)
    if (bounds === undefined) {
      const boxes = block.getCollisionBoxes?.() ?? (() => {
        const box = block.getCollisionBox?.() ?? null
        return box ? [box] : null
      })()
      if (
        !boxes ||
        (boxes.length === 1 &&
          boxes[0].min.x <= 0 && boxes[0].min.y <= 0 && boxes[0].min.z <= 0 &&
          boxes[0].max.x >= 1 && boxes[0].max.y >= 1 && boxes[0].max.z >= 1)
      ) {
        bounds = FULL_CUBE
      } else {
        bounds = new Float32Array(boxes.length * 6)
        for (let i = 0; i < boxes.length; i++) {
          bounds[i * 6] = boxes[i].min.x
          bounds[i * 6 + 1] = boxes[i].min.y
          bounds[i * 6 + 2] = boxes[i].min.z
          bounds[i * 6 + 3] = boxes[i].max.x
          bounds[i * 6 + 4] = boxes[i].max.y
          bounds[i * 6 + 5] = boxes[i].max.z
        }
      }
      this.canonicalBoundsCache.set(blockId, bounds)
    }
    return bounds
  }

  /**
   * Get the collision boxes for a partial block oriented per its metadata:
   * the vertical flip (roll about local Z: x and y mirror) is applied first,
   * then the facing yaw - matching the render path's euler composition.
   */
  private getOrientedBounds(blockId: number, canonical: Float32Array, metadata: number): Float32Array {
    const orientation = metadata & ORIENTATION_MASK
    const key = blockId * 32 + orientation
    let bounds = this.orientedBoundsCache.get(key)
    if (bounds === undefined) {
      const facing = getMetadataFacing(metadata)
      const flipped = getMetadataFlipped(metadata)
      const boxCount = canonical.length / 6
      bounds = new Float32Array(canonical.length)
      for (let i = 0; i < boxCount; i++) {
        let minX = canonical[i * 6]
        let minY = canonical[i * 6 + 1]
        let minZ = canonical[i * 6 + 2]
        let maxX = canonical[i * 6 + 3]
        let maxY = canonical[i * 6 + 4]
        let maxZ = canonical[i * 6 + 5]

        if (flipped) {
          // Roll pi about local Z: x -> 1-x, y -> 1-y
          ;[minX, maxX] = [1 - maxX, 1 - minX]
          ;[minY, maxY] = [1 - maxY, 1 - minY]
        }

        // Yaw the box about the cell center (canonical facing is SOUTH)
        let rMinX = minX, rMaxX = maxX, rMinZ = minZ, rMaxZ = maxZ
        switch (facing) {
          case BlockFacing.NORTH: // 180deg: (x,z) -> (1-x, 1-z)
            rMinX = 1 - maxX; rMaxX = 1 - minX
            rMinZ = 1 - maxZ; rMaxZ = 1 - minZ
            break
          case BlockFacing.EAST: // +90deg: (x,z) -> (z, 1-x)
            rMinX = minZ; rMaxX = maxZ
            rMinZ = 1 - maxX; rMaxZ = 1 - minX
            break
          case BlockFacing.WEST: // -90deg: (x,z) -> (1-z, x)
            rMinX = 1 - maxZ; rMaxX = 1 - minZ
            rMinZ = minX; rMaxZ = maxX
            break
          default: // SOUTH / UP / DOWN: identity
            break
        }

        bounds[i * 6] = rMinX
        bounds[i * 6 + 1] = minY
        bounds[i * 6 + 2] = rMinZ
        bounds[i * 6 + 3] = rMaxX
        bounds[i * 6 + 4] = maxY
        bounds[i * 6 + 5] = rMaxZ
      }
      this.orientedBoundsCache.set(key, bounds)
    }
    return bounds
  }

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
          const block = this.world.getBlockFast(x, y, z)
          if (!block.properties.isSolid) continue

          // Full-cell blocks (the vast majority) skip the metadata lookup
          const canonical = this.getCanonicalBounds(block.properties.id, block)
          const bounds = canonical === FULL_CUBE
            ? canonical
            : this.getOrientedBounds(
                block.properties.id,
                canonical,
                this.world.getBlockMetadataFast(x, y, z)
              )

          const boxCount = bounds.length / 6
          for (let i = 0; i < boxCount; i++) {
            if (poolIndex >= this.aabbPool.length) {
              this.aabbPool.push(new AABB(new THREE.Vector3(), new THREE.Vector3()))
            }
            const aabb = this.aabbPool[poolIndex++]
            aabb.min.set(x + bounds[i * 6], y + bounds[i * 6 + 1], z + bounds[i * 6 + 2])
            aabb.max.set(x + bounds[i * 6 + 3], y + bounds[i * 6 + 4], z + bounds[i * 6 + 5])
            this.results.push(aabb)
          }
        }
      }
    }

    return this.results
  }
}
