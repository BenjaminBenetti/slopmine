import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { InfernalBrickStairsBlockItem } from '../../../../items/blocks/infernal_brick_stairs/InfernalBrickStairsBlockItem.ts'
// Reuse the infernal bricks texture (no texture-array layer: custom geometry)
import infernalBricksTexUrl from '../infernal_bricks/assets/infernal-bricks.webp'

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(infernalBricksTexUrl) })

// Step ascending toward -Z (front +Z is the low side), centred on Y = 0
const geometry = (() => {
  const bottom = new THREE.BoxGeometry(1, 0.5, 1)
  bottom.translate(0, -0.25, 0)
  const backTop = new THREE.BoxGeometry(1, 0.5, 0.5)
  backTop.translate(0, 0.25, -0.25)
  return mergeGeometries([bottom, backTop], false)
})()

/**
 * Infernal brick stairs: the Infernal Bastion's stairways, sills and roof
 * edges. Structural dungeon block (force 6); facing and upside-down
 * placement from metadata like every stair.
 */
export class InfernalBrickStairsBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_BRICK_STAIRS,
    name: 'infernal_brick_stairs',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 0,
    blocksVerticalLight: true,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_BRICKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.5, 1))
  }

  /** Bottom slab plus the raised back half (canonical: facing SOUTH, step toward -Z). */
  getCollisionBoxes(): THREE.Box3[] {
    return [
      new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.5, 1)),
      new THREE.Box3(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(1, 1, 0.5)),
    ]
  }

  supportsVerticalFlip(): boolean {
    return true
  }

  getDrops(): IItem[] {
    return [new InfernalBrickStairsBlockItem()]
  }
}
