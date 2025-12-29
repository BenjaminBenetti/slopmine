import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../interfaces/IBlock.ts'
import { BlockFace as Face } from '../../interfaces/IBlock.ts'
import { SolidBlock } from '../Block.ts'

export const GRASS_BLOCK_ID = 3

const GRASS_TOP_COLOR = 0x228B22    // Forest green
const GRASS_SIDE_COLOR = 0x567d46   // Green-brown mix
const DIRT_COLOR = 0x8B4513         // Brown

export class GrassBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: GRASS_BLOCK_ID,
    name: 'grass',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.6,
    lightLevel: 0,
    lightBlocking: 15,
  }

  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case Face.TOP:
        return 0
      case Face.BOTTOM:
        return 2
      default:
        return 1
    }
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      new THREE.MeshLambertMaterial({ color: GRASS_SIDE_COLOR }), // +X (right)
      new THREE.MeshLambertMaterial({ color: GRASS_SIDE_COLOR }), // -X (left)
      new THREE.MeshLambertMaterial({ color: GRASS_TOP_COLOR }),  // +Y (top)
      new THREE.MeshLambertMaterial({ color: DIRT_COLOR }),       // -Y (bottom)
      new THREE.MeshLambertMaterial({ color: GRASS_SIDE_COLOR }), // +Z (front)
      new THREE.MeshLambertMaterial({ color: GRASS_SIDE_COLOR }), // -Z (back)
    ]
  }
}
