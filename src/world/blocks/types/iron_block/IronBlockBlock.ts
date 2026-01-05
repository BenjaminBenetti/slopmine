import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { IronBlockItem } from '../../../../items/blocks/iron_block/IronBlockItem.ts'
import ironBlockTexUrl from './assets/iron_block.webp'

const ironBlockTexture = loadBlockTexture(ironBlockTexUrl)
const ironBlockMaterial = new THREE.MeshLambertMaterial({ map: ironBlockTexture })

export class IronBlockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.IRON_BLOCK,
    name: 'iron_block',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 5.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.METAL],
  }

  protected getMaterials(): THREE.Material {
    return ironBlockMaterial
  }

  getDrops(): IItem[] {
    return [new IronBlockItem()]
  }
}
