import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
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
    demolitionForceRequired: 0,
    tags: [BlockTags.DIRT],
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

  /**
   * Return texture ID for each face for greedy meshing.
   * TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: return TextureId.GRASS_TOP   // TOP
      case 1: return TextureId.DIRT        // BOTTOM (same as dirt block)
      default: return TextureId.GRASS_SIDE // All sides
    }
  }

  getDrops(): IItem[] {
    // Grass drops dirt (like Minecraft)
    return [new DirtBlockItem()]
  }
}
