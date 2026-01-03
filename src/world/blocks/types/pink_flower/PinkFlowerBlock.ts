import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock, SharedGeometry } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { PinkFlowerBlockItem } from '../../../../items/blocks/pink_flower/PinkFlowerBlockItem.ts'
import pinkFlowerTexUrl from './assets/pink_flower.webp'

const pinkFlowerTexture = loadBlockTexture(pinkFlowerTexUrl)

const pinkFlowerMaterial = new THREE.MeshLambertMaterial({
  map: pinkFlowerTexture,
  transparent: true,
  alphaTest: 0.1,
  side: THREE.DoubleSide,
})

export class PinkFlowerBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINK_FLOWER,
    name: 'pink_flower',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.0,
    lightLevel: 0,
    lightBlocking: 0,
  }

  protected getGeometry(): THREE.BufferGeometry {
    return SharedGeometry.cross
  }

  protected getMaterials(): THREE.Material {
    return pinkFlowerMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getDrops(): IItem[] {
    return [new PinkFlowerBlockItem()]
  }
}
