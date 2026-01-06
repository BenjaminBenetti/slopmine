import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { CoalItem } from '../../../../items/ores/coal/CoalItem.ts'
import coalBlockTexUrl from './assets/coal_block.webp'

const coalBlockTexture = loadBlockTexture(coalBlockTexUrl)
const coalBlockMaterial = new THREE.MeshLambertMaterial({ map: coalBlockTexture })

export class CoalBlockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.COAL_BLOCK,
    name: 'coal_block',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 5.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.STONE],
  }

  protected getMaterials(): THREE.Material {
    return coalBlockMaterial
  }

  getDrops(): IItem[] {
    // Drop 1-3 coal
    const count = 1 + Math.floor(Math.random() * 3)
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) {
      drops.push(new CoalItem())
    }
    return drops
  }
}
