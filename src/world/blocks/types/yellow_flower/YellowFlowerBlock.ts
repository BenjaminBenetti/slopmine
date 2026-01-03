import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock, SharedGeometry } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { YellowFlowerBlockItem } from '../../../../items/blocks/yellow_flower/YellowFlowerBlockItem.ts'
import yellowFlowerTexUrl from './assets/yellow_flower.webp'

const yellowFlowerTexture = loadBlockTexture(yellowFlowerTexUrl)

const yellowFlowerMaterial = new THREE.MeshLambertMaterial({
  map: yellowFlowerTexture,
  transparent: true,
  alphaTest: 0.1,
  side: THREE.DoubleSide,
})

export class YellowFlowerBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.YELLOW_FLOWER,
    name: 'yellow_flower',
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
    return yellowFlowerMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getDrops(): IItem[] {
    return [new YellowFlowerBlockItem()]
  }
}
