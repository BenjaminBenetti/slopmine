import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import stoneTexUrl from './assets/stone.webp'

const stoneTexture = loadBlockTexture(stoneTexUrl)
const stoneMaterial = new THREE.MeshLambertMaterial({ map: stoneTexture })

export class StoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.STONE,
    name: 'stone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
  }

  protected getMaterials(): THREE.Material {
    return stoneMaterial
  }
}
