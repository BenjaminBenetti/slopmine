import type * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { polishedAbyssalStoneMaterial } from '../polished_abyssal_stone/PolishedAbyssalStoneBlock.ts'
import { PolishedAbyssalStoneBlockItem } from '../../../../items/blocks/polished_abyssal_stone/PolishedAbyssalStoneBlockItem.ts'

/**
 * Sanctum tile - the floors, plinth and trim of the Prism Sanctum. Looks like
 * polished abyssal stone (shares its texture layer) but is a dungeon
 * structural block: force 6, very hard. Breaks into polished abyssal stone.
 */
export class SanctumTileBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SANCTUM_TILE,
    name: 'sanctum_tile',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 200.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.POLISHED_ABYSSAL_STONE
  }

  protected getMaterials(): THREE.Material {
    return polishedAbyssalStoneMaterial
  }

  getDrops(): IItem[] {
    return [new PolishedAbyssalStoneBlockItem()]
  }
}
