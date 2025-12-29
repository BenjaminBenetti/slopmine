import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import oakLogTexUrl from './assets/oak-log.webp'
import oakLogTopTexUrl from './assets/oak-log-top.webp'

const loader = new THREE.TextureLoader()

const oakLogTexture = loader.load(oakLogTexUrl)
oakLogTexture.magFilter = THREE.NearestFilter
oakLogTexture.minFilter = THREE.NearestFilter
oakLogTexture.colorSpace = THREE.SRGBColorSpace

const oakLogTopTexture = loader.load(oakLogTopTexUrl)
oakLogTopTexture.magFilter = THREE.NearestFilter
oakLogTopTexture.minFilter = THREE.NearestFilter
oakLogTopTexture.colorSpace = THREE.SRGBColorSpace

const oakLogMaterial = new THREE.MeshLambertMaterial({ map: oakLogTexture })
const oakLogTopMaterial = new THREE.MeshLambertMaterial({ map: oakLogTopTexture })

export class OakLogBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_LOG,
    name: 'oak_log',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      oakLogMaterial,    // +X (right) - bark
      oakLogMaterial,    // -X (left) - bark
      oakLogTopMaterial, // +Y (top) - log end
      oakLogTopMaterial, // -Y (bottom) - log end
      oakLogMaterial,    // +Z (front) - bark
      oakLogMaterial,    // -Z (back) - bark
    ]
  }
}
