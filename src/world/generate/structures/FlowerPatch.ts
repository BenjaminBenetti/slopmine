import type { WorldManager } from '../../WorldManager.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'

export interface FlowerPatchParams {
  /** Number of flowers in this patch (typically 3-7) */
  flowerCount: number
  /** Which flower type to use */
  flowerType: BlockIds.RED_FLOWER | BlockIds.YELLOW_FLOWER | BlockIds.BLUE_FLOWER | BlockIds.PINK_FLOWER
}

/**
 * Flower patch structure generator.
 * Generates a small cluster of flowers on the ground.
 * Flowers always spawn in groups and use random placement within a small area.
 */
export class FlowerPatch {
  /**
   * Place a flower patch at the given world coordinates.
   * Uses WorldManager.setBlock() to place blocks, which handles
   * cross-chunk placement automatically.
   *
   * @param world - WorldManager for block placement
   * @param centerX - World X of patch center
   * @param centerY - World Y of patch center (ground level + 1)
   * @param centerZ - World Z of patch center
   * @param params - Flower patch parameters
   * @param random - Random number generator function (0-1)
   */
  static place(
    world: WorldManager,
    centerX: bigint,
    centerY: bigint,
    centerZ: bigint,
    params: FlowerPatchParams,
    random: () => number
  ): void {
    const { flowerCount, flowerType } = params

    // Place flowers in a small cluster (3x3 area)
    const maxRadius = 2
    
    for (let i = 0; i < flowerCount; i++) {
      // Random offset within the patch area
      const offsetX = Math.floor(random() * (maxRadius * 2 + 1)) - maxRadius
      const offsetZ = Math.floor(random() * (maxRadius * 2 + 1)) - maxRadius
      
      const flowerX = centerX + BigInt(offsetX)
      const flowerY = centerY
      const flowerZ = centerZ + BigInt(offsetZ)

      // Check if location is valid (air block on grass/dirt)
      const groundBlock = world.getBlockId(flowerX, flowerY - 1n, flowerZ)
      const targetBlock = world.getBlockId(flowerX, flowerY, flowerZ)
      
      if (
        (groundBlock === BlockIds.GRASS || groundBlock === BlockIds.DIRT) &&
        targetBlock === BlockIds.AIR
      ) {
        world.setBlock(flowerX, flowerY, flowerZ, flowerType)
      }
    }
  }

  /**
   * Check if a flower patch can be placed at the given location.
   * Ensures the center position is on valid ground.
   */
  static canPlace(
    world: WorldManager,
    centerX: bigint,
    centerY: bigint,
    centerZ: bigint
  ): boolean {
    // Check ground is solid (grass or dirt)
    const groundBlock = world.getBlockId(centerX, centerY - 1n, centerZ)
    if (groundBlock !== BlockIds.GRASS && groundBlock !== BlockIds.DIRT) {
      return false
    }

    // Check center position is air
    if (world.getBlockId(centerX, centerY, centerZ) !== BlockIds.AIR) {
      return false
    }

    return true
  }
}
