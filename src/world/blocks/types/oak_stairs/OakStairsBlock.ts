import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { OakStairsBlockItem } from '../../../../items/blocks/oak_stairs/OakStairsBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

// Reuse the oak planks texture (registered by the oak planks block module)
import oakPlanksTexUrl from '../oak_planks/assets/oak-planks.webp'

const oakPlanksTexture = loadBlockTexture(oakPlanksTexUrl)
const oakStairsMaterial = new THREE.MeshLambertMaterial({ map: oakPlanksTexture })

// Geometry centered around Y=0 (renderer adds +0.5).
// Step ascends toward -Z; front (+Z) is the low side.
const oakStairsGeometry = (() => {
  // Full-width bottom slab (y -0.5..0)
  const bottomSlab = new THREE.BoxGeometry(1, 0.5, 1)
  bottomSlab.translate(0, -0.25, 0)

  // Back-top box (y 0..0.5, z -0.5..0)
  const backTop = new THREE.BoxGeometry(1, 0.5, 0.5)
  backTop.translate(0, 0.25, -0.25)

  return mergeGeometries([bottomSlab, backTop], false)
})()

/**
 * Oak stairs - two merged boxes forming a step ascending toward -Z.
 * Facing rotation is handled automatically by the non-greedy instanced path.
 */
export class OakStairsBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_STAIRS,
    name: 'oak_stairs',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.OAK_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return oakStairsGeometry
  }

  protected getMaterials(): THREE.Material {
    return oakStairsMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    // v1 approximation: slab-height collision, upper step is visual-only
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0.5, 1)
    )
  }



  /**
   * True stepped collision: bottom slab plus the raised back half, so
   * auto step-up can climb staircases one half-step at a time.
   * Canonical orientation (facing SOUTH): step ascends toward -Z (back).
   */
  getCollisionBoxes(): THREE.Box3[] {
    return [
      new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.5, 1)),
      new THREE.Box3(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(1, 1, 0.5)),
    ]
  }
  /**
   * Placement can flip this block upside down (metadata bit 4).
   */
  supportsVerticalFlip(): boolean {
    return true
  }
  getDrops(): IItem[] {
    return [new OakStairsBlockItem()]
  }
}
