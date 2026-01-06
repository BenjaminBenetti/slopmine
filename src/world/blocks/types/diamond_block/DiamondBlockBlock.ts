import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { DiamondItem } from '../../../../items/ores/diamond/DiamondItem.ts'
import diamondBlockTexUrl from './assets/diamond_block.webp'

const diamondBlockTexture = loadBlockTexture(diamondBlockTexUrl)
const diamondBlockMaterial = new THREE.MeshLambertMaterial({ map: diamondBlockTexture })

export class DiamondBlockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.DIAMOND_BLOCK,
    name: 'diamond_block',
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
    return diamondBlockMaterial
  }

  getDrops(): IItem[] {
    // Diamond always drops exactly 1
    return [new DiamondItem()]
  }
}
