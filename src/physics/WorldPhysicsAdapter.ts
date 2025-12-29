import type { IPhysicsWorld } from './interfaces/IPhysicsWorld.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import { AABB } from './collision/AABB.ts'

/**
 * Adapts WorldManager to IPhysicsWorld interface.
 * Decouples physics from world implementation details.
 */
export class WorldPhysicsAdapter implements IPhysicsWorld {
  constructor(private readonly world: WorldManager) {}

  isSolidBlock(x: number, y: number, z: number): boolean {
    const block = this.world.getBlock(
      BigInt(Math.floor(x)),
      BigInt(Math.floor(y)),
      BigInt(Math.floor(z))
    )
    return block.properties.isSolid
  }

  getBlockCollisions(region: AABB): AABB[] {
    const blocks: AABB[] = []

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
            blocks.push(AABB.forBlock(x, y, z))
          }
        }
      }
    }

    return blocks
  }
}
