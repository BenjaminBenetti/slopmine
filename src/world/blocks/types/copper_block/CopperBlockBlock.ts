import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { CopperOreItem } from '../../../../items/ores/copper/CopperOreItem.ts'
import copperBlockTexUrl from './assets/copper_block.webp'

const copperBlockTexture = loadBlockTexture(copperBlockTexUrl)
const copperBlockMaterial = new THREE.MeshLambertMaterial({ map: copperBlockTexture })

export class CopperBlockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.COPPER_BLOCK,
    name: 'copper_block',
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
    return copperBlockMaterial
  }

  getDrops(): IItem[] {
    // Drop 2-3 copper ore
    const count = 2 + Math.floor(Math.random() * 2)
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) {
      drops.push(new CopperOreItem())
    }
    return drops
  }
}
