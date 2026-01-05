import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { DirtBlockItem } from '../../../../items/blocks/dirt/DirtBlockItem.ts'
import dirtTexUrl from './assets/dirt.webp'

const dirtTexture = loadBlockTexture(dirtTexUrl)
const dirtMaterial = new THREE.MeshLambertMaterial({ map: dirtTexture })

export class DirtBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.DIRT,
    name: 'dirt',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.DIRT],
  }

  protected getMaterials(): THREE.Material {
    return dirtMaterial
  }

  getDrops(): IItem[] {
    return [new DirtBlockItem()]
  }
}
