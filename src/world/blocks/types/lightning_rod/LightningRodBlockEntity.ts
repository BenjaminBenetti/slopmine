import { BlockEntity } from '../../../../entities/BlockEntity.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import { lightningRods } from '../../../../weather/LightningRods.ts'

/**
 * Presence marker for a lightning rod: created by the world for every
 * LIGHTNING_ROD block when its sub-chunk loads or the rod is placed, and
 * removed with the sub-chunk or the block. It only reports itself to the rod
 * registry lightning consults (weather/LightningRods.ts).
 */
export class LightningRodBlockEntity extends BlockEntity {
  readonly type = 'lightning_rod'

  constructor(position: IWorldCoordinate) {
    super('lightning_rod', position)
  }

  onSpawn(): void {
    const { x, y, z } = this.blockPosition
    lightningRods.onLoaded(Number(x), Number(y), Number(z), this.id)
  }

  onDespawn(): boolean {
    lightningRods.onUnloaded(this.id)
    return true
  }
}
