import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import grassTexUrl from './assets/grass.webp'
import dirtTexUrl from './assets/dirt.webp'

const loader = new THREE.TextureLoader()

const grassTexture = loader.load(grassTexUrl)
grassTexture.magFilter = THREE.NearestFilter
grassTexture.minFilter = THREE.NearestFilter
grassTexture.colorSpace = THREE.SRGBColorSpace

const dirtTexture = loader.load(dirtTexUrl)
dirtTexture.magFilter = THREE.NearestFilter
dirtTexture.minFilter = THREE.NearestFilter
dirtTexture.colorSpace = THREE.SRGBColorSpace

const grassMaterial = new THREE.MeshLambertMaterial({ map: grassTexture })
const dirtMaterial = new THREE.MeshLambertMaterial({ map: dirtTexture })

export class GrassBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GRASS,
    name: 'grass',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.6,
    lightLevel: 0,
    lightBlocking: 15,
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      dirtMaterial,  // +X (right)
      dirtMaterial,  // -X (left)
      grassMaterial, // +Y (top)
      dirtMaterial,  // -Y (bottom)
      dirtMaterial,  // +Z (front)
      dirtMaterial,  // -Z (back)
    ]
  }
}
