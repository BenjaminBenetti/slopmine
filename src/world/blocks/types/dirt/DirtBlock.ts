import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
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
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 15,
  }

  protected getMaterials(): THREE.Material {
    return dirtMaterial
  }
}
