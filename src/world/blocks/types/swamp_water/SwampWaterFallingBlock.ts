import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { SwampWaterBlock } from './SwampWaterBlock.ts'

/**
 * Falling swamp water - the mid-air column of a swamp waterfall.
 * Looks and behaves like full swamp water, but is not a source: it persists
 * only while fed by swamp water directly above, and converts to a normal
 * source when it lands on solid ground.
 */
export class SwampWaterFallingBlock extends SwampWaterBlock {
  override readonly properties: IBlockProperties = {
    ...new SwampWaterBlock().properties,
    id: BlockIds.SWAMP_WATER_FALLING,
    name: 'swamp_water_falling',
    isFallingLiquid: true,
  }
}
