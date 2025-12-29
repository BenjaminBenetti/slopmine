import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import stoneTexUrl from './assets/stone.webp'

const loader = new THREE.TextureLoader()
const stoneTexture = loader.load(stoneTexUrl)
stoneTexture.magFilter = THREE.NearestFilter
stoneTexture.minFilter = THREE.NearestFilter
stoneTexture.colorSpace = THREE.SRGBColorSpace

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
    return new THREE.MeshLambertMaterial({ map: stoneTexture })
  }
}
