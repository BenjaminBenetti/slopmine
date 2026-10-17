import { BlockEntity } from '../../../../entities/BlockEntity.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import { garrisonSpawners } from '../../../../dungeons/GarrisonSpawnerSystem.ts'

/**
 * Presence marker for a garrison spawner: created with its sub-chunk
 * (generated or loaded) or when the block is placed, removed with the
 * sub-chunk or when the block changes. It only reports load/unload to the
 * GarrisonSpawnerSystem, which fields the garrison in its own task.
 */
export class GarrisonSpawnerBlockEntity extends BlockEntity {
  readonly type = 'garrison_spawner'

  constructor(position: IWorldCoordinate) {
    super('garrison_spawner', position)
  }

  onSpawn(): void {
    const { x, y, z } = this.blockPosition
    garrisonSpawners.onSpawnerLoaded(Number(x), Number(y), Number(z), this.id)
  }

  onDespawn(): boolean {
    const { x, y, z } = this.blockPosition
    garrisonSpawners.onSpawnerUnloaded(Number(x), Number(y), Number(z), this.id)
    return true
  }
}
