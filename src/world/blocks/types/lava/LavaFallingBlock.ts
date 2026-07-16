import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { LavaBlock } from './LavaBlock.ts'

/**
 * Falling lava - the mid-air column of a lavafall.
 * Looks and behaves like full lava, but is not a source: it persists only
 * while fed by lava directly above, and converts to a normal lava source
 * when it lands on solid ground.
 */
export class LavaFallingBlock extends LavaBlock {
  override readonly properties: IBlockProperties = {
    ...new LavaBlock().properties,
    id: BlockIds.LAVA_FALLING,
    name: 'lava_falling',
    isFallingLiquid: true,
  }
}
