import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock, SharedGeometry } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { RedFlowerBlockItem } from '../../../../items/blocks/red_flower/RedFlowerBlockItem.ts'
import redFlowerTexUrl from './assets/red_flower.webp'

const redFlowerTexture = loadBlockTexture(redFlowerTexUrl)

const redFlowerMaterial = new THREE.MeshLambertMaterial({
  map: redFlowerTexture,
  transparent: true,
  alphaTest: 0.1,
  side: THREE.DoubleSide,
})

export class RedFlowerBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.RED_FLOWER,
    name: 'red_flower',
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
    return redFlowerMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getDrops(): IItem[] {
    return [new RedFlowerBlockItem()]
  }
}
