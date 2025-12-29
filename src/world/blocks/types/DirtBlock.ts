import type { IBlockProperties } from '../../interfaces/IBlock.ts'
import { SolidBlock } from '../Block.ts'

export const DIRT_BLOCK_ID = 2

export class DirtBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: DIRT_BLOCK_ID,
    name: 'dirt',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 15,
  }

  protected getColor(): number {
    return 0x8B4513 // Brown
  }
}
