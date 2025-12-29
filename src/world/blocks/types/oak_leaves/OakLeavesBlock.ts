import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { OakLeavesBlockItem } from '../../../../items/blocks/oak_leaves/OakLeavesBlockItem.ts'
import oakLeavesTexUrl from './assets/oak-leaves.webp'

const oakLeavesTexture = loadBlockTexture(oakLeavesTexUrl)

const oakLeavesMaterial = new THREE.MeshLambertMaterial({
  map: oakLeavesTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class OakLeavesBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_LEAVES,
    name: 'oak_leaves',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.05,
    lightLevel: 0,
    lightBlocking: 1,
  }

  protected getMaterials(): THREE.Material {
    return oakLeavesMaterial
  }

  getDrops(): IItem[] {
    return [new OakLeavesBlockItem()]
  }
}
