import type { WorldManager } from '../../WorldManager.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'

export interface TreeParams {
  trunkHeight: number
  leafRadius: number
}

/**
 * Oak tree structure generator.
 * Generates a trunk with a roughly spherical leaf canopy.
 */
export class OakTree {
  /**
   * Place an oak tree at the given world coordinates.
   * Uses WorldManager.setBlock() to place blocks, which handles
   * cross-chunk placement automatically.
   *
   * @param world - WorldManager for block placement
   * @param baseX - World X of trunk base
   * @param baseY - World Y of trunk base (ground level + 1)
   * @param baseZ - World Z of trunk base
   * @param params - Tree parameters
   */
  static place(
    world: WorldManager,
    baseX: bigint,
    baseY: bigint,
    baseZ: bigint,
    params: TreeParams
  ): void {
    const { trunkHeight, leafRadius } = params

    // Place trunk
    for (let dy = 0; dy < trunkHeight; dy++) {
      world.setBlock(baseX, baseY + BigInt(dy), baseZ, BlockIds.OAK_LOG)
    }

    // Place leaves in a roughly spherical pattern
    // Leaves center at top of trunk
    const leafCenterY = baseY + BigInt(trunkHeight - 1)

    for (let dx = -leafRadius; dx <= leafRadius; dx++) {
      for (let dy = -1; dy <= leafRadius; dy++) {
        for (let dz = -leafRadius; dz <= leafRadius; dz++) {
          // Skip corners for more natural shape (roughly spherical)
          const dist = Math.sqrt(dx * dx + dy * dy * 1.5 + dz * dz)
          if (dist > leafRadius + 0.5) continue

          // Don't overwrite trunk
          if (dx === 0 && dz === 0 && dy < 1) continue

          const leafX = baseX + BigInt(dx)
          const leafY = leafCenterY + BigInt(dy)
          const leafZ = baseZ + BigInt(dz)

          // Only place if air (don't overwrite existing blocks)
          if (world.getBlockId(leafX, leafY, leafZ) === BlockIds.AIR) {
            world.setBlock(leafX, leafY, leafZ, BlockIds.OAK_LEAVES)
          }
        }
      }
    }
  }

  /**
   * Check if a tree can be placed at the given location.
   * Ensures sufficient clearance and valid ground.
   */
  static canPlace(
    world: WorldManager,
    baseX: bigint,
    baseY: bigint,
    baseZ: bigint,
    params: TreeParams
  ): boolean {
    // Check ground is solid (grass or dirt)
    const groundBlock = world.getBlockId(baseX, baseY - 1n, baseZ)
    if (groundBlock !== BlockIds.GRASS && groundBlock !== BlockIds.DIRT) {
      return false
    }

    // Check trunk area is clear
    for (let dy = 0; dy < params.trunkHeight; dy++) {
      if (
        world.getBlockId(baseX, baseY + BigInt(dy), baseZ) !== BlockIds.AIR
      ) {
        return false
      }
    }

    return true
  }
}
