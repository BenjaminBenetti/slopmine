import type { IBlockState } from '../../../blockstate/interfaces/IBlockState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'

/**
 * Runtime state of a placed Hellforge.
 *
 * The Hellforge crafts straight from the player's inventory (see
 * src/hellforge/HellforgeUI.ts), so it holds nothing: the state exists only
 * because block UIs open on a block state. Nothing is ever persisted.
 */
export class HellforgeState implements IBlockState {
  readonly position: IWorldCoordinate
  readonly stateType = 'hellforge'

  constructor(position: IWorldCoordinate) {
    this.position = position
  }

  hasData(): boolean {
    return false
  }

  serialize(): undefined {
    return undefined
  }

  deserialize(_data: unknown): void {
    // Nothing stored
  }
}
