import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock, SharedGeometry } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { BlueFlowerBlockItem } from '../../../../items/blocks/blue_flower/BlueFlowerBlockItem.ts'
import blueFlowerTexUrl from './assets/blue_flower.webp'

const blueFlowerTexture = loadBlockTexture(blueFlowerTexUrl)

const blueFlowerMaterial = new THREE.MeshLambertMaterial({
  map: blueFlowerTexture,
  transparent: true,
  alphaTest: 0.1,
  side: THREE.DoubleSide,
})

export class BlueFlowerBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BLUE_FLOWER,
    name: 'blue_flower',
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
    return blueFlowerMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getDrops(): IItem[] {
    return [new BlueFlowerBlockItem()]
  }
}
