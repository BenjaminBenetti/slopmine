import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { DirtBlockItem } from '../../../../items/blocks/dirt/DirtBlockItem.ts'
import grassTexUrl from './assets/grass.webp'
import dirtTexUrl from './assets/dirt.webp'
import grassDirtTexUrl from './assets/grass-dirt.webp'

const grassTexture = loadBlockTexture(grassTexUrl)
const dirtTexture = loadBlockTexture(dirtTexUrl)
const grassDirtTexture = loadBlockTexture(grassDirtTexUrl)

const grassMaterial = new THREE.MeshLambertMaterial({ map: grassTexture })
const dirtMaterial = new THREE.MeshLambertMaterial({ map: dirtTexture })
const grassDirtMaterial = new THREE.MeshLambertMaterial({ map: grassDirtTexture })

export class GrassBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GRASS,
    name: 'grass',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.3,
    lightLevel: 0,
    lightBlocking: 15,
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      grassDirtMaterial, // +X (right)
      grassDirtMaterial, // -X (left)
      grassMaterial,     // +Y (top)
      dirtMaterial,      // -Y (bottom)
      grassDirtMaterial, // +Z (front)
      grassDirtMaterial, // -Z (back)
    ]
  }

  getDrops(): IItem[] {
    // Grass drops dirt (like Minecraft)
    return [new DirtBlockItem()]
  }
}
