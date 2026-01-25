import { BlockEntity } from '../../../../entities/BlockEntity.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IWorld } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockFacing, getMetadataFacing, facingToDirection } from '../../BlockFacing.ts'
import { DiviningParticleManager } from '../../../../renderer/particles/DiviningParticleManager.ts'

/**
 * Block entity for the divining stick that detects caves (AIR blocks)
 * in the direction it's facing. When a cave is detected within 20 blocks,
 * spawns green particles at the stick's position.
 */
export class DiviningStickBlockEntity extends BlockEntity {
  readonly type = 'divining_stick_entity'

  private readonly world: IWorld
  private updateCount = 0
  private static readonly CHECK_INTERVAL = 60 // ~1 second at 60 UPS
  private static readonly MAX_DETECTION_DISTANCE = 20

  constructor(position: IWorldCoordinate, world: IWorld) {
    super('divining_stick_entity', position)
    this.world = world
  }

  /**
   * Called each frame to update the block entity.
   * Checks for caves every CHECK_INTERVAL updates.
   */
  update(deltaTime: number): void {
    this.updateCount++

    // Only check every CHECK_INTERVAL updates (~5 seconds)
    if (this.updateCount < DiviningStickBlockEntity.CHECK_INTERVAL) {
      return
    }

    this.updateCount = 0
    this.checkForCaves()
  }

  /**
   * Raycasts in the facing direction looking for AIR blocks (caves).
   * If found, spawns particles at the divining stick position.
   */
  private checkForCaves(): void {
    // Verify the block is still a divining stick (could have been broken)
    if (!this.world.getBlockId) {
      return
    }

    const blockId = this.world.getBlockId(
      this.blockPosition.x,
      this.blockPosition.y,
      this.blockPosition.z
    )

    if (blockId !== BlockIds.DIVINING_STICK) {
      return
    }

    // Get facing direction from metadata
    if (!this.world.getMetadata) {
      return
    }

    const metadata = this.world.getMetadata(
      this.blockPosition.x,
      this.blockPosition.y,
      this.blockPosition.z
    )

    const facing = getMetadataFacing(metadata)
    const rawDir = facingToDirection(facing)
    // The relationship between facing and tip direction depends on the rotation axis:
    // - Z axis (NORTH/SOUTH): tip points IN the facing direction (no negation)
    // - Y axis (UP/DOWN) and X axis (EAST/WEST): tip points OPPOSITE (needs negation)
    const isZAxis = facing === BlockFacing.NORTH || facing === BlockFacing.SOUTH
    const direction = isZAxis
      ? rawDir
      : { dx: -rawDir.dx, dy: -rawDir.dy, dz: -rawDir.dz }

    // Raycast up to MAX_DETECTION_DISTANCE blocks in pointing direction
    const startX = Number(this.blockPosition.x)
    const startY = Number(this.blockPosition.y)
    const startZ = Number(this.blockPosition.z)

    for (let dist = 1; dist <= DiviningStickBlockEntity.MAX_DETECTION_DISTANCE; dist++) {
      const checkX = BigInt(Math.floor(startX + direction.dx * dist))
      const checkY = BigInt(Math.floor(startY + direction.dy * dist))
      const checkZ = BigInt(Math.floor(startZ + direction.dz * dist))

      const checkBlockId = this.world.getBlockId(checkX, checkY, checkZ)

      // Found air (cave) - spawn particles and return
      if (checkBlockId === BlockIds.AIR) {
        DiviningParticleManager.instance.spawn(
          startX + 0.5, // Center of block
          startY + 0.5,
          startZ + 0.5
        )
        return
      }
    }

    // No cave found within range - no particles
  }
}
