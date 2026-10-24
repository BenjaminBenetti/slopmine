import { BlockEntity } from '../../../../entities/BlockEntity.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import { poiRegistry } from '../../../../pois/PoiRegistry.ts'

/**
 * Presence marker for a point of interest: created by the world for every
 * POI_KEYSTONE when its sub-chunk loads, removed with the sub-chunk or the
 * block. It only reports the point of interest (its kind is the keystone's
 * metadata) to the registry.
 */
export class PoiKeystoneBlockEntity extends BlockEntity {
  readonly type = 'poi_keystone'

  constructor(position: IWorldCoordinate, private readonly kindIndex: number) {
    super('poi_keystone', position)
  }

  onSpawn(): void {
    const { x, y, z } = this.blockPosition
    poiRegistry.onLoaded(this.id, Number(x), Number(y), Number(z), this.kindIndex)
  }

  onDespawn(): boolean {
    poiRegistry.onUnloaded(this.id)
    return true
  }
}
