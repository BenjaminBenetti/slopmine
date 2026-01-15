import type { IWorld } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import { BlockEntity } from '../../../../entities/BlockEntity.ts'

/**
 * Block entity for wheat growth.
 * Rolls dice every few seconds to potentially grow to the next stage.
 */
export class WheatBlockEntity extends BlockEntity {
  readonly type = 'wheat'

  private readonly world: IWorld
  private readonly nextBlockId: number
  private timer = 0
  private readonly growInterval = 60 // seconds
  private readonly growChance = 0.3 // 30% chance

  constructor(position: IWorldCoordinate, world: IWorld, nextBlockId: number) {
    super('wheat', position)
    this.world = world
    this.nextBlockId = nextBlockId
  }

  update(deltaTime: number): void {
    this.timer += deltaTime

    if (this.timer >= this.growInterval) {
      this.timer = 0

      // Roll dice for growth
      if (Math.random() < this.growChance) {
        this.grow()
      }
    }
  }

  private grow(): void {
    const { x, y, z } = this.blockPosition
    // Replace current block with next growth stage
    // This will cause the old entity to be removed and a new one created (if needed)
    this.world.setBlock(x, y, z, this.nextBlockId)
  }
}
