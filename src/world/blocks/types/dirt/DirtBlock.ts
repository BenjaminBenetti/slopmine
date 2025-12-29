import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import dirtTexUrl from './assets/dirt.webp'

const loader = new THREE.TextureLoader()
const dirtTexture = loader.load(dirtTexUrl)
dirtTexture.magFilter = THREE.NearestFilter
dirtTexture.minFilter = THREE.NearestFilter
dirtTexture.colorSpace = THREE.SRGBColorSpace

export class DirtBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.DIRT,
    name: 'dirt',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 15,
  }

  protected getMaterials(): THREE.Material {
    return new THREE.MeshLambertMaterial({ map: dirtTexture })
  }
}
