import { BlockEntity } from '../../../../entities/BlockEntity.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import { guardianSpawners } from '../../../../dungeons/GuardianSpawnerSystem.ts'

/**
 * Presence marker for an armed guardian spawner: created by the world for
 * every GUARDIAN_SPAWNER block when its sub-chunk loads (generated or from
 * persistence) or the block is placed, and removed with the sub-chunk or
 * when the block changes. It only reports load/unload to the
 * GuardianSpawnerSystem, which runs the activation logic in its own task.
 */
export class GuardianSpawnerBlockEntity extends BlockEntity {
  readonly type = 'guardian_spawner'

  constructor(position: IWorldCoordinate) {
    super('guardian_spawner', position)
  }

  onSpawn(): void {
    const { x, y, z } = this.blockPosition
    guardianSpawners.onSpawnerLoaded(Number(x), Number(y), Number(z), this.id)
  }

  onDespawn(): boolean {
    const { x, y, z } = this.blockPosition
    guardianSpawners.onSpawnerUnloaded(Number(x), Number(y), Number(z), this.id)
    return true
  }
}
