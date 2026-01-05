import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { GoldBlockItem } from '../../../../items/blocks/gold_block/GoldBlockItem.ts'
import goldBlockTexUrl from './assets/gold_block.webp'

const goldBlockTexture = loadBlockTexture(goldBlockTexUrl)
const goldBlockMaterial = new THREE.MeshLambertMaterial({ map: goldBlockTexture })

export class GoldBlockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GOLD_BLOCK,
    name: 'gold_block',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.METAL],
  }

  protected getMaterials(): THREE.Material {
    return goldBlockMaterial
  }

  getDrops(): IItem[] {
    return [new GoldBlockItem()]
  }
}
