import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { WaterBlock } from './WaterBlock.ts'

/**
 * Falling water - the mid-air column of a waterfall.
 * Looks and behaves like full water, but is not a source: it persists only
 * while fed by water directly above (cutting the stream drains it top-down),
 * and converts to a normal water source when it lands on solid ground so
 * the pool at the bottom of a waterfall forms and persists normally.
 */
export class WaterFallingBlock extends WaterBlock {
  override readonly properties: IBlockProperties = {
    ...new WaterBlock().properties,
    id: BlockIds.WATER_FALLING,
    name: 'water_falling',
    isFallingLiquid: true,
  }
}
