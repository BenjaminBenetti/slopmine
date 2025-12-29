import type { IBlockProperties } from '../../interfaces/IBlock.ts'
import { SolidBlock } from '../Block.ts'

export const STONE_BLOCK_ID = 1

export class StoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: STONE_BLOCK_ID,
    name: 'stone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
  }

  protected getColor(): number {
    return 0x808080 // Gray
  }
}
