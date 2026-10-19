import { BlockEntity } from '../../../../entities/BlockEntity.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import { wardLanterns } from '../../../../nightfall/WardLanterns.ts'

/**
 * Presence marker for a Ward Lantern: created by the world for every
 * WARD_LANTERN block when its sub-chunk loads or the lantern is placed, and
 * removed with the sub-chunk or the block. It only reports itself to the
 * ward registry the night spawner consults.
 */
export class WardLanternBlockEntity extends BlockEntity {
  readonly type = 'ward_lantern'

  constructor(position: IWorldCoordinate) {
    super('ward_lantern', position)
  }

  onSpawn(): void {
    const { x, y, z } = this.blockPosition
    wardLanterns.onLoaded(Number(x), Number(y), Number(z), this.id)
  }

  onDespawn(): boolean {
    wardLanterns.onUnloaded(this.id)
    return true
  }
}
